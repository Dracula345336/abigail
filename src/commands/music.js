const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const {
  handlePlay, handleSearch, handleSkip, handleStop, handlePause,
  handleQueue, handleVolume, handleNowPlaying, handleLoop, handleShuffle,
  handleJump, handleRemove, handleLyrics, handleFilter, handlePrevious,
  handleHelp, MUSIC_EMOJIS,
} = require('../music');

/* ═══════════════════════════════════════════
   🎵 /music — Boogie-Style Music Command
   ═══════════════════════════════════════════ */

module.exports = {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('🎵 Boogie-style music — Play, search, and control music in VC!')
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('▶️ Play a song or add to queue (YouTube, Spotify, SoundCloud)')
        .addStringOption(opt =>
          opt.setName('song')
            .setDescription('Song name, YouTube/Spotify/SoundCloud URL')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('search')
        .setDescription('🔍 Search for a song and pick with buttons!')
        .addStringOption(opt =>
          opt.setName('query')
            .setDescription('What do you want to search for?')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('skip')
        .setDescription('⏭️ Skip the current song'))
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('⏹️ Stop playback and clear the queue'))
    .addSubcommand(sub =>
      sub.setName('pause')
        .setDescription('⏸️ Pause or resume playback'))
    .addSubcommand(sub =>
      sub.setName('queue')
        .setDescription('📋 View the current queue'))
    .addSubcommand(sub =>
      sub.setName('nowplaying')
        .setDescription('🎵 Show current song info with controls'))
    .addSubcommand(sub =>
      sub.setName('volume')
        .setDescription('🔊 Set or check volume')
        .addIntegerOption(opt =>
          opt.setName('level')
            .setDescription('Volume level (1-150)')
            .setMinValue(1).setMaxValue(150).setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('loop')
        .setDescription('🔁 Toggle loop mode')
        .addStringOption(opt =>
          opt.setName('mode')
            .setDescription('Loop mode')
            .setRequired(false)
            .addChoices(
              { name: '🔄 Toggle (cycle through modes)', value: 'toggle' },
              { name: '➡️ Off', value: 'off' },
              { name: '🔂 Track', value: 'track' },
              { name: '🔁 Queue', value: 'queue' },
            )))
    .addSubcommand(sub =>
      sub.setName('shuffle')
        .setDescription('🔀 Shuffle the queue'))
    .addSubcommand(sub =>
      sub.setName('previous')
        .setDescription('⏮️ Play the previous song'))
    .addSubcommand(sub =>
      sub.setName('jump')
        .setDescription('⏩ Jump to a specific song in the queue')
        .addIntegerOption(opt =>
          opt.setName('position')
            .setDescription('Position in queue (1 = next song)')
            .setMinValue(1).setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('🗑️ Remove a song from the queue')
        .addIntegerOption(opt =>
          opt.setName('position')
            .setDescription('Position in queue to remove')
            .setMinValue(1).setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('filter')
        .setDescription('🎛️ Apply audio filters/effects')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Filter name')
            .setRequired(true)
            .addChoices(
              { name: '⬅️ Off (clear all filters)', value: 'off' },
              { name: '🎧 3D', value: '3d' },
              { name: '🔊 Bass Boost', value: 'bassboost' },
              { name: '📣 Echo', value: 'echo' },
              { name: '🎤 Karaoke', value: 'karaoke' },
              { name: '⚡ Nightcore', value: 'nightcore' },
              { name: '🌅 Vaporwave', value: 'vaporwave' },
              { name: '🎸 Flanger', value: 'flanger' },
              { name: '🚪 Gate', value: 'gate' },
              { name: '🔊 Haas', value: 'haas' },
              { name: '⏪ Reverse', value: 'reverse' },
              { name: '🔈 Surround', value: 'surround' },
              { name: '📉 Tremolo', value: 'tremolo' },
            )))
    .addSubcommand(sub =>
      sub.setName('lyrics')
        .setDescription('📝 Search for song lyrics')
        .addStringOption(opt =>
          opt.setName('song')
            .setDescription('Song name to search lyrics for')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('help')
        .setDescription('❓ Music bot help & commands')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'play':
        return handlePlay(interaction);
      case 'search':
        return handleSearch(interaction);
      case 'skip':
        return handleSkip(interaction);
      case 'stop':
        return handleStop(interaction);
      case 'pause':
        return handlePause(interaction);
      case 'queue':
        return handleQueue(interaction);
      case 'nowplaying':
        return handleNowPlaying(interaction);
      case 'volume':
        return handleVolume(interaction);
      case 'loop':
        return handleLoop(interaction);
      case 'shuffle':
        return handleShuffle(interaction);
      case 'previous':
        return handlePrevious(interaction);
      case 'jump':
        return handleJump(interaction);
      case 'remove':
        return handleRemove(interaction);
      case 'filter':
        return handleFilter(interaction);
      case 'lyrics':
        return handleLyrics(interaction);
      case 'help':
        return handleHelp(interaction);
      default:
        return interaction.reply({
          content: '❌ Unknown music subcommand!',
          flags: MessageFlags.Ephemeral,
        });
    }
  },
};
