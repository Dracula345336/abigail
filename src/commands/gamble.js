const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { getOrCreateWallet, safeWallet, CURRENCY } = require('../wallet-helpers');

const GAMBLE_COOLDOWN = 30 * 1000; // 30 seconds

const WIN_MESSAGES = [
  "🎲 Dice rolled in your favor! Jackpot!",
  "🎰 The slots aligned perfectly! You won big!",
  "🃏 Your cards were unbeatable! Easy money!",
  "🍀 Lady Luck smiled at you today!",
  "💥 You hit the perfect number! Cash rain!",
  "🌟 Stars aligned and so did your luck!",
  "🔥 You were on fire! Couldn't lose even if you tried!",
];

const LOSE_MESSAGES = [
  "💀 The house always wins... well, this time it did!",
  "😭 Your luck ran out the moment you bet!",
  "🪦 Rest in peace, your hard-earned cash!",
  "📉 The market crashed... for you specifically!",
  "🏚️ You walked into the casino and walked out broke!",
  "🐍 Snake eyes! Better luck next time!",
  "🫠 Your money just... evaporated. Poof!",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('🎲 Gamble your INR for a chance to win big!')
    .addStringOption(option =>
      option.setName('amount')
        .setDescription('Amount to gamble (number, "all", or "half")')
        .setRequired(true)),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({ content: '💔 Currency system not available!', flags: MessageFlags.Ephemeral });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const { wallet: rawWallet, error: walletError } = await getOrCreateWallet(supabase, userId, guildId, interaction.user.username);
    if (!rawWallet) {
      return interaction.reply({ content: `💔 Wallet error: ${walletError}`, flags: MessageFlags.Ephemeral });
    }
    const wallet = safeWallet(rawWallet);

    // Parse amount
    const amountInput = interaction.options.getString('amount').toLowerCase().trim();
    let betAmount;

    if (amountInput === 'all') {
      betAmount = wallet.balance;
    } else if (amountInput === 'half') {
      betAmount = Math.floor(wallet.balance / 2);
    } else {
      betAmount = parseInt(amountInput);
    }

    if (isNaN(betAmount) || betAmount <= 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🎲 Invalid Bet!')
          .setDescription(
            `You need to bet a positive amount!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💡 Use a number like \`50\` or \`1000\`\n┣ 💡 Or type \`all\` to go all in!\n┗ 💡 Or type \`half\` to bet half your wallet!`
          )
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (betAmount > wallet.balance) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🎲 Not Enough Cash!')
          .setDescription(
            `You only have **${CURRENCY}${wallet.balance.toLocaleString('en-IN')}** in your wallet!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💰 You tried to bet: **${CURRENCY}${betAmount.toLocaleString('en-IN')}**\n┗ 💡 Try a smaller amount or use \`/work\` to earn more!`
          )
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (wallet.balance < 10) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🎲 Too Broke to Gamble!')
          .setDescription(`You need at least **${CURRENCY}10** to gamble!\n\n💡 Earn some cash with \`/daily\`, \`/work\`, or \`/beg\`!`)
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check cooldown
    const now = new Date();
    const lastGamble = wallet.last_gamble ? new Date(wallet.last_gamble) : null;

    if (lastGamble && (now - lastGamble) < GAMBLE_COOLDOWN) {
      const remaining = GAMBLE_COOLDOWN - (now - lastGamble);
      const secs = Math.ceil(remaining / 1000);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🎲 Slow Down!')
          .setDescription(`You just gambled! Wait **${secs}s** before trying again.`)
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Gambling Logic ──
    // 45% chance to win, multipliers: 0.5x (10%), 1.5x (15%), 2x (10%), 2.5x (5%), 5x (3%), 10x (2%)
    const roll = Math.random() * 100;
    let multiplier, result;

    if (roll < 2) {
      // 2% — 10x JACKPOT
      multiplier = 10;
      result = 'jackpot';
    } else if (roll < 5) {
      // 3% — 5x MEGA WIN
      multiplier = 5;
      result = 'mega';
    } else if (roll < 10) {
      // 5% — 2.5x BIG WIN
      multiplier = 2.5;
      result = 'big';
    } else if (roll < 20) {
      // 10% — 2x DOUBLE
      multiplier = 2;
      result = 'double';
    } else if (roll < 35) {
      // 15% — 1.5x NICE WIN
      multiplier = 1.5;
      result = 'nice';
    } else if (roll < 45) {
      // 10% — 0.5x (get half back)
      multiplier = 0.5;
      result = 'half';
    } else {
      // 55% — LOSE
      multiplier = 0;
      result = 'lose';
    }

    let winnings, newBalance, title, description, color;
    const message = result === 'lose' || result === 'half'
      ? LOSE_MESSAGES[Math.floor(Math.random() * LOSE_MESSAGES.length)]
      : WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)];

    if (result === 'lose') {
      winnings = -betAmount;
      newBalance = wallet.balance - betAmount;
      title = '💀 You Lost!';
      color = 0xE74C3C;
      description = `${message}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🎲 **Bet:** ${CURRENCY}${betAmount.toLocaleString('en-IN')}\n┣ 💸 **Lost:** ${CURRENCY}${betAmount.toLocaleString('en-IN')}\n┣ ${CURRENCY} **Wallet:** ${newBalance.toLocaleString('en-IN')}\n┗ 😵 Better luck next time!`;
    } else if (result === 'half') {
      const returned = Math.floor(betAmount * 0.5);
      winnings = returned - betAmount;
      newBalance = wallet.balance + returned - betAmount;
      title = '😔 Got Half Back!';
      color = 0xF39C12;
      description = `${message}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🎲 **Bet:** ${CURRENCY}${betAmount.toLocaleString('en-IN')}\n┣ 💸 **Lost:** ${CURRENCY}${(betAmount - returned).toLocaleString('en-IN')}\n┣ ${CURRENCY} **Wallet:** ${newBalance.toLocaleString('en-IN')}\n┗ 🤷 At least you got something back!`;
    } else {
      const won = Math.floor(betAmount * multiplier);
      winnings = won - betAmount;
      newBalance = wallet.balance - betAmount + won;

      if (result === 'jackpot') {
        title = '🎰🎰🎰 JACKPOT!!!';
        color = 0xFFD700;
      } else if (result === 'mega') {
        title = '🌟 MEGA WIN!';
        color = 0xFF69B4;
      } else if (result === 'big') {
        title = '🔥 BIG WIN!';
        color = 0xE67E22;
      } else if (result === 'double') {
        title = '✌️ DOUBLED!';
        color = 0x2ECC71;
      } else {
        title = '😊 Nice Win!';
        color = 0x2ECC71;
      }

      const multiplierLabel = multiplier === 1.5 ? '1.5x' : multiplier === 2 ? '2x' : multiplier === 2.5 ? '2.5x' : multiplier === 5 ? '5x' : '10x';

      description = `${message}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🎲 **Bet:** ${CURRENCY}${betAmount.toLocaleString('en-IN')}\n┣ 🎰 **Multiplier:** ${multiplierLabel}\n┣ 💸 **Won:** ${CURRENCY}${won.toLocaleString('en-IN')}\n┣ ${CURRENCY} **Wallet:** ${newBalance.toLocaleString('en-IN')}\n┗ 🎉 ${result === 'jackpot' ? 'UNBELIEVABLE!!!' : result === 'mega' ? 'Insane luck!' : 'Well played!'}`;
    }

    // Update wallet
    await supabase
      .from('wallets')
      .update({ balance: newBalance, last_gamble: now.toISOString(), username: interaction.user.username })
      .eq('user_id', userId)
      .eq('guild_id', guildId);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: '💕 Sweetheart Bot — Currency System' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
