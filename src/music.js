/* ═══════════════════════════════════════════
   🎵 Abigail Music Engine v2 — play-dl + @discordjs/voice
   ═══════════════════════════════════════════
   No DisTube! Uses play-dl for search/stream
   @discordjs/voice for VC connection
   Interactive button controls • Dark-themed cinematic embeds
   ═══════════════════════════════════════════ */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
  entersState,
} = require('@discordjs/voice');

/* ═══════════════════════════════════════════
   🎨 Theme Constants
   ═══════════════════════════════════════════ */

const MUSIC_COLORS = {
  PRIMARY: 0x1DB954,
  SECONDARY: 0x191414,
  ACCENT: 0xB3B3B3,
  PLAYING: 0x1DB954,
  PAUSED: 0xF39C12,
  ERROR: 0xE74C3C,
  QUEUE: 0x5865F2,
  SEARCH: 0x9B59B6,
  VOLUME: 0xE91E63,
  SUCCESS: 0x2ECC71,
  WARNING: 0xF39C12,
  GOLD: 0xFFD700,
};

const MUSIC_EMOJIS = {
  play: '▶️', pause: '⏸️', skip: '⏭️', stop: '⏹️',
  queue: '📋', volume: '🔊', mute: '🔇', loop: '🔁',
  shuffle: '🔀', nowplaying: '🎵', search: '🔍',
  lyrics: '📝', playlist: '📀', prev: '⏮️',
  music: '🎶', mic: '🎤', headphone: '🎧',
  disc: '💿', radio: '📻', wave: '🌊',
  fire: '🔥', star: '⭐', heart: '💜',
  note: '🎼', vip: '👑', dj: '🎧',
};

const NOW_PLAYING_MESSAGES = [
  'Now vibing to', 'Dropping the beat with', 'Spinning up',
  'Get ready for', 'Time to jam with', 'Your ears are blessed with',
  'The stage is set for', 'DJ Abigail presents', 'In the mix:', 'Let\'s groove to',
];

const LOOP_LABELS = { 0: 'Off', 1: 'Track', 2: 'Queue' };

/* ═══════════════════════════════════════════
   🗂️ Music State — Per-Guild Queues
   ═══════════════════════════════════════════ */

const guildQueues = new Map();  // guildId -> GuildQueue

class GuildQueue {
  constructor(guildId) {
    this.guildId = guildId;
    this.songs = [];           // Array of song objects
    this.currentIndex = -1;    // Current playing index
    this.connection = null;    // VoiceConnection
    this.player = null;        // AudioPlayer
    this.textChannel = null;   // Text channel for messages
    this.volume = 50;          // 0-150
    this.loopMode = 0;         // 0=off, 1=track, 2=queue
    this.paused = false;
    this.playing = false;
    this.nowPlayingMsg = null; // Last now-playing message
    this.resource = null;      // Current audio resource
  }

  get currentSong() {
    return this.songs[this.currentIndex] || null;
  }

  get queueLength() {
    return this.songs.length - this.currentIndex - 1;
  }
}

function getQueue(guildId) {
  return guildQueues.get(guildId);
}

function ensureQueue(guildId) {
  if (!guildQueues.has(guildId)) {
    guildQueues.set(guildId, new GuildQueue(guildId));
  }
  return guildQueues.get(guildId);
}

/* ═══════════════════════════════════════════
   🎵 play-dl Initialization
   ═══════════════════════════════════════════ */

let playdl = null;

async function initMusic(client) {
  try {
    playdl = require('play-dl');
    await playdl.setToken({
      spotify: {
        client_id: process.env.SPOTIFY_CLIENT_ID || undefined,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET || undefined,
        refresh_token: process.env.SPOTIFY_REFRESH_TOKEN || undefined,
        market: 'IN',
      },
    });
    console.log('✅ play-dl Music Engine initialized!');
    return true;
  } catch (err) {
    console.error('❌ Failed to initialize play-dl:', err.message);
    console.error('   Run: npm install play-dl @discordjs/voice');
    return null;
  }
}

/* ═══════════════════════════════════════════
   🔊 Audio Playback Engine
   ═══════════════════════════════════════════ */

async function connectToVC(voiceChannel) {
  const existing = getVoiceConnection(voiceChannel.guild.id);
  if (existing) return existing;

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    return connection;
  } catch (err) {
    connection.destroy();
    throw new Error('Could not connect to voice channel within 15 seconds. Check bot permissions!');
  }
}

function createPlayer(queue) {
  const player = createAudioPlayer();

  player.on(AudioPlayerStatus.Idle, async () => {
    queue.playing = false;
    queue.paused = false;

    // Song finished — play next based on loop mode
    if (queue.loopMode === 1) {
      // Track loop — replay current
      await playSong(queue);
    } else if (queue.loopMode === 2) {
      // Queue loop — advance and loop
      queue.currentIndex = (queue.currentIndex + 1) % queue.songs.length;
      await playSong(queue);
    } else {
      // No loop — advance
      queue.currentIndex++;
      if (queue.currentIndex < queue.songs.length) {
        await playSong(queue);
      } else {
        // Queue finished
        await sendQueueFinished(queue);
      }
    }
  });

  player.on('error', async (error) => {
    console.error('AudioPlayer error:', error.message);
    if (queue.textChannel) {
      try {
        await queue.textChannel.send({
          embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
            .setAuthor({ name: `${MUSIC_EMOJIS.fire} Playback Error` })
            .setDescription(`❌ Error playing **${truncate(queue.currentSong?.name || 'song', 40)}**\n\`${truncate(error.message, 150)}\`\n\n⏭️ Skipping to next song...`)
            .setTimestamp()],
        });
      } catch (e) {}
    }
    // Skip to next
    queue.currentIndex++;
    if (queue.currentIndex < queue.songs.length) {
      await playSong(queue);
    } else {
      await sendQueueFinished(queue);
    }
  });

  return player;
}

async function playSong(queue) {
  const song = queue.currentSong;
  if (!song) {
    await sendQueueFinished(queue);
    return;
  }

  try {
    // Get stream from play-dl
    let stream;

    if (song.type === 'spotify') {
      // For Spotify, search YouTube with the same song info
      const ytSearch = `${song.artist} ${song.name} official`;
      const ytResults = await playdl.search(ytSearch, { limit: 1 });
      if (!ytResults || ytResults.length === 0) {
        throw new Error('Could not find YouTube equivalent for Spotify track');
      }
      stream = await playdl.stream(ytResults[0].url);
    } else {
      stream = await playdl.stream(song.url);
    }

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });

    // Set volume
    resource.volume.setVolume(queue.volume / 100);

    if (!queue.player) {
      queue.player = createPlayer(queue);
    }

    queue.player.play(resource);
    queue.resource = resource;
    queue.playing = true;
    queue.paused = false;

    // Connect player to voice if not already
    if (queue.connection && queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      queue.connection.subscribe(queue.player);
    }

    // Send now playing embed
    await sendNowPlaying(queue);
  } catch (err) {
    console.error('playSong error:', err.message);
    if (queue.textChannel) {
      try {
        await queue.textChannel.send({
          embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
            .setAuthor({ name: `${MUSIC_EMOJIS.fire} Stream Error` })
            .setDescription(`❌ Could not play **${truncate(song.name, 40)}**\n\`${truncate(err.message, 150)}\`\n\n⏭️ Skipping...`)
            .setTimestamp()],
        });
      } catch (e) {}
    }
    // Try next
    queue.currentIndex++;
    if (queue.currentIndex < queue.songs.length) {
      await playSong(queue);
    }
  }
}

/* ═══════════════════════════════════════════
   📤 Embed Senders
   ═══════════════════════════════════════════ */

async function sendNowPlaying(queue) {
  const song = queue.currentSong;
  if (!song || !queue.textChannel) return;

  try {
    // Delete old now-playing message
    if (queue.nowPlayingMsg) {
      try { await queue.nowPlayingMsg.delete(); } catch (e) {}
    }

    const npMsg = NOW_PLAYING_MESSAGES[Math.floor(Math.random() * NOW_PLAYING_MESSAGES.length)];
    const progressBar = '▬'.repeat(2) + '🔵' + '▬'.repeat(17);

    const embed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.PLAYING)
      .setAuthor({ name: `${MUSIC_EMOJIS.dj} ${npMsg}`, iconURL: song.thumbnail || null })
      .setTitle(`${MUSIC_EMOJIS.music} ${truncate(song.name, 60)}`)
      .setURL(song.url || null)
      .setThumbnail(song.thumbnail || null)
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ ${MUSIC_EMOJIS.mic} **Artist:** ${song.artist || 'Unknown'}\n` +
        `┣ ⏱️ **Duration:** ${song.duration || 'Live'}\n` +
        `┣ 🔊 **Volume:** ${queue.volume}%\n` +
        `┣ 🔁 **Loop:** ${LOOP_LABELS[queue.loopMode]}\n` +
        `┣ 👤 **Requested by:** ${song.requestedBy || 'Unknown'}\n` +
        `┗ 📋 **Queue:** ${queue.queueLength} song${queue.queueLength !== 1 ? 's' : ''} left\n\n` +
        `${progressBar}\n` +
        `\`00:00\` ────────────── \`${song.duration || '∞'}\``
      )
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | Use buttons to control` })
      .setTimestamp();

    const components = getNowPlayingButtons(queue.guildId);
    queue.nowPlayingMsg = await queue.textChannel.send({ embeds: [embed], components });
  } catch (e) {
    console.error('sendNowPlaying error:', e.message);
  }
}

async function sendQueueFinished(queue) {
  if (!queue.textChannel) return;
  try {
    const embed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.ACCENT)
      .setAuthor({ name: `${MUSIC_EMOJIS.music} Queue Finished!` })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ 🏁 All songs have been played!\n` +
        `┗ 💜 Use \`/music play\` to start a new session!`
      )
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
      .setTimestamp();
    await queue.textChannel.send({ embeds: [embed] });
  } catch (e) {}
}

/* ═══════════════════════════════════════════
   🎛️ Button Builders
   ═══════════════════════════════════════════ */

function getNowPlayingButtons(guildId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mu_prev_${guildId}`).setLabel('⏮️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mu_pause_${guildId}`).setLabel('⏸️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`mu_skip_${guildId}`).setLabel('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mu_stop_${guildId}`).setLabel('⏹️').setStyle(ButtonStyle.Danger),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mu_queue_${guildId}`).setLabel('📋 Queue').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mu_loop_${guildId}`).setLabel('🔁 Loop').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`mu_shuffle_${guildId}`).setLabel('🔀 Shuffle').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`mu_vol_${guildId}`).setLabel('🔊 Vol').setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2];
}

function getVolumeButtons(guildId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mu_v10_${guildId}`).setLabel('🔈 10%').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mu_v25_${guildId}`).setLabel('🔉 25%').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`mu_v50_${guildId}`).setLabel('🔊 50%').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`mu_v75_${guildId}`).setLabel('📢 75%').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mu_v100_${guildId}`).setLabel('💥 100%').setStyle(ButtonStyle.Danger),
  )];
}

function getSearchResultButtons(searchId, count) {
  const rows = [];
  const maxResults = Math.min(count, 10);

  for (let i = 0; i < maxResults; i += 5) {
    const row = new ActionRowBuilder();
    for (let j = i; j < Math.min(i + 5, maxResults); j++) {
      const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][j];
      row.addComponents(
        new ButtonBuilder().setCustomId(`mu_s${j}_${searchId}`).setLabel(`${numEmoji}`).setStyle(ButtonStyle.Primary)
      );
    }
    rows.push(row);
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mu_scancel_${searchId}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
  ));
  return rows;
}

/* ═══════════════════════════════════════════
   🔍 Song Search & URL Parser
   ═══════════════════════════════════════════ */

const searchState = new Map(); // searchId -> { results, userId, timestamp }

async function resolveSong(query, user) {
  if (!playdl) throw new Error('Music engine not initialized');

  // Check if it's a URL
  const isUrl = query.startsWith('http://') || query.startsWith('https://');

  if (isUrl) {
    // Check Spotify URL
    if (query.includes('spotify.com')) {
      return await resolveSpotifyUrl(query, user);
    }

    // Check YouTube playlist
    if (query.includes('youtube.com') && query.includes('list=')) {
      return await resolveYouTubePlaylist(query, user);
    }

    // YouTube video URL — get info
    try {
      const info = await playdl.video_info(query);
      const details = info.video_details;
      return [{
        name: details.title || 'Unknown',
        url: details.url || query,
        artist: details.channel?.name || 'Unknown',
        duration: details.durationRaw || formatDuration(details.durationInSec),
        durationSec: details.durationInSec || 0,
        thumbnail: details.thumbnails?.[0]?.url || null,
        type: 'youtube',
        requestedBy: user?.toString() || 'Unknown',
      }];
    } catch (err) {
      // Fallback: search by URL
      const results = await playdl.search(query, { limit: 1 });
      if (results.length === 0) throw new Error('No results found');
      return [formatPlayDlResult(results[0], user)];
    }
  }

  // Text search — search YouTube
  const results = await playdl.search(query, { limit: 10 });
  if (results.length === 0) throw new Error('No results found for: ' + query);
  return results.map(r => formatPlayDlResult(r, user));
}

async function resolveSpotifyUrl(url, user) {
  try {
    if (url.includes('/track/')) {
      const sp = await playdl.spotify(url);
      return [{
        name: sp.name || 'Unknown',
        url: sp.url || url,
        artist: sp.artist?.map(a => a.name).join(', ') || 'Unknown',
        duration: formatDuration(sp.durationInSec),
        durationSec: sp.durationInSec || 0,
        thumbnail: sp.thumbnail?.url || null,
        type: 'spotify',
        requestedBy: user?.toString() || 'Unknown',
      }];
    }

    if (url.includes('/playlist/') || url.includes('/album/')) {
      const sp = await playdl.spotify(url);
      const songs = [];
      const fetchedTracks = sp.fetched_tracks || {};

      for (const [, tracks] of Object.entries(fetchedTracks)) {
        for (const t of tracks) {
          songs.push({
            name: t.name || 'Unknown',
            url: t.url || url,
            artist: t.artist?.map(a => a.name).join(', ') || 'Unknown',
            duration: formatDuration(t.durationInSec),
            durationSec: t.durationInSec || 0,
            thumbnail: t.thumbnail?.url || null,
            type: 'spotify',
            requestedBy: user?.toString() || 'Unknown',
          });
        }
      }
      return songs;
    }

    throw new Error('Unsupported Spotify URL type');
  } catch (err) {
    throw new Error('Could not resolve Spotify URL: ' + err.message);
  }
}

async function resolveYouTubePlaylist(url, user) {
  try {
    const playlist = await playdl.playlist_info(url);
    if (!playlist) throw new Error('Playlist not found');

    const videos = playlist.videos || [];
    return videos.map(v => ({
      name: v.title || v.name || 'Unknown',
      url: v.url,
      artist: v.channel?.name || 'Unknown',
      duration: v.durationRaw || formatDuration(v.durationInSec),
      durationSec: v.durationInSec || 0,
      thumbnail: v.thumbnails?.[0]?.url || null,
      type: 'youtube',
      requestedBy: user?.toString() || 'Unknown',
    }));
  } catch (err) {
    throw new Error('Could not resolve YouTube playlist: ' + err.message);
  }
}

function formatPlayDlResult(r, user) {
  return {
    name: r.title || 'Unknown',
    url: r.url,
    artist: r.channel?.name || 'Unknown',
    duration: r.durationRaw || formatDuration(r.durationInSec),
    durationSec: r.durationInSec || 0,
    thumbnail: r.thumbnails?.[0]?.url || null,
    type: 'youtube',
    requestedBy: user?.toString() || 'Unknown',
  };
}

/* ═══════════════════════════════════════════
   🎵 Command Handlers
   ═══════════════════════════════════════════ */

async function handlePlay(interaction) {
  if (!playdl) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.fire} Music Not Available` })
        .setDescription('Music system is not initialized. Contact the bot owner!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const query = interaction.options.getString('song');
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.headphone} Join a Voice Channel!` })
        .setDescription('━━━━━━━━━━━━━━━━━━━\n┣ ❌ You need to be in a voice channel!\n┗ 💡 Join a VC and try again!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const permissions = voiceChannel.permissionsFor(interaction.client.user);
  if (!permissions.has('Connect') || !permissions.has('Speak')) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.fire} Missing Permissions` })
        .setDescription('━━━━━━━━━━━━━━━━━━━\n┣ ❌ I need **Connect** and **Speak** permissions!\n┗ 💡 Check channel permissions!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  try {
    const songs = await resolveSong(query, interaction.user);
    const queue = ensureQueue(interaction.guild.id);
    queue.textChannel = interaction.channel;

    const isFirstSong = queue.songs.length === 0;

    // Add songs to queue
    queue.songs.push(...songs);

    // Connect to voice if needed
    if (!queue.connection || queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
      queue.connection = await connectToVC(voiceChannel);
    }

    const isUrl = query.startsWith('http');

    if (songs.length === 1) {
      const song = songs[0];
      if (isFirstSong) {
        queue.currentIndex = 0;
        await playSong(queue);
        const searchEmbed = new EmbedBuilder()
          .setColor(MUSIC_COLORS.SEARCH)
          .setAuthor({ name: `${MUSIC_EMOJIS.search} Loading` })
          .setDescription(`━━━━━━━━━━━━━━━━━━━\n┣ 🎵 **${truncate(song.name, 50)}**\n┗ ⏳ Buffering...`)
          .setTimestamp();
        await interaction.editReply({ embeds: [searchEmbed] });
      } else {
        const embed = new EmbedBuilder()
          .setColor(MUSIC_COLORS.SUCCESS)
          .setAuthor({ name: `${MUSIC_EMOJIS.music} Added to Queue`, iconURL: song.thumbnail || null })
          .setTitle(truncate(song.name, 55))
          .setURL(song.url || null)
          .setThumbnail(song.thumbnail || null)
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ ${MUSIC_EMOJIS.mic} **${song.artist}**\n` +
            `┣ ⏱️ **${song.duration}**\n` +
            `┣ 📋 **Position:** #${queue.songs.length - 1}\n` +
            `┗ 👤 **${song.requestedBy}**`
          )
          .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | ${queue.queueLength} in queue` })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      }
    } else {
      // Multiple songs (playlist)
      if (isFirstSong) {
        queue.currentIndex = 0;
        await playSong(queue);
      }
      const embed = new EmbedBuilder()
        .setColor(MUSIC_COLORS.GOLD)
        .setAuthor({ name: `${MUSIC_EMOJIS.playlist} ${songs.length} Songs Added!` })
        .setDescription(
          `━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 📀 **${songs.length} songs** added to queue!\n` +
          `┣ 📋 **Queue:** ${queue.songs.length} total\n` +
          `┗ 🎶 Let the party begin!`
        )
        .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    console.error('Music play error:', err.message);
    const errorEmbed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.ERROR)
      .setAuthor({ name: `${MUSIC_EMOJIS.fire} Playback Error` })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ ❌ **Error:** ${truncate(err.message, 200)}\n` +
        `┗ 💡 Try a different search or paste a YouTube URL!`
      )
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
      .setTimestamp();

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleSearch(interaction) {
  if (!playdl) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Music not available!').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  const query = interaction.options.getString('query');
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.headphone} Join a Voice Channel!` })
        .setDescription('You need to be in a VC to search & play music!').setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  try {
    const results = await playdl.search(query, { limit: 10 });
    if (!results || results.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
          .setAuthor({ name: `${MUSIC_EMOJIS.search} No Results` })
          .setDescription(`No songs found for **"${truncate(query, 40)}"**!`).setTimestamp()],
      });
    }

    const searchId = `${interaction.guild.id}_${Date.now()}`;
    const formatted = results.map(r => formatPlayDlResult(r, interaction.user));
    searchState.set(searchId, { results: formatted, userId: interaction.user.id, timestamp: Date.now(), voiceChannel, textChannel: interaction.channel });

    let desc = `━━━━━━━━━━━━━━━━━━━\n`;
    for (let i = 0; i < formatted.length; i++) {
      const s = formatted[i];
      const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][i];
      desc += `${numEmoji} **${truncate(s.name, 50)}**\n   ┣ ${s.artist} • ${s.duration}\n\n`;
    }

    const searchEmbed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.SEARCH)
      .setAuthor({ name: `${MUSIC_EMOJIS.search} Results for "${truncate(query, 30)}"` })
      .setDescription(desc)
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | Click a button to play! | 30s timeout` })
      .setTimestamp();

    await interaction.editReply({ embeds: [searchEmbed], components: getSearchResultButtons(searchId, formatted.length) });

    setTimeout(() => searchState.delete(searchId), 30000);
  } catch (err) {
    console.error('Music search error:', err.message);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.fire} Search Error` })
        .setDescription(`❌ ${truncate(err.message, 200)}\n\n💡 Try pasting a YouTube URL instead!`).setTimestamp()],
    });
  }
}

async function handleSkip(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue || !queue.playing) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setAuthor({ name: `${MUSIC_EMOJIS.music} Nothing Playing` }).setDescription('No music is currently playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  const currentName = queue.currentSong?.name || 'Unknown';
  queue.currentIndex++;
  if (queue.currentIndex < queue.songs.length) {
    await playSong(queue);
  } else {
    queue.player?.stop();
    await sendQueueFinished(queue);
  }

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS)
      .setAuthor({ name: `${MUSIC_EMOJIS.skip} Skipped!` })
      .setDescription(`━━━━━━━━━━━━━━━━━━━\n┣ ⏭️ **Skipped:** ${truncate(currentName, 50)}\n┗ ▶️ Playing next...`).setTimestamp()],
  });
}

async function handleStop(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  queue.player?.stop();
  queue.connection?.destroy();
  guildQueues.delete(interaction.guild.id);

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
      .setAuthor({ name: `${MUSIC_EMOJIS.stop} Music Stopped` })
      .setDescription('━━━━━━━━━━━━━━━━━━━\n┣ ⏹️ **Playback stopped!**\n┣ 🗑️ Queue cleared!\n┗ 👋 Left the voice channel').setTimestamp()],
  });
}

async function handlePause(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue || !queue.playing) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing is playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  if (queue.paused) {
    queue.player?.unpause();
    queue.paused = false;
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.PLAYING)
        .setAuthor({ name: `${MUSIC_EMOJIS.play} Resumed!` })
        .setDescription(`━━━━━━━━━━━━━━━━━━━\n┣ ▶️ **${truncate(queue.currentSong?.name || 'Unknown', 50)}** resumed!\n┗ 🎶 Keep vibing!`).setTimestamp()],
    });
  } else {
    queue.player?.pause();
    queue.paused = true;
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.PAUSED)
        .setAuthor({ name: `${MUSIC_EMOJIS.pause} Paused!` })
        .setDescription(`━━━━━━━━━━━━━━━━━━━\n┣ ⏸️ **${truncate(queue.currentSong?.name || 'Unknown', 50)}** paused!\n┗ 💡 Click ⏸️ button to resume!`).setTimestamp()],
    });
  }
}

async function handleQueue(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue || queue.songs.length === 0) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setAuthor({ name: `${MUSIC_EMOJIS.queue} Queue Empty` }).setDescription('No songs! Use `/music play` to add some!').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  const current = queue.currentSong;
  const upcoming = queue.songs.slice(queue.currentIndex + 1, queue.currentIndex + 11);

  let desc = `${MUSIC_EMOJIS.play} **NOW PLAYING:**\n`;
  desc += `┣ 🎵 **${truncate(current?.name || 'Unknown', 50)}**\n`;
  desc += `┣ ${current?.artist || 'Unknown'} • ${current?.duration || '∞'}\n`;
  desc += `┗ 👤 ${current?.requestedBy || 'Unknown'}\n\n`;

  if (upcoming.length > 0) {
    desc += `📋 **UP NEXT:**\n`;
    for (let i = 0; i < upcoming.length; i++) {
      desc += `**${i + 1}.** ${truncate(upcoming[i].name, 45)} • ${upcoming[i].duration}\n`;
    }
    if (queue.queueLength > 10) desc += `\n... +${queue.queueLength - 10} more`;
  } else {
    desc += `📋 No songs in queue!`;
  }

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.QUEUE)
      .setAuthor({ name: `${MUSIC_EMOJIS.queue} Music Queue` })
      .setDescription(desc)
      .addFields({ name: '📊 Stats', value: `**${queue.songs.length}** songs • 🔁 Loop: **${LOOP_LABELS[queue.loopMode]}** • 🔊 Volume: **${queue.volume}%**`, inline: true })
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` }).setTimestamp()],
  });
}

async function handleVolume(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  const volume = interaction.options.getInteger('level');
  if (volume === null) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.VOLUME)
        .setAuthor({ name: `${MUSIC_EMOJIS.volume} Volume Control` })
        .setDescription(`━━━━━━━━━━━━━━━━━━━\n┣ 🔊 **Current:** ${queue.volume}%\n┗ 👇 Click a button!`).setTimestamp()],
      components: getVolumeButtons(interaction.guild.id),
    });
  }

  if (volume < 1 || volume > 150) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Volume must be 1-150!').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  queue.volume = volume;
  if (queue.resource?.volume) queue.resource.volume.setVolume(volume / 100);

  const volEmoji = volume <= 10 ? '🔈' : volume <= 30 ? '🔉' : volume <= 70 ? '🔊' : volume <= 100 ? '📢' : '💥';
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.VOLUME)
      .setAuthor({ name: `${volEmoji} Volume Changed` })
      .setDescription(`━━━━━━━━━━━━━━━━━━━\n┣ ${volEmoji} **Volume:** ${volume}%\n┗ 🎵 Now playing at ${volume}%!`).setTimestamp()],
  });
}

async function handleNowPlaying(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue || !queue.currentSong) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  const song = queue.currentSong;
  const status = queue.paused ? '⏸️ Paused' : '▶️ Playing';

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(queue.paused ? MUSIC_COLORS.PAUSED : MUSIC_COLORS.PLAYING)
      .setAuthor({ name: `${MUSIC_EMOJIS.nowplaying} Now Playing`, iconURL: song.thumbnail || null })
      .setTitle(truncate(song.name, 60)).setURL(song.url || null)
      .setThumbnail(song.thumbnail || null)
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ ${MUSIC_EMOJIS.mic} **Artist:** ${song.artist}\n` +
        `┣ ⏱️ **Duration:** ${song.duration}\n` +
        `┣ ${status}\n` +
        `┣ 🔊 **Volume:** ${queue.volume}%\n` +
        `┣ 🔁 **Loop:** ${LOOP_LABELS[queue.loopMode]}\n` +
        `┣ 👤 **${song.requestedBy}**\n` +
        `┗ 📋 **Queue:** ${queue.queueLength} left`
      ).setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | ${status}` }).setTimestamp()],
    components: getNowPlayingButtons(interaction.guild.id),
  });
}

async function handleLoop(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });

  const mode = interaction.options.getString('mode') || 'toggle';
  let newMode;
  if (mode === 'toggle') newMode = (queue.loopMode + 1) % 3;
  else if (mode === 'off') newMode = 0;
  else if (mode === 'track') newMode = 1;
  else if (mode === 'queue') newMode = 2;

  queue.loopMode = newMode;
  const label = LOOP_LABELS[newMode];
  const emoji = newMode === 0 ? '➡️' : newMode === 1 ? '🔂' : '🔁';

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS)
      .setAuthor({ name: `${emoji} Loop: ${label}` })
      .setDescription(`━━━━━━━━━━━━━━━━━━━\n┣ ${emoji} **Loop Mode:** ${label}\n┗ ${newMode === 0 ? 'Looping disabled!' : newMode === 1 ? 'Current song will repeat!' : 'Entire queue will repeat!'}`).setTimestamp()],
  });
}

async function handleShuffle(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue || queue.songs.length < 3) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Need 3+ songs to shuffle!').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  // Shuffle songs after current index
  const current = queue.songs.slice(0, queue.currentIndex + 1);
  const upcoming = queue.songs.slice(queue.currentIndex + 1);
  for (let i = upcoming.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
  }
  queue.songs = [...current, ...upcoming];

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS)
      .setAuthor({ name: `${MUSIC_EMOJIS.shuffle} Queue Shuffled!` })
      .setDescription(`━━━━━━━━━━━━━━━━━━━\n┣ 🔀 **${upcoming.length}** songs shuffled!\n┗ 🎶 New order!`).setTimestamp()],
  });
}

async function handlePrevious(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue || queue.currentIndex <= 0) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.WARNING).setDescription('⚠️ No previous song!').setTimestamp()], flags: MessageFlags.Ephemeral });
  }
  queue.currentIndex -= 1;
  await playSong(queue);
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS).setDescription('⏮️ **Playing previous song!**').setTimestamp()] });
}

async function handleJump(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });

  const position = interaction.options.getInteger('position');
  const targetIndex = queue.currentIndex + position;
  if (targetIndex >= queue.songs.length) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription(`❌ Only ${queue.queueLength} songs in queue!`).setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  queue.currentIndex = targetIndex;
  await playSong(queue);
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS).setDescription(`⏩ **Jumped to #${position}:** ${truncate(queue.currentSong?.name || 'Unknown', 40)}`).setTimestamp()] });
}

async function handleRemove(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });

  const position = interaction.options.getInteger('position');
  const targetIndex = queue.currentIndex + position;
  if (targetIndex <= queue.currentIndex || targetIndex >= queue.songs.length) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Invalid position!').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  const removed = queue.songs.splice(targetIndex, 1)[0];
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.WARNING)
      .setAuthor({ name: '🗑️ Song Removed' })
      .setDescription(`━━━━━━━━━━━━━━━━━━━\n┣ ❌ **Removed:** ${truncate(removed.name, 50)}\n┗ 📋 ${queue.queueLength} songs remaining`).setTimestamp()],
  });
}

async function handleFilter(interaction) {
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.WARNING).setDescription('⚠️ Audio filters are not supported with play-dl engine. Use volume control instead!').setTimestamp()], flags: MessageFlags.Ephemeral });
}

async function handleLyrics(interaction) {
  const query = interaction.options.getString('song') || '';
  const searchQuery = query || 'current song';
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SEARCH)
      .setAuthor({ name: `${MUSIC_EMOJIS.lyrics} Lyrics Search` })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ 📝 **Searching for:** ${truncate(searchQuery, 40)}\n` +
        `┣ 🔗 [Genius](https://genius.com/search?q=${encodeURIComponent(searchQuery)})\n` +
        `┣ 🔗 [AZLyrics](https://search.azlyrics.com/search.php?q=${encodeURIComponent(searchQuery)})\n` +
        `┗ 🔗 [Google](https://www.google.com/search?q=${encodeURIComponent(searchQuery + ' lyrics')})`
      ).setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` }).setTimestamp()],
  });
}

async function handleHelp(interaction) {
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.PRIMARY)
      .setAuthor({ name: `${MUSIC_EMOJIS.dj} Abigail Music — Help` })
      .setTitle(`${MUSIC_EMOJIS.music} Boogie-Style Music Bot`)
      .setDescription('Play music in voice channels with interactive button controls! Supports **YouTube** and **Spotify**!')
      .addFields(
        { name: '🎮 Playback', value: '`/music play <song>` — Play song/URL\n`/music search <query>` — Search & pick\n`/music skip` — Skip\n`/music stop` — Stop & leave\n`/music pause` — Pause/Resume', inline: true },
        { name: '📋 Queue', value: '`/music queue` — View queue\n`/music jump <pos>` — Jump to song\n`/music remove <pos>` — Remove song\n`/music shuffle` — Shuffle\n`/music loop [mode]` — Loop', inline: true },
        { name: '🎛️ Controls', value: '`/music volume [1-150]` — Volume\n`/music nowplaying` — Current song\n`/music previous` — Previous song\n`/music lyrics [song]` — Lyrics\n`/music help` — This message', inline: true },
        { name: '🔘 Buttons', value: 'Every Now Playing has 8 buttons!\n⏮️ Prev • ⏸️ Pause • ⏭️ Skip • ⏹️ Stop\n📋 Queue • 🔁 Loop • 🔀 Shuffle • 🔊 Vol', inline: false },
        { name: '💡 Supported', value: '▶️ **YouTube** — Videos & Playlists\n🟢 **Spotify** — Songs, Albums & Playlists\n🔗 **URLs** — Paste any supported link!', inline: false },
      )
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | play-dl Engine` }).setTimestamp()],
  });
}

/* ═══════════════════════════════════════════
   🎛️ Button Interaction Handler
   ═══════════════════════════════════════════ */

async function handleMusicButton(interaction, customId) {
  if (!playdl) return;
  const parts = customId.split('_');
  const actionCode = parts[1];
  const guildId = parts.slice(2).join('_');

  // Search result selection
  if (actionCode.startsWith('s') && actionCode.length > 1 && actionCode !== 'sc') {
    const selectedIndex = parseInt(actionCode[1]);
    const searchId = parts.slice(2).join('_');
    const searchData = searchState.get(searchId);

    if (!searchData || searchData.userId !== interaction.user.id) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Search expired or not yours!').setTimestamp()], flags: MessageFlags.Ephemeral });
    }

    if (isNaN(selectedIndex) || selectedIndex >= searchData.results.length) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Invalid selection!').setTimestamp()], flags: MessageFlags.Ephemeral });
    }

    const song = searchData.results[selectedIndex];
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Join a VC first!').setTimestamp()], flags: MessageFlags.Ephemeral });
    }

    try {
      const queue = ensureQueue(interaction.guild.id);
      queue.textChannel = interaction.channel;
      const isFirst = queue.songs.length === 0;
      queue.songs.push(song);

      if (!queue.connection || queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
        queue.connection = await connectToVC(voiceChannel);
      }

      if (isFirst) {
        queue.currentIndex = 0;
        await playSong(queue);
      }

      await interaction.update({
        embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS)
          .setAuthor({ name: `${MUSIC_EMOJIS.music} Song Selected!` })
          .setTitle(truncate(song.name, 55)).setURL(song.url || null)
          .setThumbnail(song.thumbnail || null)
          .setDescription(`✅ ${isFirst ? 'Now playing!' : 'Added to queue!'}`).setTimestamp()],
        components: [],
      });
      searchState.delete(searchId);
    } catch (err) {
      await interaction.update({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription(`❌ ${truncate(err.message, 150)}`).setTimestamp()], components: [] });
    }
    return;
  }

  // Cancel search
  if (actionCode === 'sc') {
    await interaction.update({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.WARNING).setDescription('❌ Search cancelled.').setTimestamp()], components: [] });
    return;
  }

  const queue = getQueue(interaction.guild.id);

  // Pause/Resume
  if (actionCode === 'pause') {
    if (!queue || !queue.playing) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
    if (queue.paused) { queue.player?.unpause(); queue.paused = false; return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.PLAYING).setDescription('▶️ **Resumed!**').setTimestamp()], flags: MessageFlags.Ephemeral }); }
    else { queue.player?.pause(); queue.paused = true; return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.PAUSED).setDescription('⏸️ **Paused!**').setTimestamp()], flags: MessageFlags.Ephemeral }); }
  }

  // Skip
  if (actionCode === 'skip') {
    if (!queue || !queue.playing) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
    queue.currentIndex++;
    if (queue.currentIndex < queue.songs.length) await playSong(queue);
    else { queue.player?.stop(); await sendQueueFinished(queue); }
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS).setDescription('⏭️ **Skipped!**').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  // Stop
  if (actionCode === 'stop') {
    if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
    queue.player?.stop(); queue.connection?.destroy(); guildQueues.delete(interaction.guild.id);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('⏹️ **Stopped!** Left VC.').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  // Previous
  if (actionCode === 'prev') {
    if (!queue || queue.currentIndex <= 0) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.WARNING).setDescription('⚠️ No previous song!').setTimestamp()], flags: MessageFlags.Ephemeral });
    queue.currentIndex--; await playSong(queue);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS).setDescription('⏮️ **Previous!**').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  // Queue
  if (actionCode === 'queue') {
    if (!queue || queue.songs.length === 0) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Queue empty!').setTimestamp()], flags: MessageFlags.Ephemeral });
    let desc = `🎵 **Now:** ${truncate(queue.currentSong?.name || 'Unknown', 40)}\n\n`;
    const up = queue.songs.slice(queue.currentIndex + 1, queue.currentIndex + 6);
    for (let i = 0; i < up.length; i++) desc += `**${i + 1}.** ${truncate(up[i].name, 40)} • ${up[i].duration}\n`;
    if (queue.queueLength > 5) desc += `\n... +${queue.queueLength - 5} more`;
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.QUEUE).setAuthor({ name: `${MUSIC_EMOJIS.queue} Queue (${queue.songs.length} songs)` }).setDescription(desc).setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  // Loop
  if (actionCode === 'loop') {
    if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
    queue.loopMode = (queue.loopMode + 1) % 3;
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS).setDescription(`🔁 **Loop: ${LOOP_LABELS[queue.loopMode]}**`).setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  // Shuffle
  if (actionCode === 'shuffle') {
    if (!queue || queue.songs.length < 3) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Need 3+ songs!').setTimestamp()], flags: MessageFlags.Ephemeral });
    const cur = queue.songs.slice(0, queue.currentIndex + 1);
    const up = queue.songs.slice(queue.currentIndex + 1);
    for (let i = up.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [up[i], up[j]] = [up[j], up[i]]; }
    queue.songs = [...cur, ...up];
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS).setDescription('🔀 **Shuffled!**').setTimestamp()], flags: MessageFlags.Ephemeral });
  }

  // Volume button
  if (actionCode === 'vol') {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.VOLUME).setAuthor({ name: `${MUSIC_EMOJIS.volume} Volume` }).setDescription(`🔊 **Current:** ${queue?.volume || 50}%\n👇 Click a button!`).setTimestamp()], components: getVolumeButtons(interaction.guild.id), flags: MessageFlags.Ephemeral });
  }

  // Volume presets
  const volMap = { v10: 10, v25: 25, v50: 50, v75: 75, v100: 100 };
  if (volMap[actionCode] && queue) {
    const vol = volMap[actionCode];
    queue.volume = vol;
    if (queue.resource?.volume) queue.resource.volume.setVolume(vol / 100);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.VOLUME).setDescription(`🔊 **Volume: ${vol}%**`).setTimestamp()], flags: MessageFlags.Ephemeral });
  }
}

/* ═══════════════════════════════════════════
   🔧 Utility Functions
   ═══════════════════════════════════════════ */

function truncate(str, maxLen) {
  if (!str) return 'Unknown';
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ═══════════════════════════════════════════
   📦 Exports
   ═══════════════════════════════════════════ */

module.exports = {
  initMusic,
  handleMusicButton,
  MUSIC_COLORS,
  MUSIC_EMOJIS,
  handlePlay, handleSearch, handleSkip, handleStop, handlePause,
  handleQueue, handleVolume, handleNowPlaying, handleLoop, handleShuffle,
  handlePrevious, handleJump, handleRemove, handleFilter, handleLyrics, handleHelp,
  getNowPlayingButtons, getVolumeButtons, getSearchResultButtons,
  truncate, formatDuration,
};
