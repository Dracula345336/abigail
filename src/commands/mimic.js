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
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '868871716208791593';
    const isBotOwner = interaction.user.id === BOT_OWNER_ID;
    const isServerOwner = interaction.guild.ownerId === interaction.user.id;
    let hasAccess = isBotOwner || isServerOwner;

    // Check Supabase access list (with error handling if table doesn't exist)
    if (!hasAccess && supabase) {
      try {
        const { data } = await supabase
          .from('mimic_access')
          .select('user_id')
          .eq('guild_id', interaction.guild.id)
          .eq('user_id', interaction.user.id)
          .maybeSingle();
        hasAccess = !!data;
      } catch (err) {
        console.error('Mimic access DB check failed:', err.message);
      }
    }

    // Fallback: check in-memory access list on client
    if (!hasAccess && interaction.client.mimicAccess) {
      const guildAccess = interaction.client.mimicAccess.get(interaction.guild.id);
      hasAccess = guildAccess && guildAccess.has(interaction.user.id);
    }

    if (!hasAccess) {
      return interaction.reply({
        content: '🚫 You don\'t have mimic access! Only the server owner can grant it with `/mimic-access`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    /* ── Guards ── */
    if (targetUser.id === interaction.user.id && !isBotOwner) {
      return interaction.reply({ content: "🪞 Mimicking yourself? That's just talking, sweetheart!", flags: MessageFlags.Ephemeral });
    }

    // Check Manage Webhooks permission before trying
    const botMember = await interaction.guild.members.fetchMe();
    if (!botMember.permissionsIn(interaction.channel).has('ManageWebhooks')) {
      return interaction.reply({
        content: '🚫 I need **Manage Webhooks** permission in this channel to mimic!\n\n**Fix:** Server Settings → Roles → Bot role → ✅ Manage Webhooks ON',
        flags: MessageFlags.Ephemeral,
      });
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

      /* ── Log the mimic use on client (persistent) ── */
      if (!interaction.client.mimicLog) interaction.client.mimicLog = new Map();

      const logKey = `${interaction.guild.id}-${interaction.user.id}`;
      const logEntry = {
        target: targetUser,
        targetName,
        message: msgContent,
        channel: interaction.channel,
        timestamp: new Date(),
      };

      const userLog = interaction.client.mimicLog.get(logKey) || [];
      userLog.unshift(logEntry);
      if (userLog.length > 100) userLog.pop();
      interaction.client.mimicLog.set(logKey, userLog);

      await interaction.reply({
        content: `🎭 Successfully mimicked **${targetName}**!`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Mimic webhook error:', error.message);
      await interaction.reply({
        content: `💔 Couldn't mimic — **${error.message}**\n\n💡 Make sure I have **Manage Webhooks** permission!`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
