const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lootbox')
    .setDescription('🎁 Lootbox system - manage auto-spawning lootboxes')
    .addSubcommand(sub =>
      sub.setName('toggle')
        .setDescription('Toggle lootbox drops on/off (server owner & bot owner only)')
        .addBooleanOption(opt =>
          opt.setName('enabled')
            .setDescription('Enable or disable lootbox drops')
            .setRequired(true))
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel for lootbox drops (required when enabling)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Check lootbox settings for this server'))
    .addSubcommand(sub =>
      sub.setName('drop')
        .setDescription('Manually drop a lootbox now (server owner & bot owner only)')),

  async execute(interaction) {
    const supabase = require('../db');
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '868871716208791593';
    const isBotOwner = interaction.user.id === BOT_OWNER_ID;
    const isServerOwner = interaction.guild.ownerId === interaction.user.id;
    const subcmd = interaction.options.getSubcommand();

    /* ── STATUS ── */
    if (subcmd === 'status') {
      let enabled = false;
      let channelId = null;

      if (supabase) {
        try {
          const { data } = await supabase
            .from('lootbox_config')
            .select('*')
            .eq('guild_id', interaction.guild.id)
            .maybeSingle();
          if (data) { enabled = data.enabled; channelId = data.channel_id; }
        } catch (err) {
          console.error('Lootbox config fetch error:', err.message);
        }
      }

      // Check in-memory
      if (interaction.client.lootboxConfig) {
        const cfg = interaction.client.lootboxConfig.get(interaction.guild.id);
        if (cfg) { enabled = cfg.enabled; channelId = cfg.channelId; }
      }

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🎁 Lootbox Status')
        .setDescription(
          `━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 📡 **Drops:** ${enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
          `┣ 📢 **Channel:** ${channelId ? `<#${channelId}>` : 'Not set'}\n` +
          `┣ ⏰ **Interval:** Every 5 minutes\n` +
          `┗ 🎲 **Items:** Timeouts, Coins, Surprises!`
        )
        .setFooter({ text: 'Use /lootbox toggle to enable' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /* ── Permission check for toggle & drop ── */
    if (!isBotOwner && !isServerOwner) {
      return interaction.reply({ content: '🚫 Only the server owner or bot owner can manage lootbox settings!', flags: MessageFlags.Ephemeral });
    }

    /* ── TOGGLE ── */
    if (subcmd === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled');
      const channel = interaction.options.getChannel('channel');

      if (enabled && !channel) {
        return interaction.reply({ content: '❌ You must specify a channel when enabling lootbox drops!', flags: MessageFlags.Ephemeral });
      }

      const channelId = channel ? channel.id : null;

      // Save to Supabase
      if (supabase) {
        try {
          await supabase
            .from('lootbox_config')
            .upsert({
              guild_id: interaction.guild.id,
              enabled,
              channel_id: channelId,
              guild_name: interaction.guild.name,
            }, { onConflict: 'guild_id' });
        } catch (err) {
          console.error('Lootbox config save error:', err.message);
        }
      }

      // Save to in-memory
      if (!interaction.client.lootboxConfig) interaction.client.lootboxConfig = new Map();
      interaction.client.lootboxConfig.set(interaction.guild.id, { enabled, channelId });

      const embed = new EmbedBuilder()
        .setColor(enabled ? 0x00FF00 : 0xFF0000)
        .setTitle(`🎁 Lootbox Drops ${enabled ? 'Enabled' : 'Disabled'}!`)
        .setDescription(
          enabled
            ? `Lootboxes will now drop in <#${channelId}> every 5 minutes! 🪂\n\nFirst person to click gets the prize!`
            : 'Lootbox drops have been stopped. 🛑'
        )
        .setFooter({ text: `Changed by ${interaction.user.username}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    /* ── DROP ── */
    if (subcmd === 'drop') {
      const { spawnLootbox } = require('../lootbox');

      let channelId = null;
      if (interaction.client.lootboxConfig) {
        const cfg = interaction.client.lootboxConfig.get(interaction.guild.id);
        if (cfg) channelId = cfg.channelId;
      }

      await spawnLootbox(interaction.guild, channelId || interaction.channel.id);
      return interaction.reply({ content: '🎁 Lootbox dropped!', flags: MessageFlags.Ephemeral });
    }
  },
};
