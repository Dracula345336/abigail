const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set yourself as AFK')
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Why are you AFK?')
        .setRequired(false)
    ),

  async execute(interaction, supabase) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const reason = interaction.options.getString('reason') || 'Just stepped away for a moment';
    const username = interaction.user.username;
    const avatarUrl = interaction.user.displayAvatarURL();
    const afkTime = new Date().toISOString();

    // Upsert AFK record in Supabase
    const { error } = await supabase
      .from('afk_users')
      .upsert({
        user_id: userId,
        guild_id: guildId,
        afk_time: afkTime,
        reason: reason,
        avatar_url: avatarUrl,
        username: username,
      }, { onConflict: 'user_id,guild_id' });

    if (error) {
      console.error('Supabase error:', error);
      return interaction.reply({ content: '❌ Failed to set AFK. Database error.', ephemeral: true });
    }

    // Try to set nickname to [AFK] username
    try {
      const currentNick = interaction.member.nickname;
      if (!currentNick || !currentNick.startsWith('[AFK]')) {
        await interaction.member.setNickname(`[AFK] ${username}`);
      }
    } catch (e) {
      // Missing permissions — skip nickname change
    }

    await interaction.reply(`📍 **${username}** is now AFK: ${reason}`);
  }
};
