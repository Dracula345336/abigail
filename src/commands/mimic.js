const { SlashCommandBuilder } = require('discord.js');

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
    const targetUser = interaction.options.getUser('user');
    const customMsg = interaction.options.getString('message');

    /* ── Guards ── */
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: "🪞 Mimicking yourself? That's just talking, sweetheart!", ephemeral: true });
    }
    if (targetUser.bot) {
      return interaction.reply({ content: '🚫 You cannot mimic bots, darling!', ephemeral: true });
    }

    // Use resolved member data from the interaction (no GuildMembers intent needed)
    const targetMember = interaction.options.getMember('user');
    if (!targetMember) {
      return interaction.reply({ content: '🚫 Could not find that user in this server!', ephemeral: true });
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

      await interaction.reply({
        content: `🎭 Successfully mimicked **${targetMember.displayName || targetUser.username}**!`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('Mimic error:', error);
      await interaction.reply({
        content: '💔 Couldn\'t mimic that user — make sure I have **Manage Webhooks** permission in this channel!',
        ephemeral: true,
      });
    }
  },
};
