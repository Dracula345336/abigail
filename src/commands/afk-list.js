const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');
const { timeSince } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk-list')
    .setDescription('📋 See all currently AFK users in this server'),

  async execute(interaction) {
    const { data: afkUsers, error } = await supabase
      .from('afk_users')
      .select('*')
      .eq('guild_id', interaction.guild.id);

    if (error) {
      console.error('Supabase error:', error);
      return interaction.reply({ content: '💔 Failed to fetch AFK list!', ephemeral: true });
    }

    if (!afkUsers || afkUsers.length === 0) {
      return interaction.reply('✨ No one is AFK right now, everyone is here! 💕');
    }

    const list = afkUsers.map(user => {
      const away = timeSince(user.afk_time);
      return `🌙 **${user.username}** — *${user.reason}* (${away} ago)`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle('📋 AFK Users')
      .setDescription(list)
      .setFooter({ text: `${afkUsers.length} user(s) currently AFK` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
