const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk-list')
    .setDescription('See all AFK users in this server'),

  async execute(interaction, supabase) {
    const { data: afkUsers, error } = await supabase
      .from('afk_users')
      .select('*')
      .eq('guild_id', interaction.guild.id);

    if (error) {
      console.error('Supabase error:', error);
      return interaction.reply({ content: '❌ Failed to fetch AFK list.', ephemeral: true });
    }

    if (!afkUsers || afkUsers.length === 0) {
      return interaction.reply('✅ No one is AFK right now!');
    }

    const list = afkUsers.map(user => {
      const minutes = Math.round((Date.now() - new Date(user.afk_time).getTime()) / 60000);
      return `📍 **${user.username}** — ${user.reason} (${minutes} min ago)`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('AFK Users')
      .setDescription(list)
      .setColor('#FF6B6B')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
