const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mimic-log')
    .setDescription('📜 See mimic history (mimic access users can view anyone)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('View another user\'s log (requires mimic access)')
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

    /* ── Check if user has mimic access (can view others' logs) ── */
    let hasMimicAccess = isBotOwner || isServerOwner;

    // Check Supabase access list
    if (!hasMimicAccess && supabase) {
      try {
        const { data } = await supabase
          .from('mimic_access')
          .select('user_id')
          .eq('guild_id', interaction.guild.id)
          .eq('user_id', interaction.user.id)
          .maybeSingle();
        hasMimicAccess = !!data;
      } catch (err) {
        console.error('Mimic access DB check failed:', err.message);
      }
    }

    // Check in-memory access list
    if (!hasMimicAccess && interaction.client.mimicAccess) {
      const guildAccess = interaction.client.mimicAccess.get(interaction.guild.id);
      hasMimicAccess = guildAccess && guildAccess.has(interaction.user.id);
    }

    /* ── Determine lookup target ── */
    const requestedUser = interaction.options.getUser('user');

    // Only users with mimic access can look up others
    const targetUser = (hasMimicAccess && requestedUser) ? requestedUser : null;
    const lookupUserId = targetUser ? targetUser.id : interaction.user.id;
    const lookupName = targetUser ? targetUser.username : 'Your';

    // If user without access tried to look up someone else, warn them
    if (requestedUser && !hasMimicAccess) {
      return interaction.reply({
        content: '🚫 You need **mimic access** to view other people\'s logs!\nAsk the server owner or bot owner to grant access with `/mimic-access add`.',
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
