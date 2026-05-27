const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

const CURRENCY = '₹';
const DAILY_AMOUNT = 500;
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours

const DAILY_MESSAGES = [
  "You checked under your pillow and found some cash! 💸",
  "A rich relative sent you money! 🎁",
  "You found a wad of cash on the ground! 🤑",
  "Your salary came in early! 💼",
  "You won a small lottery! 🎰",
  "Someone tipped you for being awesome! ✨",
  "You found forgotten cash in your old jeans! 👖",
  "The ATM glitched in your favor! 🏧",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('📅 Claim your daily INR reward!'),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({ content: '💔 Currency system not available!', flags: MessageFlags.Ephemeral });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // Fetch wallet
    let { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('guild_id', guildId)
      .maybeSingle();

    if (error) {
      console.error('Daily wallet fetch error:', error);
      return interaction.reply({ content: '💔 Something went wrong!', flags: MessageFlags.Ephemeral });
    }

    // Create wallet if needed
    if (!wallet) {
      const { data: newWallet } = await supabase
        .from('wallets')
        .insert({ user_id: userId, guild_id: guildId, balance: 0, bank: 0, username: interaction.user.username })
        .select().single();
      wallet = newWallet;
    }

    // Check cooldown
    const now = new Date();
    const lastDaily = wallet.last_daily ? new Date(wallet.last_daily) : null;

    if (lastDaily && (now - lastDaily) < DAILY_COOLDOWN) {
      const remaining = DAILY_COOLDOWN - (now - lastDaily);
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('⏰ Daily Already Claimed!')
          .setDescription(
            `You already claimed your daily reward!\n\n━━━━━━━━━━━━━━━━━━━\n┣ ⏳ Come back in **${hours}h ${mins}m**\n┗ 💡 Use \`/work\` or \`/beg\` in the meantime!`
          )
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Give daily reward
    const amount = DAILY_AMOUNT + Math.floor(Math.random() * 200); // 500-700
    const newBalance = (wallet.balance || 0) + amount;
    const message = DAILY_MESSAGES[Math.floor(Math.random() * DAILY_MESSAGES.length)];

    await supabase
      .from('wallets')
      .update({ balance: newBalance, last_daily: now.toISOString(), username: interaction.user.username })
      .eq('user_id', userId)
      .eq('guild_id', guildId);

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('📅 Daily Reward Claimed!')
      .setDescription(
        `${message}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💸 **+${CURRENCY}${amount.toLocaleString('en-IN')}**\n┣ ${CURRENCY} **Wallet:** ${newBalance.toLocaleString('en-IN')}\n┗ ⏰ Next daily in 24 hours`
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: '💕 Sweetheart Bot — Currency System' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
