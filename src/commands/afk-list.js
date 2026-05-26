const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk-list')
    .setDescription('📋 See all currently AFK users in this server'),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({
        content: '💔 AFK system is not available right now (database not configured).',
        flags: MessageFlags.Ephemeral,
      });
    }

    const { data: afkUsers, error } = await supabase
      .from('afk_users')
      .select('*')
      .eq('guild_id', interaction.guild.id)
      .order('afk_time', { ascending: true });

    if (error) {
      console.error('Supabase query error (afk-list):', error);
      return interaction.reply({
        content: '💔 Could not fetch AFK list. Make sure the database is set up correctly.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!afkUsers || afkUsers.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('📋 AFK List')
        .setDescription('No one is AFK right now! 🎉\nEveryone is here and present 💕')
        .setFooter({ text: `💕 ${interaction.guild.name}` })
        .setTimestamp();

      return interaction.reply({ embeds: [emptyEmbed] });
    }

    const userList = afkUsers.map((user, index) => {
      const timestamp = Math.floor(new Date(user.afk_time).getTime() / 1000);
      return `**${index + 1}.** <@${user.user_id}> — *${user.reason}*\n   ⏰ Away <t:${timestamp}:R>`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle('📋 AFK List')
      .setDescription(`**${afkUsers.length}** user${afkUsers.length > 1 ? 's' : ''} currently AFK:\n\n${userList}`)
      .setFooter({ text: `💕 ${interaction.guild.name} — Use /afk to go AFK` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
