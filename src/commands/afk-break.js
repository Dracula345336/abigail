const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk-break')
    .setDescription('🔨 Break/remove AFK status from a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user whose AFK you want to break')
        .setRequired(true)),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({
        content: '💔 AFK system is not available right now (database not configured).',
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const targetMember = interaction.options.getMember('user');
    const displayName = targetMember?.displayName || targetUser.username;
    const avatarURL = targetUser.displayAvatarURL({ dynamic: true, size: 256 });

    // Check if the target user is actually AFK
    const { data: afkData, error: fetchError } = await supabase
      .from('afk_users')
      .select('*')
      .eq('user_id', targetUser.id)
      .eq('guild_id', interaction.guild.id)
      .maybeSingle();

    if (fetchError) {
      console.error('Supabase fetch error (afk-break):', fetchError);
      return interaction.reply({
        content: '💔 Something went wrong checking AFK status.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!afkData) {
      return interaction.reply({
        content: `✨ **${displayName}** is not AFK right now!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Remove the AFK record
    const { error: deleteError } = await supabase
      .from('afk_users')
      .delete()
      .eq('user_id', targetUser.id)
      .eq('guild_id', interaction.guild.id);

    if (deleteError) {
      console.error('Supabase delete error (afk-break):', deleteError);
      return interaction.reply({
        content: '💔 Something went wrong removing AFK status.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${displayName}'s AFK was broken!`,
        iconURL: avatarURL,
      })
      .setTitle('🔨 AFK Broken!')
      .setDescription(`**${interaction.member?.displayName || interaction.user.username}** broke **${displayName}**'s AFK!`)
      .setThumbnail(avatarURL)
      .addFields(
        { name: '📝 Their reason was', value: `*${afkData.reason}*`, inline: true },
        { name: '⏰ They were away for', value: `**${timeSince(afkData.afk_time)}**`, inline: true },
      )
      .setFooter({ text: `💨 Forcefully returned by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

function timeSince(isoString) {
  const ms = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  const parts = [];
  if (d) parts.push(`${d} day${d > 1 ? 's' : ''}`);
  if (h % 24) parts.push(`${h % 24} hr${h % 24 > 1 ? 's' : ''}`);
  if (m % 60) parts.push(`${m % 60} min${m % 60 > 1 ? 's' : ''}`);
  if (!parts.length) parts.push('a few seconds');
  return parts.join(' ');
}
