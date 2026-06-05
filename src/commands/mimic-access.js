const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mimic-access')
    .setDescription('🔐 Manage mimic & log access (Owner only)')
    /* ── Mimic Access ── */
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('🎭 Grant mimic access to a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user to grant mimic access')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('🎭 Revoke mimic access from a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user to revoke mimic access')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('🎭 See all users with mimic access'))
    /* ── Log Access ── */
    .addSubcommand(sub =>
      sub.setName('add-log')
        .setDescription('📜 Grant log viewing access to a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user to grant log viewing access')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove-log')
        .setDescription('📜 Revoke log viewing access from a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user to revoke log viewing access')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list-log')
        .setDescription('📜 See all users with log viewing access')),

  async execute(interaction) {
    const supabase = require('../db');
    const subcommand = interaction.options.getSubcommand();

    // ONLY server owner OR bot owner OR Snow can manage access
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '868871716208791593';
    const SNOW_ID = '982661154843291658';
    const isBotOwner = interaction.user.id === BOT_OWNER_ID;
    const isServerOwner = interaction.guild.ownerId === interaction.user.id;
    const isSnow = interaction.user.id === SNOW_ID;

    if (!isBotOwner && !isServerOwner && !isSnow) {
      return interaction.reply({
        content: '🚫 Only the **server owner** or **bot owner** can manage access!',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Ensure client storage exists
    if (!interaction.client.mimicAccess) interaction.client.mimicAccess = new Map();
    if (!interaction.client.mimicLogAccess) interaction.client.mimicLogAccess = new Map();

    /* ═══════════════════════════════════════════
       🎭 MIMIC ACCESS — ADD / REMOVE / LIST
       ═══════════════════════════════════════════ */

    /* ── ADD Mimic ── */
    if (subcommand === 'add') {
      const targetUser = interaction.options.getUser('user');

      if (targetUser.bot) {
        return interaction.reply({ content: '🚫 Cannot grant mimic access to bots!', flags: MessageFlags.Ephemeral });
      }

      if (supabase) {
        try {
          const { data: existing } = await supabase
            .from('mimic_access')
            .select('user_id')
            .eq('guild_id', interaction.guild.id)
            .eq('user_id', targetUser.id)
            .maybeSingle();

          if (existing) {
            return interaction.reply({
              content: `✅ **${targetUser.username}** already has mimic access!`,
              flags: MessageFlags.Ephemeral,
            });
          }

          const { error } = await supabase
            .from('mimic_access')
            .upsert({
              guild_id: interaction.guild.id,
              user_id: targetUser.id,
              username: targetUser.username,
              granted_by: interaction.user.id,
            }, { onConflict: 'guild_id,user_id' });

          if (error) {
            console.error('Mimic access add error:', error.message, error.details, error.hint);
          } else {
            console.log(`[MIMIC ACCESS] ✅ Saved ${targetUser.username} (${targetUser.id}) to DB`);
          }
        } catch (err) {
          console.error('Mimic access DB error (add):', err.message);
        }
      }

      // Also store in-memory on client
      const guildAccess = interaction.client.mimicAccess.get(interaction.guild.id) || new Set();
      guildAccess.add(targetUser.id);
      interaction.client.mimicAccess.set(interaction.guild.id, guildAccess);

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🎭 Mimic Access Granted!')
        .setDescription(`**${targetUser.username}** can now use \`/mimic\`!`)
        .addFields({ name: 'Granted by', value: `<@${interaction.user.id}>`, inline: true })
        .setFooter({ text: '👑 Owner action' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    /* ── REMOVE Mimic ── */
    if (subcommand === 'remove') {
      const targetUser = interaction.options.getUser('user');

      if (targetUser.id === interaction.guild.ownerId) {
        return interaction.reply({ content: '🚫 Cannot remove mimic access from the server owner!', flags: MessageFlags.Ephemeral });
      }

      if (supabase) {
        try {
          await supabase
            .from('mimic_access')
            .delete()
            .eq('guild_id', interaction.guild.id)
            .eq('user_id', targetUser.id);
        } catch (err) {
          console.error('Mimic access DB error (remove):', err.message);
        }
      }

      const guildAccess = interaction.client.mimicAccess.get(interaction.guild.id);
      if (guildAccess) guildAccess.delete(targetUser.id);

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🎭 Mimic Access Revoked!')
        .setDescription(`**${targetUser.username}** can no longer use \`/mimic\`!`)
        .addFields({ name: 'Removed by', value: `<@${interaction.user.id}>`, inline: true })
        .setFooter({ text: '👑 Owner action' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    /* ── LIST Mimic ── */
    if (subcommand === 'list') {
      let accessList = [];

      if (supabase) {
        try {
          const { data } = await supabase
            .from('mimic_access')
            .select('*')
            .eq('guild_id', interaction.guild.id);
          accessList = data || [];
        } catch (err) {
          console.error('Mimic access DB error (list):', err.message);
        }
      }

      const guildAccess = interaction.client.mimicAccess.get(interaction.guild.id);
      if (guildAccess) {
        for (const userId of guildAccess) {
          if (!accessList.find(a => a.user_id === userId)) {
            accessList.push({ user_id: userId, username: userId });
          }
        }
      }

      if (accessList.length === 0) {
        return interaction.reply({
          content: '📋 No users have been granted mimic access yet.\nOnly **you** (owner) can use /mimic by default.\nUse `/mimic-access add @user` to grant access!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const userList = accessList.map((entry, i) => {
        return `**${i + 1}.** <@${entry.user_id}>${entry.username !== entry.user_id ? ` (${entry.username})` : ''}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🎭 Mimic Access List')
        .setDescription(`**${accessList.length}** user(s) with mimic access:\n\n${userList}\n\n*👑 Owner always has access*`)
        .setFooter({ text: `💕 ${interaction.guild.name}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /* ═══════════════════════════════════════════
       📜 LOG ACCESS — ADD-LOG / REMOVE-LOG / LIST-LOG
       ═══════════════════════════════════════════ */

    /* ── ADD-LOG ── */
    if (subcommand === 'add-log') {
      const targetUser = interaction.options.getUser('user');

      if (targetUser.bot) {
        return interaction.reply({ content: '🚫 Cannot grant log access to bots!', flags: MessageFlags.Ephemeral });
      }

      if (supabase) {
        try {
          const { data: existing } = await supabase
            .from('mimic_log_access')
            .select('user_id')
            .eq('guild_id', interaction.guild.id)
            .eq('user_id', targetUser.id)
            .maybeSingle();

          if (existing) {
            return interaction.reply({
              content: `✅ **${targetUser.username}** already has log viewing access!`,
              flags: MessageFlags.Ephemeral,
            });
          }

          const { error } = await supabase
            .from('mimic_log_access')
            .insert({
              guild_id: interaction.guild.id,
              user_id: targetUser.id,
              username: targetUser.username,
              granted_by: interaction.user.id,
            });

          if (error) console.error('Log access add error:', error.message);
        } catch (err) {
          console.error('Log access DB error (add):', err.message);
        }
      }

      // Also store in-memory on client
      const guildLogAccess = interaction.client.mimicLogAccess.get(interaction.guild.id) || new Set();
      guildLogAccess.add(targetUser.id);
      interaction.client.mimicLogAccess.set(interaction.guild.id, guildLogAccess);

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📜 Log Viewing Access Granted!')
        .setDescription(`**${targetUser.username}** can now view anyone's \`/mimic-log\`!`)
        .addFields({ name: 'Granted by', value: `<@${interaction.user.id}>`, inline: true })
        .setFooter({ text: '👑 Owner action' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    /* ── REMOVE-LOG ── */
    if (subcommand === 'remove-log') {
      const targetUser = interaction.options.getUser('user');

      if (targetUser.id === interaction.guild.ownerId) {
        return interaction.reply({ content: '🚫 Cannot remove log access from the server owner!', flags: MessageFlags.Ephemeral });
      }

      if (supabase) {
        try {
          await supabase
            .from('mimic_log_access')
            .delete()
            .eq('guild_id', interaction.guild.id)
            .eq('user_id', targetUser.id);
        } catch (err) {
          console.error('Log access DB error (remove):', err.message);
        }
      }

      const guildLogAccess = interaction.client.mimicLogAccess.get(interaction.guild.id);
      if (guildLogAccess) guildLogAccess.delete(targetUser.id);

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📜 Log Viewing Access Revoked!')
        .setDescription(`**${targetUser.username}** can no longer view others' \`/mimic-log\`!`)
        .addFields({ name: 'Removed by', value: `<@${interaction.user.id}>`, inline: true })
        .setFooter({ text: '👑 Owner action' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    /* ── LIST-LOG ── */
    if (subcommand === 'list-log') {
      let logAccessList = [];

      if (supabase) {
        try {
          const { data } = await supabase
            .from('mimic_log_access')
            .select('*')
            .eq('guild_id', interaction.guild.id);
          logAccessList = data || [];
        } catch (err) {
          console.error('Log access DB error (list):', err.message);
        }
      }

      const guildLogAccess = interaction.client.mimicLogAccess.get(interaction.guild.id);
      if (guildLogAccess) {
        for (const userId of guildLogAccess) {
          if (!logAccessList.find(a => a.user_id === userId)) {
            logAccessList.push({ user_id: userId, username: userId });
          }
        }
      }

      if (logAccessList.length === 0) {
        return interaction.reply({
          content: '📋 No users have been granted log viewing access yet.\nOnly **you** (owner) can view others\' logs by default.\nUse `/mimic-access add-log @user` to grant access!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const userList = logAccessList.map((entry, i) => {
        return `**${i + 1}.** <@${entry.user_id}>${entry.username !== entry.user_id ? ` (${entry.username})` : ''}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📜 Log Viewing Access List')
        .setDescription(`**${logAccessList.length}** user(s) with log viewing access:\n\n${userList}\n\n*👑 Owner always has access*`)
        .setFooter({ text: `💕 ${interaction.guild.name}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
