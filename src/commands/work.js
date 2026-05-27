const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { getOrCreateWallet, safeWallet, CURRENCY } = require('../wallet-helpers');

const WORK_COOLDOWN = 60 * 60 * 1000; // 1 hour

const WORK_MESSAGES = [
  { msg: "You worked as a programmer and fixed bugs!", min: 100, max: 400 },
  { msg: "You delivered pizzas all over town!", min: 80, max: 300 },
  { msg: "You helped someone move furniture!", min: 50, max: 250 },
  { msg: "You worked overtime at the office!", min: 150, max: 500 },
  { msg: "You sold your handmade crafts!", min: 70, max: 350 },
  { msg: "You did some freelancing online!", min: 100, max: 450 },
  { msg: "You mowed lawns in the neighborhood!", min: 60, max: 200 },
  { msg: "You streamed on YouTube for 8 hours!", min: 50, max: 600 },
  { msg: "You worked at a chai stall!", min: 40, max: 180 },
  { msg: "You drove an auto-rickshaw all day!", min: 100, max: 350 },
  { msg: "You fixed phones at a repair shop!", min: 80, max: 300 },
  { msg: "You sold golgappe at a stall!", min: 50, max: 200 },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('💼 Work to earn some INR!'),

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

    const now = new Date();
    const lastWork = wallet.last_work ? new Date(wallet.last_work) : null;

    if (lastWork && (now - lastWork) < WORK_COOLDOWN) {
      const remaining = WORK_COOLDOWN - (now - lastWork);
      const mins = Math.floor(remaining / (60 * 1000));
      const secs = Math.floor((remaining % (60 * 1000)) / 1000);

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('😫 Too Tired to Work!')
          .setDescription(
            `You're still exhausted from your last shift!\n\n━━━━━━━━━━━━━━━━━━━\n┣ ⏳ Rest for **${mins}m ${secs}s** more\n┗ 💡 Try \`/beg\` while you wait!`
          )
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Pick random work
    const work = WORK_MESSAGES[Math.floor(Math.random() * WORK_MESSAGES.length)];
    const amount = work.min + Math.floor(Math.random() * (work.max - work.min));
    const newBalance = wallet.balance + amount;

    await supabase
      .from('wallets')
      .update({ balance: newBalance, last_work: now.toISOString(), username: interaction.user.username })
      .eq('user_id', userId)
      .eq('guild_id', guildId);

    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle('💼 Work Complete!')
      .setDescription(
        `${work.msg}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💸 **+${CURRENCY}${amount.toLocaleString('en-IN')}** earned!\n┣ ${CURRENCY} **Wallet:** ${newBalance.toLocaleString('en-IN')}\n┗ ⏰ Next work in 1 hour`
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: '💕 Sweetheart Bot — Currency System' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
