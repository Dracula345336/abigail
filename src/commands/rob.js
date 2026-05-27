const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { getOrCreateWallet, safeWallet, CURRENCY } = require('../wallet-helpers');

const ROB_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours

const ROB_SUCCESS = [
  "You snatched their wallet and ran! 💨",
  "You picked their pocket like a pro! 🎩",
  "You mugged them in a dark alley! 🌑",
  "You stole their cash when they weren't looking! 👀",
  "You hacked their PayTM! 📱",
];

const ROB_FAIL = [
  "They caught you and beat you up! 💀",
  "The police showed up! You had to pay a fine! 🚔",
  "You tripped while running away! 🤕",
  "They had nothing in their wallet! Empty! 🫙",
  "Their bodyguard caught you! 💪",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('🔫 Rob someone for their INR! (risky)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The person to rob')
        .setRequired(true)),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({ content: '💔 Currency system not available!', flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser('user');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    if (targetUser.id === userId) {
      return interaction.reply({ content: '🤦 You can\'t rob yourself!', flags: MessageFlags.Ephemeral });
    }
    if (targetUser.bot) {
      return interaction.reply({ content: '🤖 You can\'t rob bots!', flags: MessageFlags.Ephemeral });
    }

    // Fetch robber's wallet
    const rawWallet = await getOrCreateWallet(supabase, userId, guildId, interaction.user.username);
    if (!rawWallet) {
      return interaction.reply({ content: '💔 Could not create your wallet! Make sure the `wallets` table exists and RLS is disabled.', flags: MessageFlags.Ephemeral });
    }
    const wallet = safeWallet(rawWallet);

    // Fetch target's wallet
    let { data: targetWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', targetUser.id)
      .eq('guild_id', guildId)
      .maybeSingle();

    if (!targetWallet) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🔫 Rob Failed!')
          .setDescription(`**${targetUser.username}** doesn't have a wallet! They're too broke to rob! 😂`)
          .setTimestamp()],
      });
    }
    targetWallet = safeWallet(targetWallet);

    // Check cooldown
    const now = new Date();
    const lastRob = wallet.last_rob ? new Date(wallet.last_rob) : null;

    if (lastRob && (now - lastRob) < ROB_COOLDOWN) {
      const remaining = ROB_COOLDOWN - (now - lastRob);
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('⏳ Robbery Cooldown!')
          .setDescription(`You're laying low after your last heist!\n\n━━━━━━━━━━━━━━━━━━━\n┣ ⏳ Wait **${hours}h ${mins}m** more\n┗ 💡 Try \`/work\` or \`/beg\` instead!`)
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check if target has money
    if (targetWallet.balance <= 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x95A5A6)
          .setTitle('🔫 Nothing to Rob!')
          .setDescription(`**${targetUser.username}** has no cash in their wallet! They're broke! 😭`)
          .setTimestamp()],
      });
    }

    // Check if robber has money (risk losing some)
    if (wallet.balance < 100) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🔫 Can\'t Rob!')
          .setDescription(`You need at least **${CURRENCY}100** in your wallet to attempt a robbery!\n\n💡 Earn some cash first with \`/work\` or \`/daily\`!`)
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    // 45% success rate
    const success = Math.random() < 0.45;
    let amount, message, robberNewBal, targetNewBal;

    if (success) {
      // Steal 10-40% of target's wallet
      const stealPercent = 0.1 + Math.random() * 0.3;
      amount = Math.floor(targetWallet.balance * stealPercent);
      if (amount < 10) amount = 10;
      robberNewBal = wallet.balance + amount;
      targetNewBal = targetWallet.balance - amount;
      message = ROB_SUCCESS[Math.floor(Math.random() * ROB_SUCCESS.length)];
    } else {
      // Lose 5-15% of your own wallet as fine
      const finePercent = 0.05 + Math.random() * 0.1;
      amount = Math.floor(wallet.balance * finePercent);
      if (amount < 10) amount = 10;
      robberNewBal = wallet.balance - amount;
      targetNewBal = targetWallet.balance + Math.floor(amount * 0.5); // victim gets half the fine
      message = ROB_FAIL[Math.floor(Math.random() * ROB_FAIL.length)];
    }

    // Update both wallets
    await supabase
      .from('wallets')
      .update({ balance: robberNewBal, last_rob: now.toISOString(), username: interaction.user.username })
      .eq('user_id', userId)
      .eq('guild_id', guildId);

    await supabase
      .from('wallets')
      .update({ balance: targetNewBal, username: targetUser.username })
      .eq('user_id', targetUser.id)
      .eq('guild_id', guildId);

    const embed = new EmbedBuilder()
      .setColor(success ? 0xE74C3C : 0x95A5A6)
      .setTitle(success ? '🔫 Robbery Successful!' : '🚔 Robbery Failed!')
      .setDescription(
        `${message}\n\n━━━━━━━━━━━━━━━━━━━\n` +
        (success
          ? `┣ 💸 **Stole ${CURRENCY}${amount.toLocaleString('en-IN')}** from **${targetUser.username}**!\n┣ ${CURRENCY} **Your Wallet:** ${robberNewBal.toLocaleString('en-IN')}\n┗ 🏃 Now run before they catch you!`
          : `┣ 💸 **Lost ${CURRENCY}${amount.toLocaleString('en-IN')}** as a fine!\n┣ ${CURRENCY} **Your Wallet:** ${robberNewBal.toLocaleString('en-IN')}\n┗ 😵 Crime doesn't pay... sometimes!`)
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: '💕 Sweetheart Bot — Currency System' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
