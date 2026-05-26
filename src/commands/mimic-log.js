const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mimic-log')
    .setDescription('📜 See who used the mimic command (Admin only)')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number (default: 1)')
        .setRequired(false)
        .setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const mimicCmd = interaction.client.commands.get('mimic');
    const mimicLog = mimicCmd?.mimicLog;

    if (!mimicLog) {
      return interaction.reply({
        content: '📜 No mimic logs found.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildLog = mimicLog.get(interaction.guild.id) || [];

    if (guildLog.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('📜 Mimic Log')
        .setDescription('No one has used /mimic yet! 🎭')
        .setFooter({ text: `💕 ${interaction.guild.name}` })
        .setTimestamp();

      return interaction.reply({ embeds: [emptyEmbed], flags: MessageFlags.Ephemeral });
    }

    const page = interaction.options.getInteger('page') || 1;
    const perPage = 5;
    const totalPages = Math.ceil(guildLog.length / perPage);
    const startIdx = (page - 1) * perPage;
    const pageEntries = guildLog.slice(startIdx, startIdx + perPage);

    const logList = pageEntries.map((entry, index) => {
      const num = startIdx + index + 1;
      const timestamp = Math.floor(entry.timestamp.getTime() / 1000);
      const preview = entry.message.length > 60 ? entry.message.slice(0, 60) + '...' : entry.message;
      return `**${num}.** <@${entry.moderator.id}> mimicked <@${entry.target.id}> in <#${entry.channel.id}>\n💬 *"${preview}"*\n⏰ <t:${timestamp}:R>`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle('📜 Mimic Log')
      .setDescription(`**${guildLog.length}** mimic use(s) found.\n\n${logList}`)
      .setFooter({ text: `Page ${page}/${totalPages} • 💕 ${interaction.guild.name}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
