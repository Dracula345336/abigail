const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');
const { AFK_RETURN_MESSAGES } = require('../messages');
const { pick, timeSince } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afkbreak')
    .setDescription('💝 Manually remove your AFK status'),

  async execute(interaction) {
    const { data: afkData } = await supabase
      .from('afk_users')
      .select('*')
      .eq('user_id', interaction.user.id)
      .eq('guild_id', interaction.guild.id)
      .maybeSingle();

    if (!afkData) {
      return interaction.reply({ content: "💕 You're not currently AFK, sweetheart!", ephemeral: true });
    }

    const away = timeSince(afkData.afk_time);

    const embed = new EmbedBuilder()
      .setColor(0xFF1493)
      .setAuthor({
        name: `${interaction.member.displayName || interaction.user.username} is back!`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      })
      .setTitle('💝 Welcome Back!')
      .setDescription(pick(AFK_RETURN_MESSAGES))
      .setThumbnail(afkData.avatar_url || interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '⏰ You were away for', value: `**${away}**`, inline: true },
        { name: '📝 Your reason was', value: `*${afkData.reason}*`, inline: true },
      )
      .setFooter({ text: "💫 So glad you're back!" })
      .setTimestamp();

    // Remove AFK record
    await supabase
      .from('afk_users')
      .delete()
      .eq('user_id', interaction.user.id)
      .eq('guild_id', interaction.guild.id);

    await interaction.reply({ embeds: [embed] });
  },
};
