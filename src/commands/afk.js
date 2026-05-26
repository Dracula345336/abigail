const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { pick } = require('../utils');
const { AFK_SET_MESSAGES, AFK_BREAK_MESSAGES } = require('../messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('🌙 Set yourself as AFK or on a break')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('AFK type')
        .setRequired(false)
        .addChoices(
          { name: '🌙 AFK — Away from keyboard', value: 'afk' },
          { name: '☕ Break — Taking a break', value: 'break' },
        ))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Why are you going away? (optional)')
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

    const type = interaction.options.getString('type') || 'afk';
    const isBreak = type === 'break';
    const reason = interaction.options.getString('reason') || (isBreak ? 'Taking a break ☕' : 'Just stepped away for a moment 💫');
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
        content: '💔 Something went wrong! Make sure Supabase RLS policies are set up. Run the SQL in `supabase-setup.sql` file.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${displayName} is now ${isBreak ? 'on a break' : 'AFK'}`,
        iconURL: avatarURL,
      })
      .setTitle(isBreak ? '☕ Break Time!' : '🌙 AFK Mode Activated')
      .setDescription(pick(isBreak ? AFK_BREAK_MESSAGES : AFK_SET_MESSAGES))
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
