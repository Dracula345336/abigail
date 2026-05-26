const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mimic-access')
    .setDescription('🔐 Manage who can use /mimic (Server Owner only)')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Grant mimic access to a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user to grant access')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Revoke mimic access from a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user to revoke access')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('See all users with mimic access')),

  async execute(interaction) {
    const supabase = require('../db');
    const subcommand = interaction.options.getSubcommand();

    // ONLY server owner can manage mimic access
    const isOwner = interaction.guild.ownerId === interaction.user.id;

    if (!isOwner) {
      return interaction.reply({
        content: '🚫 Only the **server owner** can manage mimic access!',
        flags: MessageFlags.Ephemeral,
      });
    }

    /* ── ADD ── */
    if (subcommand === 'add') {
      const targetUser = interaction.options.getUser('user');

      if (targetUser.bot) {
        return interaction.reply({ content: '🚫 Cannot grant mimic access to bots!', flags: MessageFlags.Ephemeral });
      }

      if (supabase) {
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
          .insert({
            guild_id: interaction.guild.id,
            user_id: targetUser.id,
            username: targetUser.username,
            granted_by: interaction.user.id,
          });

        if (error) {
          console.error('Mimic access add error:', error);
          // Fallback to in-memory
          const mimicCmd = interaction.client.commands.get('mimic');
          if (mimicCmd?.mimicAccess) {
            const guildAccess = mimicCmd.mimicAccess.get(interaction.guild.id) || new Set();
            guildAccess.add(targetUser.id);
            mimicCmd.mimicAccess.set(interaction.guild.id, guildAccess);
          }
        }
      } else {
        const mimicCmd = interaction.client.commands.get('mimic');
        if (mimicCmd?.mimicAccess) {
          const guildAccess = mimicCmd.mimicAccess.get(interaction.guild.id) || new Set();
          guildAccess.add(targetUser.id);
          mimicCmd.mimicAccess.set(interaction.guild.id, guildAccess);
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔐 Mimic Access Granted!')
        .setDescription(`**${targetUser.username}** can now use \`/mimic\`!`)
        .addFields({ name: 'Granted by', value: `<@${interaction.user.id}>`, inline: true })
        .setFooter({ text: '👑 Owner action' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    /* ── REMOVE ── */
    if (subcommand === 'remove') {
      const targetUser = interaction.options.getUser('user');

      if (targetUser.id === interaction.guild.ownerId) {
        return interaction.reply({
          content: '🚫 Cannot remove mimic access from the server owner!',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (supabase) {
        await supabase
          .from('mimic_access')
          .delete()
          .eq('guild_id', interaction.guild.id)
          .eq('user_id', targetUser.id);
      }

      const mimicCmd = interaction.client.commands.get('mimic');
      if (mimicCmd?.mimicAccess) {
        const guildAccess = mimicCmd.mimicAccess.get(interaction.guild.id);
        if (guildAccess) guildAccess.delete(targetUser.id);
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔐 Mimic Access Revoked!')
        .setDescription(`**${targetUser.username}** can no longer use \`/mimic\`!`)
        .addFields({ name: 'Removed by', value: `<@${interaction.user.id}>`, inline: true })
        .setFooter({ text: '👑 Owner action' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    /* ── LIST ── */
    if (subcommand === 'list') {
      let accessList = [];

      if (supabase) {
        const { data } = await supabase
          .from('mimic_access')
          .select('*')
          .eq('guild_id', interaction.guild.id);
        accessList = data || [];
      }

      const mimicCmd = interaction.client.commands.get('mimic');
      if (mimicCmd?.mimicAccess) {
        const guildAccess = mimicCmd.mimicAccess.get(interaction.guild.id);
        if (guildAccess) {
          for (const userId of guildAccess) {
            if (!accessList.find(a => a.user_id === userId)) {
              accessList.push({ user_id: userId, username: userId });
            }
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
        .setTitle('🔐 Mimic Access List')
        .setDescription(`**${accessList.length}** user(s) with mimic access:\n\n${userList}\n\n*👑 Owner always has access*`)
        .setFooter({ text: `💕 ${interaction.guild.name}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
