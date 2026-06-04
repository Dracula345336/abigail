const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('🔍 Snipe the last deleted message in this channel'),

  async execute(interaction) {
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '868871716208791593';
    const SNOW_ID = '982661154843291658';

    if (interaction.user.id !== BOT_OWNER_ID && interaction.user.id !== SNOW_ID) {
      return interaction.reply({
        content: '🚫 Only the bot owner can use this!',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Access the shared snipes Map from the client
    const snipes = interaction.client.snipes;

    if (!snipes) {
      return interaction.reply({
        content: '🔍 Snipe system is not available right now.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const channelSnipes = snipes.get(interaction.channel.id);

    if (!channelSnipes || channelSnipes.length === 0) {
      return interaction.reply({
        content: '🔍 Nothing to snipe! No deleted messages found in this channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Get the latest snipe (first in array)
    const snipe = channelSnipes[0];
    const { content, author, timestamp, attachments } = snipe;

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${author.username}`,
        iconURL: author.displayAvatarURL,
      })
      .setDescription(content || '*No text content*')
      .setFooter({ text: `💡 Sniped by ${interaction.user.username}` })
      .setTimestamp(timestamp);

    if (attachments && attachments.length > 0) {
      embed.addFields({
        name: '📎 Attachments',
        value: attachments.map(a => `[${a.name}](${a.url})`).join(', '),
        inline: false,
      });
      const firstImage = attachments.find(a => a.contentType?.startsWith('image'));
      if (firstImage) {
        embed.setImage(firstImage.url);
      }
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
