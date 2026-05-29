/* ═══════════════════════════════════════════
   🎵 Abigail Music Engine — Boogie-Style VC Playback
   ═══════════════════════════════════════════
   Powered by DisTube • YouTube, Spotify, SoundCloud
   Interactive button controls • Dark-themed cinematic embeds
   ═══════════════════════════════════════════ */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

/* ═══════════════════════════════════════════
   🎨 Theme Constants
   ═══════════════════════════════════════════ */

const MUSIC_COLORS = {
  PRIMARY: 0x1DB954,      // Spotify green
  SECONDARY: 0x191414,    // Dark background
  ACCENT: 0xB3B3B3,       // Muted text
  PLAYING: 0x1DB954,      // Now playing green
  PAUSED: 0xF39C12,       // Paused orange
  ERROR: 0xE74C3C,        // Error red
  QUEUE: 0x5865F2,        // Blurple for queue
  SEARCH: 0x9B59B6,       // Purple for search
  VOLUME: 0xE91E63,       // Pink for volume
  SUCCESS: 0x2ECC71,      // Green success
  WARNING: 0xF39C12,      // Orange warning
  GOLD: 0xFFD700,         // Gold for special
};

const MUSIC_EMOJIS = {
  play: '▶️',
  pause: '⏸️',
  skip: '⏭️',
  stop: '⏹️',
  queue: '📋',
  volume: '🔊',
  mute: '🔇',
  loop: '🔁',
  shuffle: '🔀',
  nowplaying: '🎵',
  search: '🔍',
  lyrics: '📝',
  playlist: '📀',
  prev: '⏮️',
  next: '⏭️',
  music: '🎶',
  mic: '🎤',
  headphone: '🎧',
  disc: '💿',
  radio: '📻',
  wave: '🌊',
  fire: '🔥',
  star: '⭐',
  heart: '💜',
  note: '🎼',
  vip: '👑',
  dj: '🎧',
};

/* ── Now Playing Messages ── */
const NOW_PLAYING_MESSAGES = [
  'Now vibing to',
  'Dropping the beat with',
  'Spinning up',
  'Get ready for',
  'Time to jam with',
  'Your ears are blessed with',
  'The stage is set for',
  'DJ Abigail presents',
  'In the mix:',
  'Let\'s groove to',
];

const QUEUE_MESSAGES = [
  'Up next in the queue',
  'Coming up after this track',
  'Queue is loaded with',
  'The party continues with',
  'More bangers lined up',
];

/* ── Loop Mode Labels ── */
const LOOP_LABELS = {
  0: 'Off',
  1: 'Track',
  2: 'Queue',
};

/* ═══════════════════════════════════════════
   🎵 DisTube Setup & Initialization
   ═══════════════════════════════════════════ */

let disTube = null;

/**
 * Initialize DisTube with the Discord client
 * Must be called after client is ready
 */
function initMusic(client) {
  try {
    const { DisTube } = require('distube');
    const { YtDlpPlugin } = require('@distube/yt-dlp');

    disTube = new DisTube(client, {
      plugins: [
        new YtDlpPlugin(),
      ],
      emitNewSongOnly: false,
      leaveOnEmpty: true,
      leaveOnFinish: false,
      leaveOnStop: true,
      savePreviousSongs: true,
      searchSongs: 0,      // 0 = auto-pick first result
      searchCooldown: 30,
      emptyCooldown: 60,
      youtubeDL: false,     // Use yt-dlp plugin instead
      updateYouTubeDL: false,
    });

    /* ── DisTube Event Handlers ── */

    disTube.on('playSong', async (queue, song) => {
      try {
        const channel = queue.textChannel;
        if (!channel) return;

        // Delete old now-playing message if exists
        const queueKey = `np_${queue.id}`;
        if (musicState.nowPlayingMessages.has(queueKey)) {
          const oldMsgId = musicState.nowPlayingMessages.get(queueKey);
          try {
            const oldMsg = await channel.messages.fetch(oldMsgId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
          } catch (e) {}
        }

        const npMsg = NOW_PLAYING_MESSAGES[Math.floor(Math.random() * NOW_PLAYING_MESSAGES.length)];
        const loopLabel = LOOP_LABELS[queue.repeatMode] || 'Off';
        const volume = queue.volume || 50;

        // Progress bar simulation
        const barLength = 20;
        const filledBar = '▬'.repeat(Math.round(barLength * 0.0)) + '🔵';
        const emptyBar = '▬'.repeat(Math.max(0, barLength - filledBar.length + 1));
        const progressBar = filledBar + emptyBar;

        const embed = new EmbedBuilder()
          .setColor(MUSIC_COLORS.PLAYING)
          .setAuthor({ name: `${MUSIC_EMOJIS.dj} ${npMsg}`, iconURL: song.thumbnail || null })
          .setTitle(`${MUSIC_EMOJIS.music} ${truncate(song.name, 60)}`)
          .setURL(song.url)
          .setThumbnail(song.thumbnail || null)
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ ${MUSIC_EMOJIS.mic} **Artist:** ${song.uploader?.name || 'Unknown'}\n` +
            `┣ ⏱️ **Duration:** ${song.formattedDuration || formatDuration(song.duration)}\n` +
            `┣ 📊 **Views:** ${formatNumber(song.views)}\n` +
            `┣ 🔊 **Volume:** ${volume}%\n` +
            `┣ 🔁 **Loop:** ${loopLabel}\n` +
            `┣ 👤 **Requested by:** ${song.user?.toString() || 'Unknown'}\n` +
            `┗ 📋 **Queue:** ${queue.songs.length - 1} song${queue.songs.length - 1 !== 1 ? 's' : ''} left\n\n` +
            `${progressBar}\n` +
            `\`00:00\` ────────────── \`${song.formattedDuration || formatDuration(song.duration)}\``
          )
          .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | Use buttons below to control` })
          .setTimestamp();

        const components = getNowPlayingButtons(queue.id);
        const msg = await channel.send({ embeds: [embed], components });

        // Store the now-playing message ID for future updates
        musicState.nowPlayingMessages.set(queueKey, msg.id);
      } catch (e) {
        console.error('Music playSong embed error:', e.message);
      }
    });

    disTube.on('addSong', async (queue, song) => {
      try {
        const channel = queue.textChannel;
        if (!channel) return;

        // Don't send addSong message if it's the first song (playSong handles that)
        if (queue.songs.length <= 1) return;

        const addMsg = QUEUE_MESSAGES[Math.floor(Math.random() * QUEUE_MESSAGES.length)];

        const embed = new EmbedBuilder()
          .setColor(MUSIC_COLORS.SUCCESS)
          .setAuthor({ name: `${MUSIC_EMOJIS.music} Added to Queue`, iconURL: song.thumbnail || null })
          .setTitle(truncate(song.name, 55))
          .setURL(song.url)
          .setThumbnail(song.thumbnail || null)
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ ${MUSIC_EMOJIS.mic} **${song.uploader?.name || 'Unknown'}**\n` +
            `┣ ⏱️ **${song.formattedDuration || formatDuration(song.duration)}**\n` +
            `┣ 📋 **Position:** #${queue.songs.length - 1} in queue\n` +
            `┣ 👤 **${song.user?.toString() || 'Unknown'}**\n` +
            `┗ 🎶 **${addMsg}!**`
          )
          .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | ${queue.songs.length - 1} songs in queue` })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      } catch (e) {
        console.error('Music addSong embed error:', e.message);
      }
    });

    disTube.on('addList', async (queue, playlist) => {
      try {
        const channel = queue.textChannel;
        if (!channel) return;

        const embed = new EmbedBuilder()
          .setColor(MUSIC_COLORS.GOLD)
          .setAuthor({ name: `${MUSIC_EMOJIS.playlist} Playlist Added!` })
          .setTitle(truncate(playlist.name || 'Playlist', 55))
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ 📀 **${playlist.songs?.length || 0} songs** added to queue!\n` +
            `┣ 📋 **Queue:** ${queue.songs.length} total songs\n` +
            `┣ 👤 **${playlist.user?.toString() || 'Unknown'}**\n` +
            `┗ 🎶 Let the party begin!`
          )
          .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      } catch (e) {
        console.error('Music addList embed error:', e.message);
      }
    });

    disTube.on('empty', async (queue) => {
      try {
        const channel = queue.textChannel;
        if (!channel) return;

        const embed = new EmbedBuilder()
          .setColor(MUSIC_COLORS.WARNING)
          .setAuthor({ name: `${MUSIC_EMOJIS.headphone} Voice Channel Empty` })
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ 👤 Everyone left the voice channel\n` +
            `┗ ⏹️ Music stopped & queue cleared`
          )
          .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | Rejoin and play to start again!` })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      } catch (e) {}
    });

    disTube.on('searchNoResult', async (message, query) => {
      try {
        const embed = new EmbedBuilder()
          .setColor(MUSIC_COLORS.ERROR)
          .setAuthor({ name: `${MUSIC_EMOJIS.search} No Results Found` })
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ 🔍 Searched for: **${truncate(query, 50)}**\n` +
            `┗ ❌ No matches found. Try a different search!`
          )
          .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
          .setTimestamp();

        if (message.isChatInputCommand?.()) {
          if (message.replied || message.deferred) {
            await message.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
          } else {
            await message.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
          }
        } else {
          await message.reply({ embeds: [embed] });
        }
      } catch (e) {}
    });

    disTube.on('searchResult', async (message, results) => {
      // This is handled by our custom search with buttons
    });

    disTube.on('error', async (channel, error) => {
      console.error('DisTube error:', error.message);
      try {
        const embed = new EmbedBuilder()
          .setColor(MUSIC_COLORS.ERROR)
          .setAuthor({ name: `${MUSIC_EMOJIS.fire} Playback Error` })
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ ❌ **Error:** ${truncate(error.message, 200)}\n` +
            `┗ 💡 Try playing a different song!`
          )
          .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
          .setTimestamp();

        if (channel && channel.send) {
          await channel.send({ embeds: [embed] }).catch(() => {});
        }
      } catch (e) {}
    });

    disTube.on('finish', async (queue) => {
      try {
        const channel = queue.textChannel;
        if (!channel) return;

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

        await channel.send({ embeds: [embed] });
      } catch (e) {}
    });

    disTube.on('disconnect', async (queue) => {
      try {
        const channel = queue.textChannel;
        if (!channel) return;

        const embed = new EmbedBuilder()
          .setColor(MUSIC_COLORS.WARNING)
          .setAuthor({ name: `${MUSIC_EMOJIS.headphone} Disconnected` })
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ ⏹️ Left the voice channel\n` +
            `┗ 💜 Use \`/music play\` to start again!`
          )
          .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      } catch (e) {}
    });

    disTube.on('initQueue', (queue) => {
      queue.autoplay = false;
      queue.volume = 50;
    });

    console.log('✅ DisTube Music Engine initialized!');
    return disTube;
  } catch (err) {
    console.error('❌ Failed to initialize DisTube:', err.message);
    console.error('   Make sure distube and @distube/yt-dlp are installed!');
    return null;
  }
}

/* ═══════════════════════════════════════════
   🗂️ Music State Management
   ═══════════════════════════════════════════ */

const musicState = {
  nowPlayingMessages: new Map(),  // guildId_npguildId -> messageId
  searchResults: new Map(),       // userId -> { results, timestamp }
  djMode: new Map(),              // guildId -> { enabled, roleId }
  filters: new Map(),             // guildId -> active filter name
};

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
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mu_v10_${guildId}`).setLabel('🔈 10%').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mu_v25_${guildId}`).setLabel('🔉 25%').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`mu_v50_${guildId}`).setLabel('🔊 50%').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`mu_v75_${guildId}`).setLabel('📢 75%').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mu_v100_${guildId}`).setLabel('💥 100%').setStyle(ButtonStyle.Danger),
  );
  return [row];
}

function getSearchResultButtons(searchId, count) {
  const rows = [];
  const maxResults = Math.min(count, 10);

  for (let i = 0; i < maxResults; i += 5) {
    const row = new ActionRowBuilder();
    for (let j = i; j < Math.min(i + 5, maxResults); j++) {
      const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][j];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`mu_s${j}_${searchId}`)
          .setLabel(`${numEmoji}`)
          .setStyle(ButtonStyle.Primary)
      );
    }
    rows.push(row);
  }

  // Cancel button
  const cancelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mu_scancel_${searchId}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
  );
  rows.push(cancelRow);

  return rows;
}

/* ═══════════════════════════════════════════
   🎵 Music Command Handlers
   ═══════════════════════════════════════════ */

/**
 * Play a song or add to queue
 */
async function handlePlay(interaction) {
  if (!disTube) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.fire} Music Not Available` })
        .setDescription('Music system is not initialized. Contact the bot owner!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const query = interaction.options.getString('song');
  const member = interaction.member;

  // Check if user is in a voice channel
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.headphone} Join a Voice Channel!` })
        .setDescription(
          `━━━━━━━━━━━━━━━━━━━\n` +
          `┣ ❌ You need to be in a voice channel to play music!\n` +
          `┗ 💡 Join a VC and try again!`
        )
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check permissions
  const permissions = voiceChannel.permissionsFor(interaction.client.user);
  if (!permissions.has('Connect') || !permissions.has('Speak')) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.fire} Missing Permissions` })
        .setDescription(
          `━━━━━━━━━━━━━━━━━━━\n` +
          `┣ ❌ I need **Connect** and **Speak** permissions!\n` +
          `┗ 💡 Check channel permissions and try again!`
        )
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  try {
    await disTube.play(voiceChannel, query, {
      textChannel: interaction.channel,
      member: member,
    });

    // The playSong/addSong events will handle the response
    // Just acknowledge the command
    const isUrl = query.startsWith('http://') || query.startsWith('https://');
    const searchEmbed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.SEARCH)
      .setAuthor({ name: `${MUSIC_EMOJIS.search} ${isUrl ? 'Loading URL' : 'Searching'}` })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ 🔍 **${isUrl ? 'Resolving' : 'Searching for'}:** ${truncate(query, 50)}\n` +
        `┗ ⏳ Hold on, ${isUrl ? 'loading' : 'finding the best match'}...`
      )
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
      .setTimestamp();

    await interaction.editReply({ embeds: [searchEmbed] });
  } catch (err) {
    console.error('Music play error:', err.message);

    const errorEmbed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.ERROR)
      .setAuthor({ name: `${MUSIC_EMOJIS.fire} Playback Error` })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ ❌ **Error:** ${truncate(err.message, 200)}\n` +
        `┗ 💡 Try a different search or URL!`
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

/**
 * Search for songs with interactive selection
 */
async function handleSearch(interaction) {
  if (!disTube) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setDescription('❌ Music system not available!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const query = interaction.options.getString('query');
  const member = interaction.member;
  const voiceChannel = member.voice?.channel;

  if (!voiceChannel) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.headphone} Join a Voice Channel!` })
        .setDescription('You need to be in a VC to search & play music!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  try {
    // Use DisTube's search
    const results = await disTube.search(query, { limit: 10 });

    if (!results || results.length === 0) {
      const noResultsEmbed = new EmbedBuilder()
        .setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.search} No Results` })
        .setDescription(`No songs found for **"${truncate(query, 40)}"**! Try a different search.`)
        .setTimestamp();
      return interaction.editReply({ embeds: [noResultsEmbed] });
    }

    const searchId = `${interaction.guild.id}_${Date.now()}`;
    musicState.searchResults.set(searchId, { results, userId: interaction.user.id, timestamp: Date.now() });

    let desc = `━━━━━━━━━━━━━━━━━━━\n`;
    for (let i = 0; i < results.length; i++) {
      const s = results[i];
      const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][i];
      desc += `${numEmoji} **${truncate(s.name, 50)}**\n`;
      desc += `   ┣ ${s.uploader?.name || 'Unknown'} • ${s.formattedDuration || formatDuration(s.duration)}\n`;
      if (i < results.length - 1) desc += `\n`;
    }

    const searchEmbed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.SEARCH)
      .setAuthor({ name: `${MUSIC_EMOJIS.search} Search Results for "${truncate(query, 30)}"` })
      .setDescription(desc)
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | Click a number button to play! | 30s timeout` })
      .setTimestamp();

    const components = getSearchResultButtons(searchId, results.length);
    await interaction.editReply({ embeds: [searchEmbed], components });

    // Auto-expire search after 30s
    setTimeout(() => {
      musicState.searchResults.delete(searchId);
    }, 30000);
  } catch (err) {
    console.error('Music search error:', err.message);
    const errorEmbed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.ERROR)
      .setAuthor({ name: `${MUSIC_EMOJIS.fire} Search Error` })
      .setDescription(`❌ ${truncate(err.message, 200)}`)
      .setTimestamp();
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Skip current song
 */
async function handleSkip(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.music} Nothing Playing` })
        .setDescription('No music is currently playing!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const currentSong = queue.songs[0];
  try {
    await queue.skip();
    const embed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.SUCCESS)
      .setAuthor({ name: `${MUSIC_EMOJIS.skip} Skipped!` })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ ⏭️ **Skipped:** ${truncate(currentSong?.name || 'Unknown', 50)}\n` +
        `┗ ▶️ Playing next song...`
      )
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | ${queue.songs.length - 1} songs left` })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  } catch (err) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setDescription('❌ Could not skip! Maybe it\'s the last song?')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Stop playback and clear queue
 */
async function handleStop(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.music} Nothing Playing` })
        .setDescription('No music is currently playing!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  queue.stop();
  const embed = new EmbedBuilder()
    .setColor(MUSIC_COLORS.ERROR)
    .setAuthor({ name: `${MUSIC_EMOJIS.stop} Music Stopped` })
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━\n` +
      `┣ ⏹️ **Playback stopped!**\n` +
      `┣ 🗑️ Queue cleared!\n` +
      `┗ 👋 Left the voice channel`
    )
    .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | Use /music play to start again!` })
    .setTimestamp();
  return interaction.reply({ embeds: [embed] });
}

/**
 * Pause/resume playback
 */
async function handlePause(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setDescription('❌ Nothing is playing!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (queue.paused) {
    queue.resume();
    const embed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.PLAYING)
      .setAuthor({ name: `${MUSIC_EMOJIS.play} Resumed!` })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ ▶️ **${truncate(queue.songs[0]?.name || 'Unknown', 50)}** resumed!\n` +
        `┗ 🎶 Keep vibing!`
      )
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  } else {
    queue.pause();
    const embed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.PAUSED)
      .setAuthor({ name: `${MUSIC_EMOJIS.pause} Paused!` })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ ⏸️ **${truncate(queue.songs[0]?.name || 'Unknown', 50)}** paused!\n` +
        `┗ 💡 Click the ⏸️ button or use \`/music pause\` to resume!`
      )
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }
}

/**
 * Show current queue
 */
async function handleQueue(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue || queue.songs.length === 0) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.queue} Queue Empty` })
        .setDescription('No songs in the queue! Use `/music play` to add some!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const currentSong = queue.songs[0];
  const upcoming = queue.songs.slice(1, 11); // Show max 10 upcoming

  let desc = `━━━━━━━━━━━━━━━━━━━\n`;
  desc += `${MUSIC_EMOJIS.play} **NOW PLAYING:**\n`;
  desc += `┣ 🎵 **${truncate(currentSong.name, 50)}**\n`;
  desc += `┣ ${currentSong.uploader?.name || 'Unknown'} • ${currentSong.formattedDuration || formatDuration(currentSong.duration)}\n`;
  desc += `┗ 👤 ${currentSong.user?.toString() || 'Unknown'}\n\n`;

  if (upcoming.length > 0) {
    desc += `📋 **UP NEXT:**\n`;
    for (let i = 0; i < upcoming.length; i++) {
      const s = upcoming[i];
      desc += `**${i + 1}.** ${truncate(s.name, 45)} • ${s.formattedDuration || formatDuration(s.duration)}\n`;
    }
    if (queue.songs.length > 11) {
      desc += `\n... and **${queue.songs.length - 11}** more song${queue.songs.length - 11 !== 1 ? 's' : ''}!`;
    }
  } else {
    desc += `📋 No songs in queue!`;
  }

  const totalDuration = queue.songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const loopLabel = LOOP_LABELS[queue.repeatMode] || 'Off';

  const embed = new EmbedBuilder()
    .setColor(MUSIC_COLORS.QUEUE)
    .setAuthor({ name: `${MUSIC_EMOJIS.queue} Music Queue` })
    .setDescription(desc)
    .addFields(
      { name: '📊 Stats', value: `**${queue.songs.length}** songs • **${formatDuration(totalDuration)}** total\n🔁 Loop: **${loopLabel}** • 🔊 Volume: **${queue.volume}%**`, inline: true },
    )
    .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | Page 1/${Math.ceil(queue.songs.length / 10)}` })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

/**
 * Change volume
 */
async function handleVolume(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setDescription('❌ Nothing is playing!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const volume = interaction.options.getInteger('level');
  if (volume === null) {
    // Show current volume with controls
    const embed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.VOLUME)
      .setAuthor({ name: `${MUSIC_EMOJIS.volume} Volume Control` })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ 🔊 **Current Volume:** ${queue.volume}%\n` +
        `┗ 👇 Click a button to set volume!`
      )
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], components: getVolumeButtons(interaction.guild.id) });
  }

  if (volume < 1 || volume > 150) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setDescription('❌ Volume must be between 1-150!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  queue.setVolume(volume);

  const volEmoji = volume <= 10 ? '🔈' : volume <= 30 ? '🔉' : volume <= 70 ? '🔊' : volume <= 100 ? '📢' : '💥';
  const embed = new EmbedBuilder()
    .setColor(MUSIC_COLORS.VOLUME)
    .setAuthor({ name: `${volEmoji} Volume Changed` })
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━\n` +
      `┣ ${volEmoji} **Volume:** ${volume}%\n` +
      `┗ 🎵 Now playing at ${volume}% volume!`
    )
    .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
    .setTimestamp();
  return interaction.reply({ embeds: [embed] });
}

/**
 * Now playing info
 */
async function handleNowPlaying(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue || !queue.songs[0]) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setAuthor({ name: `${MUSIC_EMOJIS.music} Nothing Playing` })
        .setDescription('No music is currently playing!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const song = queue.songs[0];
  const loopLabel = LOOP_LABELS[queue.repeatMode] || 'Off';
  const status = queue.paused ? '⏸️ Paused' : '▶️ Playing';

  const embed = new EmbedBuilder()
    .setColor(queue.paused ? MUSIC_COLORS.PAUSED : MUSIC_COLORS.PLAYING)
    .setAuthor({ name: `${MUSIC_EMOJIS.nowplaying} Now Playing`, iconURL: song.thumbnail || null })
    .setTitle(truncate(song.name, 60))
    .setURL(song.url)
    .setThumbnail(song.thumbnail || null)
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━\n` +
      `┣ ${MUSIC_EMOJIS.mic} **Artist:** ${song.uploader?.name || 'Unknown'}\n` +
      `┣ ⏱️ **Duration:** ${song.formattedDuration || formatDuration(song.duration)}\n` +
      `┣ 📊 **Views:** ${formatNumber(song.views)}\n` +
      `┣ ${status}\n` +
      `┣ 🔊 **Volume:** ${queue.volume}%\n` +
      `┣ 🔁 **Loop:** ${loopLabel}\n` +
      `┣ 👤 **Requested by:** ${song.user?.toString() || 'Unknown'}\n` +
      `┗ 📋 **Queue:** ${queue.songs.length - 1} song${queue.songs.length - 1 !== 1 ? 's' : ''} left`
    )
    .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | ${status}` })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], components: getNowPlayingButtons(interaction.guild.id) });
}

/**
 * Toggle loop mode
 */
async function handleLoop(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setDescription('❌ Nothing is playing!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const mode = interaction.options.getString('mode') || 'toggle';
  let newMode;

  if (mode === 'toggle') {
    // Cycle through: off -> track -> queue -> off
    newMode = (queue.repeatMode + 1) % 3;
  } else if (mode === 'off') {
    newMode = 0;
  } else if (mode === 'track') {
    newMode = 1;
  } else if (mode === 'queue') {
    newMode = 2;
  }

  queue.setRepeatMode(newMode);
  const loopLabel = LOOP_LABELS[newMode];
  const loopEmoji = newMode === 0 ? '➡️' : newMode === 1 ? '🔂' : '🔁';

  const embed = new EmbedBuilder()
    .setColor(MUSIC_COLORS.SUCCESS)
    .setAuthor({ name: `${loopEmoji} Loop: ${loopLabel}` })
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━\n` +
      `┣ ${loopEmoji} **Loop Mode:** ${loopLabel}\n` +
      `┗ ${newMode === 0 ? 'Looping disabled!' : newMode === 1 ? 'Current song will repeat!' : 'Entire queue will repeat!'}`
    )
    .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
    .setTimestamp();
  return interaction.reply({ embeds: [embed] });
}

/**
 * Shuffle queue
 */
async function handleShuffle(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue || queue.songs.length < 3) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setDescription('❌ Need at least 3 songs in queue to shuffle!')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  queue.shuffle();
  const embed = new EmbedBuilder()
    .setColor(MUSIC_COLORS.SUCCESS)
    .setAuthor({ name: `${MUSIC_EMOJIS.shuffle} Queue Shuffled!` })
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━\n` +
      `┣ 🔀 **${queue.songs.length - 1}** songs shuffled!\n` +
      `┗ 🎶 New order — let\'s go!`
    )
    .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
    .setTimestamp();
  return interaction.reply({ embeds: [embed] });
}

/**
 * Jump to a specific song in queue
 */
async function handleJump(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const position = interaction.options.getInteger('position');
  if (position < 1 || position >= queue.songs.length) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setDescription(`❌ Invalid position! Queue has ${queue.songs.length} songs (1-${queue.songs.length}).`)
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const song = queue.songs[position];
  queue.jump(position);

  const embed = new EmbedBuilder()
    .setColor(MUSIC_COLORS.SUCCESS)
    .setAuthor({ name: `${MUSIC_EMOJIS.skip} Jumped!` })
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━\n` +
      `┣ ⏭️ **Jumped to:** ${truncate(song.name, 50)}\n` +
      `┗ 🎶 Now playing!`
    )
    .setTimestamp();
  return interaction.reply({ embeds: [embed] });
}

/**
 * Remove a song from queue
 */
async function handleRemove(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const position = interaction.options.getInteger('position');
  if (position < 1 || position >= queue.songs.length) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setDescription(`❌ Invalid position! Queue has ${queue.songs.length} songs (1-${queue.songs.length}).`)
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const removed = queue.songs[position];
  queue.songs.splice(position, 1);

  const embed = new EmbedBuilder()
    .setColor(MUSIC_COLORS.WARNING)
    .setAuthor({ name: `🗑️ Song Removed` })
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━\n` +
      `┣ ❌ **Removed:** ${truncate(removed.name, 50)}\n` +
      `┗ 📋 ${queue.songs.length - 1} songs remaining in queue`
    )
    .setTimestamp();
  return interaction.reply({ embeds: [embed] });
}

/**
 * Lyrics (basic search)
 */
async function handleLyrics(interaction) {
  const query = interaction.options.getString('song') || '';
  await interaction.deferReply();

  try {
    // Use a simple web search approach or built-in lyrics
    // For now, provide a helpful message with links
    const searchQuery = query || 'current song';
    const embed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.SEARCH)
      .setAuthor({ name: `${MUSIC_EMOJIS.lyrics} Lyrics Search` })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ 📝 **Searching for:** ${truncate(searchQuery, 40)}\n` +
        `┣ 🔗 [Genius](https://genius.com/search?q=${encodeURIComponent(searchQuery)})\n` +
        `┣ 🔗 [AZLyrics](https://search.azlyrics.com/search.php?q=${encodeURIComponent(searchQuery)})\n` +
        `┗ 🔗 [Google Lyrics](https://www.google.com/search?q=${encodeURIComponent(searchQuery + ' lyrics')})`
      )
      .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | External lyrics links` })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Could not fetch lyrics!').setTimestamp()],
    });
  }
}

/**
 * Music help
 */
async function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(MUSIC_COLORS.PRIMARY)
    .setAuthor({ name: `${MUSIC_EMOJIS.dj} Abigail Music — Help` })
    .setTitle(`${MUSIC_EMOJIS.music} Boogie-Style Music Bot`)
    .setDescription(
      `Play music in voice channels with interactive button controls! Supports **YouTube**, **Spotify**, and **SoundCloud**!`
    )
    .addFields(
      { name: '🎮 Playback', value: '`/music play <song>` — Play a song or URL\n`/music search <query>` — Search & pick with buttons\n`/music skip` — Skip current song\n`/music stop` — Stop & clear queue\n`/music pause` — Pause/Resume', inline: true },
      { name: '📋 Queue', value: '`/music queue` — View the queue\n`/music jump <position>` — Jump to song #\n`/music remove <position>` — Remove a song\n`/music shuffle` — Shuffle the queue\n`/music loop [mode]` — Toggle loop', inline: true },
      { name: '🎛️ Controls', value: '`/music volume [1-150]` — Change volume\n`/music nowplaying` — Current song info\n`/music lyrics [song]` — Find lyrics', inline: true },
      { name: '🔘 Interactive Buttons', value: 'Every now-playing message has **8 control buttons**!\n⏮️ Prev • ⏸️ Pause • ⏭️ Skip • ⏹️ Stop\n📋 Queue • 🔁 Loop • 🔀 Shuffle • 🔊 Volume', inline: false },
      { name: '💡 Supported Sources', value: '▶️ **YouTube** — Videos & Playlists\n🟢 **Spotify** — Songs, Albums & Playlists\n🟠 **SoundCloud** — Tracks & Playlists\n🔗 **Direct URLs** — Paste any supported link!', inline: false },
      { name: '🎵 Tips', value: '• Use buttons for quick control — no typing needed!\n• Volume buttons: 🔈10% 🔉25% 🔊50% 📢75% 💥100%\n• Search gives you 10 results with clickable buttons\n• Loop modes: Off → Track → Queue → Off', inline: false },
    )
    .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music | Boogie-Style VC Playback` })
    .setTimestamp();
  return interaction.reply({ embeds: [embed] });
}

/**
 * Filter/Effects
 */
async function handleFilter(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const filter = interaction.options.getString('name');
  if (filter === 'off') {
    queue.filters.clear();
    const embed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.SUCCESS)
      .setAuthor({ name: `${MUSIC_EMOJIS.disc} Filters Cleared` })
      .setDescription('All audio filters removed! Playing normally.')
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  try {
    queue.filters.add(filter);
    const embed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.SUCCESS)
      .setAuthor({ name: `${MUSIC_EMOJIS.disc} Filter Applied: ${filter}` })
      .setDescription(`🎵 **${filter}** filter is now active!\nUse \`/music filter off\` to remove.`)
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  } catch (err) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR)
        .setDescription(`❌ Invalid filter! Available: 3d, bassboost, echo, karaoke, nightcore, vaporwave, flanger, gate, haas, reverse, surround, tremolo, earwax`)
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Previous song
 */
async function handlePrevious(interaction) {
  if (!disTube) return interaction.reply({ content: '❌ Music not available!', flags: MessageFlags.Ephemeral });

  const queue = disTube.getQueue(interaction.guild);
  if (!queue) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const prev = queue.previous();
    if (!prev) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.WARNING).setDescription('⚠️ No previous song to play!').setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }
    const embed = new EmbedBuilder()
      .setColor(MUSIC_COLORS.SUCCESS)
      .setAuthor({ name: `${MUSIC_EMOJIS.prev} Previous Song` })
      .setDescription(`⏮️ Playing the previous song!`)
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  } catch (err) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.WARNING).setDescription('⚠️ No previous song available!').setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }
}

/* ═══════════════════════════════════════════
   🎛️ Button Interaction Handler
   ═══════════════════════════════════════════ */

async function handleMusicButton(interaction, customId) {
  if (!disTube) return;

  const parts = customId.split('_');
  const actionCode = parts[1];
  const guildId = parts.slice(2).join('_');

  // Search result selection
  if (actionCode.startsWith('s') && actionCode.length > 1 && !actionCode.startsWith('sc')) {
    const selectedIndex = parseInt(actionCode[1]);
    const searchId = parts.slice(2).join('_');
    const searchData = musicState.searchResults.get(searchId);

    if (!searchData || searchData.userId !== interaction.user.id) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ This search has expired or isn\'t yours!').setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (isNaN(selectedIndex) || selectedIndex >= searchData.results.length) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Invalid selection!').setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    const selectedSong = searchData.results[selectedIndex];
    const voiceChannel = interaction.member.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Join a voice channel first!').setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await disTube.play(voiceChannel, selectedSong.url, {
        textChannel: interaction.channel,
        member: interaction.member,
      });

      const selectedEmbed = new EmbedBuilder()
        .setColor(MUSIC_COLORS.SUCCESS)
        .setAuthor({ name: `${MUSIC_EMOJIS.music} Song Selected!` })
        .setTitle(truncate(selectedSong.name, 55))
        .setURL(selectedSong.url)
        .setThumbnail(selectedSong.thumbnail || null)
        .setDescription(`✅ Added to queue!`)
        .setFooter({ text: `${MUSIC_EMOJIS.heart} Abigail Music` })
        .setTimestamp();

      await interaction.update({ embeds: [selectedEmbed], components: [] });
      musicState.searchResults.delete(searchId);
    } catch (err) {
      console.error('Search play error:', err.message);
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription(`❌ Error: ${truncate(err.message, 100)}`).setTimestamp()],
        components: [],
      });
    }
    return;
  }

  // Cancel search
  if (actionCode === 'sc') {
    const searchId = parts.slice(2).join('_');
    musicState.searchResults.delete(searchId);
    await interaction.update({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.WARNING).setDescription('❌ Search cancelled.').setTimestamp()],
      components: [],
    });
    return;
  }

  const queue = disTube.getQueue(interaction.guild);

  // Pause/Resume
  if (actionCode === 'pause') {
    if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
    if (queue.paused) {
      queue.resume();
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.PLAYING).setDescription('▶️ **Resumed!**').setTimestamp()], flags: MessageFlags.Ephemeral });
    } else {
      queue.pause();
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.PAUSED).setDescription('⏸️ **Paused!**').setTimestamp()], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // Skip
  if (actionCode === 'skip') {
    if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
    try {
      await queue.skip();
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS).setDescription('⏭️ **Skipped!**').setTimestamp()], flags: MessageFlags.Ephemeral });
    } catch (e) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Could not skip!').setTimestamp()], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // Stop
  if (actionCode === 'stop') {
    if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
    queue.stop();
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('⏹️ **Stopped!** Left the VC.').setTimestamp()], flags: MessageFlags.Ephemeral });
    return;
  }

  // Previous
  if (actionCode === 'prev') {
    if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
    try {
      const prev = queue.previous();
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS).setDescription('⏮️ **Previous song!**').setTimestamp()], flags: MessageFlags.Ephemeral });
    } catch (e) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.WARNING).setDescription('⚠️ No previous song!').setTimestamp()], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // Queue
  if (actionCode === 'queue') {
    if (!queue || queue.songs.length === 0) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Queue is empty!').setTimestamp()], flags: MessageFlags.Ephemeral });
    }

    let desc = `🎵 **Now:** ${truncate(queue.songs[0].name, 40)}\n\n`;
    const upcoming = queue.songs.slice(1, 6);
    for (let i = 0; i < upcoming.length; i++) {
      desc += `**${i + 1}.** ${truncate(upcoming[i].name, 40)} • ${upcoming[i].formattedDuration || formatDuration(upcoming[i].duration)}\n`;
    }
    if (queue.songs.length > 6) desc += `\n... +${queue.songs.length - 6} more`;

    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.QUEUE)
        .setAuthor({ name: `${MUSIC_EMOJIS.queue} Queue (${queue.songs.length} songs)` })
        .setDescription(desc)
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Loop
  if (actionCode === 'loop') {
    if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Nothing playing!').setTimestamp()], flags: MessageFlags.Ephemeral });
    const newMode = (queue.repeatMode + 1) % 3;
    queue.setRepeatMode(newMode);
    const label = LOOP_LABELS[newMode];
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS).setDescription(`🔁 **Loop: ${label}**`).setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Shuffle
  if (actionCode === 'shuffle') {
    if (!queue || queue.songs.length < 3) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.ERROR).setDescription('❌ Need 3+ songs to shuffle!').setTimestamp()], flags: MessageFlags.Ephemeral });
    }
    queue.shuffle();
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.SUCCESS).setDescription('🔀 **Queue shuffled!**').setTimestamp()], flags: MessageFlags.Ephemeral });
    return;
  }

  // Volume button (show volume controls)
  if (actionCode === 'vol') {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.VOLUME)
        .setAuthor({ name: `${MUSIC_EMOJIS.volume} Volume Control` })
        .setDescription(`🔊 **Current:** ${queue?.volume || 50}%\n👇 Click a button!`)
        .setTimestamp()],
      components: getVolumeButtons(interaction.guild.id),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Volume presets
  if (actionCode.startsWith('v') && actionCode.length <= 4) {
    const volMap = { v10: 10, v25: 25, v50: 50, v75: 75, v100: 100 };
    const vol = volMap[actionCode];
    if (vol && queue) {
      queue.setVolume(vol);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(MUSIC_COLORS.VOLUME).setDescription(`🔊 **Volume set to ${vol}%**`).setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
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

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

/* ═══════════════════════════════════════════
   📦 Exports
   ═══════════════════════════════════════════ */

module.exports = {
  initMusic,
  handleMusicButton,
  musicState,
  disTube: () => disTube,
  MUSIC_COLORS,
  MUSIC_EMOJIS,
  // Command handlers
  handlePlay,
  handleSearch,
  handleSkip,
  handleStop,
  handlePause,
  handleQueue,
  handleVolume,
  handleNowPlaying,
  handleLoop,
  handleShuffle,
  handleJump,
  handleRemove,
  handleLyrics,
  handleFilter,
  handlePrevious,
  handleHelp,
  // Button builders
  getNowPlayingButtons,
  getVolumeButtons,
  getSearchResultButtons,
  // Utilities
  truncate,
  formatDuration,
  formatNumber,
};
