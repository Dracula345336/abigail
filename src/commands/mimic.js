const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const RANDOM_LINES = [
  "Hey everyone! 👋",
  "I'm here! ✨",
  "What's up? 😄",
  "Hello beautiful people! 💕",
  "Did someone call me? 🤔",
  "I just wanted to say hi! 🌸",
  "Guess who's back? 😎",
  "Sending hugs to everyone! 🤗",
];

// In-memory mimic log: stores last 50 mimic uses
// Key: guild_id, Value: array of mimic entries
const mimicLog = new Map();

module.exports.mimicLog = mimicLog;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mimic')
    .setDescription('🎭 Mimic another user in this channel (Admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to mimic')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('What should they say? (random if blank)')
        .setRequired(false)
        .setMaxLength(2000))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const customMsg = interaction.options.getString('message');

    /* ── Guards ── */
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: "🪞 Mimicking yourself? That's just talking, sweetheart!", flags: MessageFlags.Ephemeral });
    }
    if (targetUser.bot) {
      return interaction.reply({ content: '🚫 You cannot mimic bots, darling!', flags: MessageFlags.Ephemeral });
    }

    const targetMember = interaction.options.getMember('user');
    if (!targetMember) {
      return interaction.reply({ content: '🚫 Could not find that user in this server!', flags: MessageFlags.Ephemeral });
    }

    const msgContent = customMsg || RANDOM_LINES[Math.floor(Math.random() * RANDOM_LINES.length)];

    /* ── Webhook magic ── */
    try {
      const webhook = await interaction.channel.createWebhook({
        name: targetMember.displayName || targetUser.username,
        avatar: targetUser.displayAvatarURL({ dynamic: true, size: 256 }),
        reason: `Mimic command by ${interaction.user.tag}`,
      });

      await webhook.send(msgContent);
      await webhook.delete('Mimic command cleanup');

      /* ── Log the mimic use ── */
      const logEntry = {
        moderator: interaction.user,
        target: targetUser,
        targetName: targetMember.displayName || targetUser.username,
        message: msgContent,
        channel: interaction.channel,
        timestamp: new Date(),
      };

      const guildLog = mimicLog.get(interaction.guild.id) || [];
      guildLog.unshift(logEntry);
      if (guildLog.length > 50) guildLog.pop();
      mimicLog.set(interaction.guild.id, guildLog);

      await interaction.reply({
        content: `🎭 Successfully mimicked **${targetMember.displayName || targetUser.username}**!`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Mimic error:', error);
      await interaction.reply({
        content: '💔 Couldn\'t mimic that user — make sure I have **Manage Webhooks** permission in this channel!',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
