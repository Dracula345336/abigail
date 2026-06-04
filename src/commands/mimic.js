const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

const RANDOM_LINES = [
  "Hey everyone! 👋",
  "I'm here! ✨",
  "What's up? 😄",
  "Hello beautiful people! 💕",
  "Did someone call me? 🤔",
  "I just wanted to say hi! 🌸",
  "Guess who's back? 😎",
  "Sending hugs to everyone! 🤗",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mimic')
    .setDescription('🎭 Mimic another user in this channel')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to mimic')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('What should they say? (random if blank)')
        .setRequired(false)
        .setMaxLength(2000)),

  async execute(interaction) {
    const supabase = require('../db');
    const targetUser = interaction.options.getUser('user');
    const customMsg = interaction.options.getString('message');

    /* ── Check mimic access ── */
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '868871716208791593';
    const isBotOwner = interaction.user.id === BOT_OWNER_ID;
    const isServerOwner = interaction.guild.ownerId === interaction.user.id;
    let hasAccess = isBotOwner || isServerOwner;

    // Check Supabase access list (with error handling if table doesn't exist)
    if (!hasAccess && supabase) {
      try {
        const { data } = await supabase
          .from('mimic_access')
          .select('user_id')
          .eq('guild_id', interaction.guild.id)
          .eq('user_id', interaction.user.id)
          .maybeSingle();
        hasAccess = !!data;
      } catch (err) {
        console.error('Mimic access DB check failed:', err.message);
      }
    }

    // Fallback: check in-memory access list on client
    if (!hasAccess && interaction.client.mimicAccess) {
      const guildAccess = interaction.client.mimicAccess.get(interaction.guild.id);
      hasAccess = guildAccess && guildAccess.has(interaction.user.id);
    }

    if (!hasAccess) {
      return interaction.reply({
        content: '🚫 You don\'t have mimic access! Only the server owner can grant it with `/mimic-access`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    /* ── Guards ── */
    // Self-mimic is now allowed for everyone with mimic access

    /* ── Check mimic-protected ── */
    if (targetUser.id !== interaction.user.id) {
      let isProtected = false;
      // Bot owner bypasses protection
      if (!isBotOwner) {
        // Check Supabase
        if (supabase) {
          try {
            const { data } = await supabase
              .from('mimic_protected')
              .select('user_id')
              .eq('guild_id', interaction.guild.id)
              .eq('user_id', targetUser.id)
              .maybeSingle();
            isProtected = !!data;
          } catch (err) {
            console.error('Mimic protected DB check failed:', err.message);
          }
        }
        // Check in-memory
        if (!isProtected && interaction.client.mimicProtected) {
          const guildProtected = interaction.client.mimicProtected.get(interaction.guild.id);
          isProtected = guildProtected && guildProtected.has(targetUser.id);
        }
        if (isProtected) {
          return interaction.reply({ content: `🛡️ **${targetUser.username}** is mimic-protected! Only the bot owner can remove protection.`, flags: MessageFlags.Ephemeral });
        }
      }
    }

    // Check Manage Webhooks permission before trying
    const botMember = await interaction.guild.members.fetchMe();
    if (!botMember.permissionsIn(interaction.channel).has('ManageWebhooks')) {
      return interaction.reply({
        content: '🚫 I need **Manage Webhooks** permission in this channel to mimic!\n\n**Fix:** Server Settings → Roles → Bot role → ✅ Manage Webhooks ON',
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetMember = interaction.options.getMember('user');
    const targetName = targetMember?.displayName || targetUser.username;
    const targetAvatar = targetUser.displayAvatarURL({ dynamic: true, size: 256 });

    const msgContent = customMsg || RANDOM_LINES[Math.floor(Math.random() * RANDOM_LINES.length)];

    /* ── Webhook magic ── */
    try {
      const webhook = await interaction.channel.createWebhook({
        name: targetName,
        avatar: targetAvatar,
        reason: `Mimic command by ${interaction.user.tag}`,
      });

      await webhook.send(msgContent);
      await webhook.delete('Mimic command cleanup');

      /* ── Log the mimic use on client (persistent) ── */
      if (!interaction.client.mimicLog) interaction.client.mimicLog = new Map();

      const logKey = `${interaction.guild.id}-${interaction.user.id}`;
      const logEntry = {
        target: targetUser,
        targetName,
        message: msgContent,
        channel: interaction.channel,
        timestamp: new Date(),
      };

      const userLog = interaction.client.mimicLog.get(logKey) || [];
      userLog.unshift(logEntry);
      if (userLog.length > 100) userLog.pop();
      interaction.client.mimicLog.set(logKey, userLog);

      /* ── Send log to mimic-log channel if set ── */
      let logChannelId = null;

      // Check in-memory cache first
      if (interaction.client.mimicLogChannel) {
        logChannelId = interaction.client.mimicLogChannel.get(interaction.guild.id);
      }

      // If not cached, check DB
      if (!logChannelId && supabase) {
        try {
          const { data, error: dbErr } = await supabase
            .from('mimic_log_channel')
            .select('channel_id')
            .eq('guild_id', interaction.guild.id)
            .maybeSingle();
          if (dbErr) {
            console.error('[MIMIC LOG] Supabase fetch error:', dbErr.message);
          }
          if (data) {
            logChannelId = data.channel_id;
            if (!interaction.client.mimicLogChannel) interaction.client.mimicLogChannel = new Map();
            interaction.client.mimicLogChannel.set(interaction.guild.id, logChannelId);
          }
        } catch (err) {
          console.error('[MIMIC LOG] DB error:', err.message);
        }
      }

      // If still no log channel, try to find existing #mimic-logs channel in the server
      if (!logChannelId) {
        const existingCh = interaction.guild.channels.cache.find(ch => ch.name === 'mimic-logs' && ch.isTextBased());
        if (existingCh) {
          logChannelId = existingCh.id;
          // Cache it
          if (!interaction.client.mimicLogChannel) interaction.client.mimicLogChannel = new Map();
          interaction.client.mimicLogChannel.set(interaction.guild.id, logChannelId);
          // Save to DB
          if (supabase) {
            try {
              await supabase
                .from('mimic_log_channel')
                .upsert({ guild_id: interaction.guild.id, channel_id: existingCh.id, channel_name: existingCh.name }, { onConflict: 'guild_id' });
            } catch (e) { console.error('[MIMIC LOG] Auto-save channel error:', e.message); }
          }
        }
      }

      if (logChannelId) {
        try {
          const logCh = await interaction.client.channels.fetch(logChannelId).catch(() => null);
          if (logCh && logCh.isSendable()) {
            const logEmbed = new EmbedBuilder()
              .setColor(0x2B2D31)
              .setAuthor({ name: `🎭 ${interaction.user.username} used /mimic`, iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 128 }) })
              .setDescription(
                `━━━━━━━━━━━━━━━━━━━\n` +
                `┣ 🎭 **Mimicked:** ${targetName} (<@${targetUser.id}>)\n` +
                `┣ 👤 **By:** ${interaction.user.username} (<@${interaction.user.id}>)\n` +
                `┣ 📢 **Channel:** <#${interaction.channel.id}>\n` +
                `┣ 💬 **Message:**\n> ${msgContent.length > 300 ? msgContent.slice(0, 300) + '...' : msgContent}\n` +
                `┗ ⏰ **Time:** <t:${Math.floor(Date.now() / 1000)}:R>`
              )
              .setFooter({ text: `User ID: ${interaction.user.id} | Target ID: ${targetUser.id}` })
              .setTimestamp();
            await logCh.send({ embeds: [logEmbed] });
          } else if (logCh) {
            console.error(`[MIMIC LOG] ❌ Channel ${logCh.name} exists but bot can't send messages — check permissions`);
          } else {
            console.error(`[MIMIC LOG] ❌ Channel ${logChannelId} not found — may have been deleted`);
          }
        } catch (err) {
          console.error('[MIMIC LOG] ❌ Failed to send:', err.message);
        }
      }

      await interaction.reply({
        content: `🎭 Successfully mimicked **${targetName}**!`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Mimic webhook error:', error.message);
      await interaction.reply({
        content: `💔 Couldn't mimic — **${error.message}**\n\n💡 Make sure I have **Manage Webhooks** permission!`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
