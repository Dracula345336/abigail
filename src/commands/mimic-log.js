const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mimic-log')
    .setDescription('📜 See mimic history')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('View another user\'s log (requires log access)')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number (default: 1)')
        .setRequired(false)
        .setMinValue(1)),

  async execute(interaction) {
    const supabase = require('../db');
    const mimicLog = interaction.client.mimicLog;
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '868871716208791593';
    const isBotOwner = interaction.user.id === BOT_OWNER_ID;
    const isServerOwner = interaction.guild.ownerId === interaction.user.id;

    /* ── Check log viewing access (separate from mimic access!) ── */
    let hasLogAccess = isBotOwner || isServerOwner;

    // Check Supabase log_access list
    if (!hasLogAccess && supabase) {
      try {
        const { data } = await supabase
          .from('mimic_log_access')
          .select('user_id')
          .eq('guild_id', interaction.guild.id)
          .eq('user_id', interaction.user.id)
          .maybeSingle();
        hasLogAccess = !!data;
      } catch (err) {
        console.error('Log access DB check failed:', err.message);
      }
    }

    // Check in-memory log access list
    if (!hasLogAccess && interaction.client.mimicLogAccess) {
      const guildLogAccess = interaction.client.mimicLogAccess.get(interaction.guild.id);
      hasLogAccess = guildLogAccess && guildLogAccess.has(interaction.user.id);
    }

    /* ── Determine lookup target ── */
    const requestedUser = interaction.options.getUser('user');

    // Only users with LOG access can look up others
    const targetUser = (hasLogAccess && requestedUser) ? requestedUser : null;
    const lookupUserId = targetUser ? targetUser.id : interaction.user.id;
    const lookupName = targetUser ? targetUser.username : 'Your';

    // If user without log access tried to look up someone else
    if (requestedUser && !hasLogAccess) {
      return interaction.reply({
        content: '🚫 You need **log viewing access** to see other people\'s mimic logs!\nThis is separate from mimic access.\nAsk the owner to use `/mimic-access add-log @you`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!mimicLog || mimicLog.size === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle(`📜 ${lookupName}${lookupName === 'Your' ? '' : "'s"} Mimic History`)
        .setDescription(targetUser ? `**${targetUser.username}** hasn't used /mimic yet! 🎭` : 'You haven\'t used /mimic yet! 🎭')
        .setFooter({ text: '💡 Use /mimic @user to get started' })
        .setTimestamp();

      return interaction.reply({ embeds: [emptyEmbed], flags: MessageFlags.Ephemeral });
    }

    // Get the target user's log
    const logKey = `${interaction.guild.id}-${lookupUserId}`;
    const userLog = mimicLog.get(logKey) || [];

    if (userLog.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle(`📜 ${lookupName}${lookupName === 'Your' ? '' : "'s"} Mimic History`)
        .setDescription(targetUser ? `**${targetUser.username}** hasn't used /mimic yet! 🎭` : 'You haven\'t used /mimic yet! 🎭')
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
      .setTitle(`📜 ${lookupName}${lookupName === 'Your' ? '' : "'s"} Mimic History`)
      .setDescription(`**${userLog.length}** mimic use(s) ${targetUser ? `by **${targetUser.username}**` : 'by you'}.\n\n${logList}`)
      .setFooter({ text: `Page ${page}/${totalPages} • 🔒 Only you can see this` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
