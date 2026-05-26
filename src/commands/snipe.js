const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('🔍 Snipe the last deleted message in this channel'),

  async execute(interaction) {
    // Access the shared snipes Map from the client
    const snipes = interaction.client.snipes;

    if (!snipes) {
      return interaction.reply({
        content: '🔍 Snipe system is not available right now.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const channelSnipe = snipes.get(interaction.channel.id);

    if (!channelSnipe) {
      return interaction.reply({
        content: '🔍 Nothing to snipe! No deleted messages found in this channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const { content, author, timestamp, attachments } = channelSnipe;

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${author.tag}`,
        iconURL: author.displayAvatarURL({ dynamic: true }),
      })
      .setDescription(content || '*No text content*')
      .setFooter({ text: `💡 Sniped by ${interaction.user.tag}` })
      .setTimestamp(timestamp);

    if (attachments && attachments.length > 0) {
      embed.addFields({
        name: '📎 Attachments',
        value: attachments.map(a => `[${a.name}](${a.url})`).join(', '),
        inline: false,
      });
      // If first attachment is an image, set it as the embed image
      const firstImage = attachments.find(a => a.contentType?.startsWith('image'));
      if (firstImage) {
        embed.setImage(firstImage.url);
      }
    }

    await interaction.reply({ embeds: [embed] });
  },
};
