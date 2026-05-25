const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');
const { AFK_SET_MESSAGES } = require('../messages');
const { pick } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('🌙 Set yourself as AFK with an optional reason')
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Why are you going AFK?')
        .setRequired(false)
        .setMaxLength(200)),

  async execute(interaction) {
    const reason = interaction.options.getString('reason') || 'Just stepped away for a moment 💫';
    const member = interaction.member;

    const { error } = await supabase
      .from('afk_users')
      .upsert({
        user_id: interaction.user.id,
        guild_id: interaction.guild.id,
        afk_time: new Date().toISOString(),
        reason,
        avatar_url: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }),
        username: interaction.user.username,
      }, { onConflict: 'user_id,guild_id' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return interaction.reply({ content: '💔 Something went wrong setting your AFK status!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${member.displayName || interaction.user.username} is now AFK`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      })
      .setTitle('🌙 AFK Mode Activated')
      .setDescription(pick(AFK_SET_MESSAGES))
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '📝 Reason', value: `*${reason}*`, inline: true },
        { name: '⏰ Went away', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: `💕 I'll be waiting for you, ${interaction.user.username}…` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
