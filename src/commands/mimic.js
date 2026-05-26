const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

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

// In-memory mimic log: stores last 100 mimic uses per user
const mimicLog = new Map();

// In-memory mimic access list: stores who has mimic permission
// Key: guild_id, Value: Set of user_ids with access
const mimicAccess = new Map();

module.exports.mimicLog = mimicLog;
module.exports.mimicAccess = mimicAccess;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mimic')
    .setDescription('🎭 Mimic another user in this channel')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to mimic')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('What should they say? (random if blank)')
        .setRequired(false)
        .setMaxLength(2000)),

  async execute(interaction) {
    const supabase = require('../db');
    const targetUser = interaction.options.getUser('user');
    const customMsg = interaction.options.getString('message');

    /* ── Check mimic access ── */
    const isOwner = interaction.guild.ownerId === interaction.user.id;
    let hasAccess = isOwner;

    // Check Supabase access list
    if (!hasAccess && supabase) {
      const { data } = await supabase
        .from('mimic_access')
        .select('user_id')
        .eq('guild_id', interaction.guild.id)
        .eq('user_id', interaction.user.id)
        .maybeSingle();
      hasAccess = !!data;
    }

    // Fallback: check in-memory access list
    if (!hasAccess) {
      const guildAccess = mimicAccess.get(interaction.guild.id);
      hasAccess = guildAccess && guildAccess.has(interaction.user.id);
    }

    if (!hasAccess) {
      return interaction.reply({
        content: '🚫 You don\'t have mimic access! Only the server owner can grant it with `/mimic-access`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    /* ── Guards ── */
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: "🪞 Mimicking yourself? That's just talking, sweetheart!", flags: MessageFlags.Ephemeral });
    }

    const targetMember = interaction.options.getMember('user');
    const targetName = targetMember?.displayName || targetUser.username;
    const targetAvatar = targetUser.displayAvatarURL({ dynamic: true, size: 256 });

    const msgContent = customMsg || RANDOM_LINES[Math.floor(Math.random() * RANDOM_LINES.length)];

    /* ── Webhook magic ── */
    try {
      const webhook = await interaction.channel.createWebhook({
        name: targetName,
        avatar: targetAvatar,
        reason: `Mimic command by ${interaction.user.tag}`,
      });

      await webhook.send(msgContent);
      await webhook.delete('Mimic command cleanup');

      /* ── Log the mimic use (per user) ── */
      const logKey = `${interaction.guild.id}-${interaction.user.id}`;
      const logEntry = {
        target: targetUser,
        targetName,
        message: msgContent,
        channel: interaction.channel,
        timestamp: new Date(),
      };

      const userLog = mimicLog.get(logKey) || [];
      userLog.unshift(logEntry);
      if (userLog.length > 100) userLog.pop();
      mimicLog.set(logKey, userLog);

      await interaction.reply({
        content: `🎭 Successfully mimicked **${targetName}**!`,
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
