const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { pick } = require('../utils');
const { AFK_BREAK_MESSAGES } = require('../messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk-break')
    .setDescription('☕ Set yourself as on a break')
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Why are you taking a break? (optional)')
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

    const reason = interaction.options.getString('reason') || 'Taking a break ☕';
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
      console.error('Supabase upsert error (afk-break):', error);
      return interaction.reply({
        content: '💔 Something went wrong! Make sure Supabase RLS policies are set up.\n**Quick fix:** Go to Supabase Dashboard → SQL Editor → Run:\n```sql\nALTER TABLE afk_users DISABLE ROW LEVEL SECURITY;\n```',
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${displayName} is on a break`,
        iconURL: avatarURL,
      })
      .setTitle('☕ Break Time!')
      .setDescription(pick(AFK_BREAK_MESSAGES))
      .setThumbnail(avatarURL)
      .addFields(
        { name: '📝 Reason', value: `*${reason}*`, inline: true },
        { name: '⏰ Went on break', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: `💕 Take your time, ${interaction.user.username}…` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
