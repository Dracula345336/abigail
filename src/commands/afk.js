const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { pick } = require('../utils');
const { AFK_SET_MESSAGES } = require('../messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('🌙 Set yourself as AFK')
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Why are you going AFK? (optional)')
        .setRequired(false)
        .setMaxLength(200)),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({
        content: '💔 AFK system is not available right now (database not configured).',
        flags: MessageFlags.Ephemeral,
      });
    }

    const reason = interaction.options.getString('reason') || 'Just stepped away for a moment 💫';
    const member = interaction.member;
    const displayName = member?.displayName || interaction.user.username;
    const avatarURL = interaction.user.displayAvatarURL({ dynamic: true, size: 256 });

    const { error } = await supabase
      .from('afk_users')
      .upsert({
        user_id: interaction.user.id,
        guild_id: interaction.guild.id,
        afk_time: new Date().toISOString(),
        reason,
        avatar_url: avatarURL,
        username: interaction.user.username,
      }, { onConflict: 'user_id,guild_id' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return interaction.reply({
        content: '💔 Something went wrong setting your AFK status!',
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${displayName} is now AFK`,
        iconURL: avatarURL,
      })
      .setTitle('🌙 AFK Mode Activated')
      .setDescription(pick(AFK_SET_MESSAGES))
      .setThumbnail(avatarURL)
      .addFields(
        { name: '📝 Reason', value: `*${reason}*`, inline: true },
        { name: '⏰ Went away', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: `💕 I'll be waiting for you, ${interaction.user.username}…` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
