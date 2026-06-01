const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk-break-access')
    .setDescription('🔐 Manage who can break AFK — bot owner only')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Allow a user to break protected AFKs')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user you want to allow')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from AFK break access list')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user to remove from access')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('See who has AFK break access'))
    .addSubcommand(sub =>
      sub.setName('lock')
        .setDescription('🔒 Lock AFK break globally — only allowed users can break'))
    .addSubcommand(sub =>
      sub.setName('unlock')
        .setDescription('🔓 Unlock AFK break — anyone can break AFK')),

  async execute(interaction) {
    const supabase = require('../db');
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '868871716208791593';
    const isBotOwner = interaction.user.id === BOT_OWNER_ID;

    if (!isBotOwner) {
      return interaction.reply({
        content: '🚫 Only the **bot owner** can manage AFK break access!',
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    /* ── LOCK — only allowed users can break ── */
    if (subcommand === 'lock') {
      if (supabase) {
        try {
          const { error } = await supabase
            .from('afk_break_access_config')
            .upsert({
              guild_id: guildId,
              locked: true,
            }, { onConflict: 'guild_id' });

          if (error) console.error('AFK break lock error:', error.message);
        } catch (err) {
          console.error('AFK break lock DB error:', err.message);
        }
      }

      // In-memory cache
      if (!interaction.client.afkBreakAccessConfig) interaction.client.afkBreakAccessConfig = new Map();
      interaction.client.afkBreakAccessConfig.set(guildId, { locked: true });

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔒 AFK Break Locked!')
        .setDescription(
          'AFK break is now **locked** for this server!\n\n━━━━━━━━━━━━━━━━━━━\n' +
          '┣ 🔒 Only users you allow can break AFK\n' +
          '┣ 👑 Bot Owner always has access\n' +
          '┗ 📨 Use `/afk-break-access add @user` to allow users'
        )
        .setFooter({ text: '💕 Abigail — AFK Protection' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /* ── UNLOCK — anyone can break ── */
    if (subcommand === 'unlock') {
      if (supabase) {
        try {
          const { error } = await supabase
            .from('afk_break_access_config')
            .upsert({
              guild_id: guildId,
              locked: false,
            }, { onConflict: 'guild_id' });

          if (error) console.error('AFK break unlock error:', error.message);
        } catch (err) {
          console.error('AFK break unlock DB error:', err.message);
        }
      }

      // In-memory cache
      if (!interaction.client.afkBreakAccessConfig) interaction.client.afkBreakAccessConfig = new Map();
      interaction.client.afkBreakAccessConfig.set(guildId, { locked: false });

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔓 AFK Break Unlocked!')
        .setDescription(
          'AFK break is now **unlocked** for this server!\n\n━━━━━━━━━━━━━━━━━━━\n' +
          '┣ 🔓 Anyone can break AFK now\n' +
          '┣ 👑 Bot Owner always has access\n' +
          '┗ 🔒 Use `/afk-break-access lock` to restrict again'
        )
        .setFooter({ text: '💕 Abigail — AFK Protection' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /* ── ADD ── */
    if (subcommand === 'add') {
      const targetUser = interaction.options.getUser('user');

      if (targetUser.bot) {
        return interaction.reply({ content: '🚫 Cannot add bots to AFK break access!', flags: MessageFlags.Ephemeral });
      }

      if (targetUser.id === BOT_OWNER_ID) {
        return interaction.reply({ content: '👑 Bot owner already has access to break all AFKs!', flags: MessageFlags.Ephemeral });
      }

      if (supabase) {
        try {
          const { data: existing } = await supabase
            .from('afk_break_access')
            .select('id')
            .eq('guild_id', guildId)
            .eq('allowed_user_id', targetUser.id)
            .maybeSingle();

          if (existing) {
            return interaction.reply({
              content: `✅ **${targetUser.username}** already has AFK break access!`,
              flags: MessageFlags.Ephemeral,
            });
          }

          const { error } = await supabase
            .from('afk_break_access')
            .insert({
              guild_id: guildId,
              owner_id: interaction.user.id,
              allowed_user_id: targetUser.id,
              allowed_username: targetUser.username,
            });

          if (error) {
            console.error('AFK break access add error:', error.message);
          }
        } catch (err) {
          console.error('AFK break access DB error (add):', err.message);
        }
      }

      // In-memory cache
      if (!interaction.client.afkBreakAccess) interaction.client.afkBreakAccess = new Map();
      const key = guildId;
      const allowed = interaction.client.afkBreakAccess.get(key) || new Set();
      allowed.add(targetUser.id);
      interaction.client.afkBreakAccess.set(key, allowed);

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔐 AFK Break Access Granted!')
        .setDescription(
          `**${targetUser.username}** can now break protected AFKs!\n\n━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 🔓 They can use \`/afk-break\` on anyone\n` +
          `┣ 👑 Bot Owner always has access\n` +
          `┗ 📨 Use \`/afk-break-access remove @${targetUser.username}\` to revoke`
        )
        .setFooter({ text: '💕 Abigail — AFK Protection' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /* ── REMOVE ── */
    if (subcommand === 'remove') {
      const targetUser = interaction.options.getUser('user');

      if (supabase) {
        try {
          await supabase
            .from('afk_break_access')
            .delete()
            .eq('guild_id', guildId)
            .eq('allowed_user_id', targetUser.id);
        } catch (err) {
          console.error('AFK break access DB error (remove):', err.message);
        }
      }

      // In-memory cache
      if (!interaction.client.afkBreakAccess) interaction.client.afkBreakAccess = new Map();
      const key = guildId;
      const allowed = interaction.client.afkBreakAccess.get(key);
      if (allowed) allowed.delete(targetUser.id);

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔐 AFK Break Access Revoked!')
        .setDescription(
          `**${targetUser.username}** can no longer break protected AFKs!\n\n━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 🔒 They won't be able to use \`/afk-break\` on protected users\n` +
          `┣ 👑 Bot Owner always has access\n` +
          `┗ 📨 Use \`/afk-break-access add @${targetUser.username}\` to re-grant`
        )
        .setFooter({ text: '💕 Abigail — AFK Protection' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /* ── LIST ── */
    if (subcommand === 'list') {
      let accessList = [];

      if (supabase) {
        try {
          const { data } = await supabase
            .from('afk_break_access')
            .select('*')
            .eq('guild_id', guildId);
          accessList = data || [];
        } catch (err) {
          console.error('AFK break access DB error (list):', err.message);
        }
      }

      // Also include in-memory
      if (!interaction.client.afkBreakAccess) interaction.client.afkBreakAccess = new Map();
      const key = guildId;
      const memAccess = interaction.client.afkBreakAccess.get(key);
      if (memAccess) {
        for (const uid of memAccess) {
          if (!accessList.find(a => a.allowed_user_id === uid)) {
            accessList.push({ allowed_user_id: uid, allowed_username: uid });
          }
        }
      }

      // Check lock status
      let isLocked = false;
      if (!interaction.client.afkBreakAccessConfig) interaction.client.afkBreakAccessConfig = new Map();
      const config = interaction.client.afkBreakAccessConfig.get(guildId);
      if (config) isLocked = config.locked;

      // Try DB for lock status
      if (supabase && !config) {
        try {
          const { data: cfgData } = await supabase
            .from('afk_break_access_config')
            .select('locked')
            .eq('guild_id', guildId)
            .maybeSingle();
          if (cfgData) isLocked = cfgData.locked;
        } catch (err) {}
      }

      const lockStatus = isLocked ? '🔒 **Locked** — Only allowed users can break' : '🔓 **Unlocked** — Anyone can break';

      if (accessList.length === 0) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xFF69B4)
            .setTitle('🔐 AFK Break Access List')
            .setDescription(
              `AFK break access settings for this server:\n\n━━━━━━━━━━━━━━━━━━━\n` +
              `┣ ${lockStatus}\n` +
              `┣ 👑 Bot Owner always has access\n` +
              `┗ 📋 No users in the access list\n\n` +
              `Use \`/afk-break-access add @user\` to allow users!\n` +
              `Use \`/afk-break-access lock\` to restrict!`
            )
            .setFooter({ text: '💕 Abigail — AFK Protection' })
            .setTimestamp()],
          flags: MessageFlags.Ephemeral,
        });
      }

      const userList = accessList.map((entry, i) => {
        return `**${i + 1}.** <@${entry.allowed_user_id}>${entry.allowed_username !== entry.allowed_user_id ? ` (${entry.allowed_username})` : ''}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔐 AFK Break Access List')
        .setDescription(
          `AFK break access settings for this server:\n\n━━━━━━━━━━━━━━━━━━━\n` +
          `┣ ${lockStatus}\n` +
          `┣ 👑 Bot Owner always has access\n` +
          `┗ 📋 **${accessList.length}** user(s) with access:\n\n${userList}`
        )
        .setFooter({ text: '💕 Abigail — AFK Protection' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
