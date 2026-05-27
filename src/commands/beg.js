const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { getOrCreateWallet, safeWallet, CURRENCY } = require('../wallet-helpers');

const BEG_COOLDOWN = 30 * 60 * 1000; // 30 minutes

const BEG_SUCCESS = [
  "A kind stranger gave you some money out of pity! 🥺",
  "You begged at the traffic signal and got some cash! 🚦",
  "Someone dropped coins in your cup! ☕",
  "A generous person felt bad for you and paid up! 💕",
  "You told a sob story and it actually worked! 😢",
  "An uncle gave you ₹100 and said 'beta, kuch kha lena'! 🍛",
];

const BEG_FAIL = [
  "Nobody gave you anything. Sad life. 😔",
  "People just walked past you. Ouch. 💨",
  "Someone told you to get a job! 💀",
  "A kid laughed at you instead of donating. 🧒",
  "You held out your hand but got nothing but air. 🌬️",
  "Security asked you to leave the premises. 🚔",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('beg')
    .setDescription('🥺 Beg for some INR! (risky but free)'),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({ content: '💔 Currency system not available!', flags: MessageFlags.Ephemeral });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const rawWallet = await getOrCreateWallet(supabase, userId, guildId, interaction.user.username);
    if (!rawWallet) {
      return interaction.reply({ content: '💔 Could not create your wallet! Make sure the `wallets` table exists and RLS is disabled.', flags: MessageFlags.Ephemeral });
    }
    const wallet = safeWallet(rawWallet);

    const now = new Date();
    const lastBeg = wallet.last_beg ? new Date(wallet.last_beg) : null;

    if (lastBeg && (now - lastBeg) < BEG_COOLDOWN) {
      const remaining = BEG_COOLDOWN - (now - lastBeg);
      const mins = Math.floor(remaining / (60 * 1000));

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🥺 Too Soon to Beg!')
          .setDescription(
            `You already begged recently! Have some dignity!\n\n━━━━━━━━━━━━━━━━━━━\n┣ ⏳ Wait **${mins}m** more\n┗ 💡 Try \`/work\` instead!`
          )
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    // 60% chance of success
    const success = Math.random() < 0.6;
    let amount, message;

    if (success) {
      amount = 20 + Math.floor(Math.random() * 150); // ₹20-170
      message = BEG_SUCCESS[Math.floor(Math.random() * BEG_SUCCESS.length)];
    } else {
      amount = 0;
      message = BEG_FAIL[Math.floor(Math.random() * BEG_FAIL.length)];
    }

    const newBalance = wallet.balance + amount;

    await supabase
      .from('wallets')
      .update({ balance: newBalance, last_beg: now.toISOString(), username: interaction.user.username })
      .eq('user_id', userId)
      .eq('guild_id', guildId);

    const embed = new EmbedBuilder()
      .setColor(success ? 0x2ECC71 : 0x95A5A6)
      .setTitle(success ? '🥺 Begging Worked!' : '💔 Nobody Cared...')
      .setDescription(
        `${message}\n\n━━━━━━━━━━━━━━━━━━━\n` +
        (success
          ? `┣ 💸 **+${CURRENCY}${amount.toLocaleString('en-IN')}**\n┣ ${CURRENCY} **Wallet:** ${newBalance.toLocaleString('en-IN')}\n┗ 🎉 Lucky you!`
          : `┣ 💸 **+${CURRENCY}0** — got nothing!\n┣ ${CURRENCY} **Wallet:** ${newBalance.toLocaleString('en-IN')}\n┗ 😔 Better luck next time...`)
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: '💕 Sweetheart Bot — Currency System' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
