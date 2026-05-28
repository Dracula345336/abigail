const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk-break-access')
    .setDescription('🔐 Manage who can break YOUR AFK with /afk-break')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Allow a user to break your AFK')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user you want to allow')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from your AFK break access list')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user to remove from access')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('See who can break your AFK'))
    .addSubcommand(sub =>
      sub.setName('lock')
        .setDescription('🔒 Lock AFK break — only allowed users can break (not everyone)'))
    .addSubcommand(sub =>
      sub.setName('unlock')
        .setDescription('🔓 Unlock AFK break — anyone can break your AFK')),

  async execute(interaction) {
    const supabase = require('../db');
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    /* ── LOCK — only allowed users can break ── */
    if (subcommand === 'lock') {
      if (supabase) {
        try {
          const { error } = await supabase
            .from('afk_break_access_config')
            .upsert({
              user_id: userId,
              guild_id: guildId,
              locked: true,
            }, { onConflict: 'user_id,guild_id' });

          if (error) console.error('AFK break lock error:', error.message);
        } catch (err) {
          console.error('AFK break lock DB error:', err.message);
        }
      }

      // In-memory cache
      if (!interaction.client.afkBreakAccessConfig) interaction.client.afkBreakAccessConfig = new Map();
      const key = `${guildId}-${userId}`;
      interaction.client.afkBreakAccessConfig.set(key, { locked: true });

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔒 AFK Break Locked!')
        .setDescription(
          'Your AFK is now **locked**!\n\n━━━━━━━━━━━━━━━━━━━\n' +
          '┣ 🔒 Only users you allow can break your AFK\n' +
          '┣ 👑 Server Owner can always break anyone\'s AFK\n' +
          '┗ 📨 Use `/afk-break-access add @user` to allow users'
        )
        .setFooter({ text: '💕 Sweetheart Bot — AFK Protection' })
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
              user_id: userId,
              guild_id: guildId,
              locked: false,
            }, { onConflict: 'user_id,guild_id' });

          if (error) console.error('AFK break unlock error:', error.message);
        } catch (err) {
          console.error('AFK break unlock DB error:', err.message);
        }
      }

      // In-memory cache
      if (!interaction.client.afkBreakAccessConfig) interaction.client.afkBreakAccessConfig = new Map();
      const key = `${guildId}-${userId}`;
      interaction.client.afkBreakAccessConfig.set(key, { locked: false });

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔓 AFK Break Unlocked!')
        .setDescription(
          'Your AFK is now **unlocked**!\n\n━━━━━━━━━━━━━━━━━━━\n' +
          '┣ 🔓 Anyone can break your AFK now\n' +
          '┣ 👑 Server Owner always has access\n' +
          '┗ 🔒 Use `/afk-break-access lock` to restrict again'
        )
        .setFooter({ text: '💕 Sweetheart Bot — AFK Protection' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /* ── ADD ── */
    if (subcommand === 'add') {
      const targetUser = interaction.options.getUser('user');

      if (targetUser.bot) {
        return interaction.reply({ content: '🚫 Cannot add bots to your AFK break access!', flags: MessageFlags.Ephemeral });
      }

      if (targetUser.id === userId) {
        return interaction.reply({ content: '🤔 You don\'t need to add yourself — you control your own AFK!', flags: MessageFlags.Ephemeral });
      }

      if (supabase) {
        try {
          const { data: existing } = await supabase
            .from('afk_break_access')
            .select('user_id')
            .eq('guild_id', guildId)
            .eq('owner_id', userId)
            .eq('allowed_user_id', targetUser.id)
            .maybeSingle();

          if (existing) {
            return interaction.reply({
              content: `✅ **${targetUser.username}** already has access to break your AFK!`,
              flags: MessageFlags.Ephemeral,
            });
          }

          const { error } = await supabase
            .from('afk_break_access')
            .insert({
              guild_id: guildId,
              owner_id: userId,
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
      const key = `${guildId}-${userId}`;
      const allowed = interaction.client.afkBreakAccess.get(key) || new Set();
      allowed.add(targetUser.id);
      interaction.client.afkBreakAccess.set(key, allowed);

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔐 AFK Break Access Granted!')
        .setDescription(
          `**${targetUser.username}** can now break your AFK!\n\n━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 🔓 They can use \`/afk-break\` on you\n` +
          `┣ 👑 Server Owner always has access\n` +
          `┗ 📨 Use \`/afk-break-access remove @${targetUser.username}\` to revoke`
        )
        .setFooter({ text: '💕 Sweetheart Bot — AFK Protection' })
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
            .eq('owner_id', userId)
            .eq('allowed_user_id', targetUser.id);
        } catch (err) {
          console.error('AFK break access DB error (remove):', err.message);
        }
      }

      // In-memory cache
      if (!interaction.client.afkBreakAccess) interaction.client.afkBreakAccess = new Map();
      const key = `${guildId}-${userId}`;
      const allowed = interaction.client.afkBreakAccess.get(key);
      if (allowed) allowed.delete(targetUser.id);

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔐 AFK Break Access Revoked!')
        .setDescription(
          `**${targetUser.username}** can no longer break your AFK!\n\n━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 🔒 They won't be able to use \`/afk-break\` on you\n` +
          `┣ 👑 Server Owner always has access\n` +
          `┗ 📨 Use \`/afk-break-access add @${targetUser.username}\` to re-grant`
        )
        .setFooter({ text: '💕 Sweetheart Bot — AFK Protection' })
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
            .eq('guild_id', guildId)
            .eq('owner_id', userId);
          accessList = data || [];
        } catch (err) {
          console.error('AFK break access DB error (list):', err.message);
        }
      }

      // Also include in-memory
      if (!interaction.client.afkBreakAccess) interaction.client.afkBreakAccess = new Map();
      const key = `${guildId}-${userId}`;
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
      const configKey = `${guildId}-${userId}`;
      const config = interaction.client.afkBreakAccessConfig.get(configKey);
      if (config) isLocked = config.locked;

      // Try DB for lock status
      if (supabase && !config) {
        try {
          const { data: cfgData } = await supabase
            .from('afk_break_access_config')
            .select('locked')
            .eq('guild_id', guildId)
            .eq('user_id', userId)
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
              `Your AFK break access settings:\n\n━━━━━━━━━━━━━━━━━━━\n` +
              `┣ ${lockStatus}\n` +
              `┣ 👑 Server Owner always has access\n` +
              `┗ 📋 No users in your access list\n\n` +
              `Use \`/afk-break-access add @user\` to allow users!\n` +
              `Use \`/afk-break-access lock\` to restrict!`
            )
            .setFooter({ text: '💕 Sweetheart Bot — AFK Protection' })
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
          `Your AFK break access settings:\n\n━━━━━━━━━━━━━━━━━━━\n` +
          `┣ ${lockStatus}\n` +
          `┣ 👑 Server Owner always has access\n` +
          `┗ 📋 **${accessList.length}** user(s) with access:\n\n${userList}`
        )
        .setFooter({ text: '💕 Sweetheart Bot — AFK Protection' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
