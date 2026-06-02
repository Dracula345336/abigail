const { SlashCommandBuilder, MessageFlags, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mimic-log-channel')
    .setDescription('📋 Set up a private mimic log channel (bot owner only)')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set an existing channel as the mimic log channel')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('The private channel for mimic logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Auto-create a private #mimic-logs channel'))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove the mimic log channel (stop logging)'))
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('See current mimic log channel setting')),

  async execute(interaction) {
    const supabase = require('../db');
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '868871716208791593';

    if (interaction.user.id !== BOT_OWNER_ID) {
      return interaction.reply({
        content: '🚫 Only the **bot owner** can set up the mimic log channel!',
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcmd = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    /* ── SET — use an existing channel ── */
    if (subcmd === 'set') {
      const channel = interaction.options.getChannel('channel');

      // Save to Supabase
      if (supabase) {
        try {
          const { error } = await supabase
            .from('mimic_log_channel')
            .upsert({ guild_id: guildId, channel_id: channel.id, channel_name: channel.name }, { onConflict: 'guild_id' });
          if (error) console.error('mimic_log_channel upsert error:', error.message);
        } catch (err) {
          console.error('mimic_log_channel DB error:', err.message);
        }
      }

      // Cache in-memory
      if (!interaction.client.mimicLogChannel) interaction.client.mimicLogChannel = new Map();
      interaction.client.mimicLogChannel.set(guildId, channel.id);

      const embed = new EmbedBuilder()
        .setColor(0x00D4FF)
        .setTitle('📋 Mimic Log Channel Set!')
        .setDescription(
          `All mimic uses will now be logged to ${channel}!\n\n━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 📋 **Channel:** ${channel.name}\n` +
          `┣ 🔒 Make sure only trusted people can see it\n` +
          `┗ 🛑 Use \`/mimic-log-channel remove\` to stop logging`
        )
        .setFooter({ text: '🎭 Abigail — Mimic Logger' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /* ── CREATE — auto-create a private channel ── */
    if (subcmd === 'create') {
      try {
        const botMember = await interaction.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.reply({
            content: '🚫 I need **Manage Channels** permission to create a private channel!',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Check if channel already exists
        const existing = interaction.guild.channels.cache.find(ch => ch.name === 'mimic-logs' && ch.type === ChannelType.GuildText);
        if (existing) {
          // Save it
          if (supabase) {
            try {
              await supabase
                .from('mimic_log_channel')
                .upsert({ guild_id: guildId, channel_id: existing.id, channel_name: existing.name }, { onConflict: 'guild_id' });
            } catch (err) { console.error('mimic_log_channel DB error:', err.message); }
          }
          if (!interaction.client.mimicLogChannel) interaction.client.mimicLogChannel = new Map();
          interaction.client.mimicLogChannel.set(guildId, existing.id);

          return interaction.reply({
            content: `📋 Channel ${existing} already exists! Set as mimic log channel. ✅`,
            flags: MessageFlags.Ephemeral,
          });
        }

        // Create private channel — only bot owner + bot can see
        const newChannel = await interaction.guild.channels.create({
          name: 'mimic-logs',
          type: ChannelType.GuildText,
          topic: '🎭 Private mimic usage logs — only bot owner can see',
          permissionOverwrites: [
            {
              id: interaction.guild.id, // @everyone
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: interaction.user.id, // bot owner
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            },
            {
              id: botMember.id, // bot itself
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            },
          ],
          reason: 'Mimic log channel created by bot owner',
        });

        // Save to Supabase
        if (supabase) {
          try {
            await supabase
              .from('mimic_log_channel')
              .upsert({ guild_id: guildId, channel_id: newChannel.id, channel_name: newChannel.name }, { onConflict: 'guild_id' });
          } catch (err) { console.error('mimic_log_channel DB error:', err.message); }
        }

        // Cache in-memory
        if (!interaction.client.mimicLogChannel) interaction.client.mimicLogChannel = new Map();
        interaction.client.mimicLogChannel.set(guildId, newChannel.id);

        const embed = new EmbedBuilder()
          .setColor(0x00D4FF)
          .setTitle('📋 Mimic Log Channel Created!')
          .setDescription(
            `Private channel ${newChannel} has been created!\n\n━━━━━━━━━━━━━━━━━━━\n` +
            `┣ 🔒 Only you and the bot can see it\n` +
            `┣ 📋 Every mimic use will be logged here\n` +
            `┗ ➕ Add more people via channel permissions if needed`
          )
          .setFooter({ text: '🎭 Abigail — Mimic Logger' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        console.error('Create mimic log channel error:', err.message);
        return interaction.reply({
          content: `❌ Failed to create channel: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    /* ── REMOVE — stop logging ── */
    if (subcmd === 'remove') {
      if (supabase) {
        try {
          await supabase
            .from('mimic_log_channel')
            .delete()
            .eq('guild_id', guildId);
        } catch (err) {
          console.error('mimic_log_channel delete error:', err.message);
        }
      }

      if (interaction.client.mimicLogChannel) {
        interaction.client.mimicLogChannel.delete(guildId);
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF4444)
        .setTitle('🛑 Mimic Log Channel Removed!')
        .setDescription('Mimic uses will no longer be logged to any channel.')
        .setFooter({ text: '🎭 Abigail — Mimic Logger' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /* ── VIEW — see current setting ── */
    if (subcmd === 'view') {
      let channelId = null;

      // Check in-memory
      if (interaction.client.mimicLogChannel) {
        channelId = interaction.client.mimicLogChannel.get(guildId);
      }

      // Check DB
      if (!channelId && supabase) {
        try {
          const { data } = await supabase
            .from('mimic_log_channel')
            .select('channel_id')
            .eq('guild_id', guildId)
            .maybeSingle();
          if (data) channelId = data.channel_id;
        } catch (err) {
          console.error('mimic_log_channel view error:', err.message);
        }
      }

      if (!channelId) {
        return interaction.reply({
          content: '📋 No mimic log channel set! Use `/mimic-log-channel create` to auto-create one.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const channel = interaction.guild.channels.cache.get(channelId);
      const embed = new EmbedBuilder()
        .setColor(0x00D4FF)
        .setTitle('📋 Mimic Log Channel')
        .setDescription(
          `Mimic logs are being sent to ${channel || `<#${channelId}>`}\n\n━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 📋 **Channel:** ${channel ? channel.name : 'Unknown (deleted?)'}\n` +
          `┣ 🆔 **ID:** ${channelId}\n` +
          `┗ 🛑 Use \`/mimic-log-channel remove\` to stop logging`
        )
        .setFooter({ text: '🎭 Abigail — Mimic Logger' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
