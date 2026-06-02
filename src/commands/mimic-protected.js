const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mimic-protected')
    .setDescription('🛡️ Manage mimic-protected users (bot owner only)')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Protect a user from being mimicked')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user to protect')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove mimic protection from a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user to unprotect')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all mimic-protected users in this server')),

  async execute(interaction) {
    const supabase = require('../db');
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '868871716208791593';
    const isBotOwner = interaction.user.id === BOT_OWNER_ID;

    if (!isBotOwner) {
      return interaction.reply({
        content: '🚫 Only the **bot owner** can manage mimic-protected users!',
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcmd = interaction.options.getSubcommand();

    /* ── ADD ── */
    if (subcmd === 'add') {
      const targetUser = interaction.options.getUser('user');

      if (targetUser.id === BOT_OWNER_ID) {
        return interaction.reply({ content: '🛡️ You\'re already the bot owner — nobody can mimic you without your permission anyway!', flags: MessageFlags.Ephemeral });
      }

      // Add to Supabase
      if (supabase) {
        try {
          const { error } = await supabase
            .from('mimic_protected')
            .upsert({ guild_id: interaction.guild.id, user_id: targetUser.id, username: targetUser.username }, { onConflict: 'guild_id,user_id' });
          if (error) console.error('mimic_protected upsert error:', error.message);
        } catch (err) {
          console.error('mimic_protected DB error:', err.message);
        }
      }

      // Add to in-memory
      if (!interaction.client.mimicProtected) interaction.client.mimicProtected = new Map();
      let guildProtected = interaction.client.mimicProtected.get(interaction.guild.id);
      if (!guildProtected) { guildProtected = new Set(); interaction.client.mimicProtected.set(interaction.guild.id, guildProtected); }
      guildProtected.add(targetUser.id);

      const embed = new EmbedBuilder()
        .setColor(0x00D4FF)
        .setTitle('🛡️ Mimic Protection Added')
        .setDescription(`**${targetUser.username}** is now protected from being mimicked!\nNobody (except the bot owner) can mimic them.`)
        .setFooter({ text: `Protected by ${interaction.user.username}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /* ── REMOVE ── */
    if (subcmd === 'remove') {
      const targetUser = interaction.options.getUser('user');

      // Remove from Supabase
      if (supabase) {
        try {
          await supabase.from('mimic_protected').delete().eq('guild_id', interaction.guild.id).eq('user_id', targetUser.id);
        } catch (err) {
          console.error('mimic_protected delete error:', err.message);
        }
      }

      // Remove from in-memory
      if (interaction.client.mimicProtected) {
        const guildProtected = interaction.client.mimicProtected.get(interaction.guild.id);
        if (guildProtected) guildProtected.delete(targetUser.id);
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔓 Mimic Protection Removed')
        .setDescription(`**${targetUser.username}** can now be mimicked again.`)
        .setFooter({ text: `Removed by ${interaction.user.username}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /* ── LIST ── */
    if (subcmd === 'list') {
      let protectedUsers = [];

      // Get from Supabase
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('mimic_protected')
            .select('user_id, username')
            .eq('guild_id', interaction.guild.id);
          if (!error && data) protectedUsers = data;
        } catch (err) {
          console.error('mimic_protected list error:', err.message);
        }
      }

      // Merge with in-memory
      if (interaction.client.mimicProtected) {
        const guildProtected = interaction.client.mimicProtected.get(interaction.guild.id);
        if (guildProtected) {
          for (const userId of guildProtected) {
            if (!protectedUsers.find(p => p.user_id === userId)) {
              protectedUsers.push({ user_id: userId, username: 'Unknown' });
            }
          }
        }
      }

      if (protectedUsers.length === 0) {
        return interaction.reply({ content: '🛡️ No mimic-protected users in this server.', flags: MessageFlags.Ephemeral });
      }

      const list = protectedUsers.map(p => `• <@${p.user_id}> (${p.username})`).join('\n');
      const embed = new EmbedBuilder()
        .setColor(0x00D4FF)
        .setTitle('🛡️ Mimic-Protected Users')
        .setDescription(list)
        .setFooter({ text: `Total: ${protectedUsers.length} protected` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
