const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mimic-log')
    .setDescription('📜 See your own mimic history (only you can see this)')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number (default: 1)')
        .setRequired(false)
        .setMinValue(1)),

  async execute(interaction) {
    const mimicLog = interaction.client.mimicLog;

    if (!mimicLog || mimicLog.size === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('📜 Your Mimic History')
        .setDescription('You haven\'t used /mimic yet! 🎭')
        .setFooter({ text: '💡 Use /mimic @user to get started' })
        .setTimestamp();

      return interaction.reply({ embeds: [emptyEmbed], flags: MessageFlags.Ephemeral });
    }

    // Only get THIS user's log
    const logKey = `${interaction.guild.id}-${interaction.user.id}`;
    const userLog = mimicLog.get(logKey) || [];

    if (userLog.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('📜 Your Mimic History')
        .setDescription('You haven\'t used /mimic yet! 🎭')
        .setFooter({ text: '💡 Use /mimic @user to get started' })
        .setTimestamp();

      return interaction.reply({ embeds: [emptyEmbed], flags: MessageFlags.Ephemeral });
    }

    const page = interaction.options.getInteger('page') || 1;
    const perPage = 5;
    const totalPages = Math.ceil(userLog.length / perPage);
    const startIdx = (page - 1) * perPage;
    const pageEntries = userLog.slice(startIdx, startIdx + perPage);

    const logList = pageEntries.map((entry, index) => {
      const num = startIdx + index + 1;
      const timestamp = Math.floor(entry.timestamp.getTime() / 1000);
      const preview = entry.message.length > 60 ? entry.message.slice(0, 60) + '...' : entry.message;
      return `**${num}.** Mimicked **${entry.targetName}** (<@${entry.target.id}>) in <#${entry.channel.id}>\n💬 *"${preview}"*\n⏰ <t:${timestamp}:R>`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle('📜 Your Mimic History')
      .setDescription(`**${userLog.length}** mimic use(s) by you.\n\n${logList}`)
      .setFooter({ text: `Page ${page}/${totalPages} • 🔒 Only you can see this` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
