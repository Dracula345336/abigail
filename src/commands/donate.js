const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { getOrCreateWallet, safeWallet, CURRENCY } = require('../wallet-helpers');

const DONATE_MESSAGES = [
  "You contributed to the server pool! The community thanks you! 🤝",
  "Your donation will help fund server events! Generous! 💖",
  "You dropped some cash in the community jar! 🫙",
  "The server pool just got a boost thanks to you! 🚀",
  "You're a true community hero! Donation received! 🦸",
  "Someone's feeling generous! Thanks for the donation! 🎉",
  "Your contribution will make events even better! 🎊",
  "You fed the server pool! It's growing! 🌱",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('donate')
    .setDescription('🤝 Donate INR to the server event pool!')
    .addStringOption(option =>
      option.setName('amount')
        .setDescription('Amount to donate (number, "all", or "half")')
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
    let donateAmount;

    if (amountInput === 'all') {
      donateAmount = wallet.balance;
    } else if (amountInput === 'half') {
      donateAmount = Math.floor(wallet.balance / 2);
    } else {
      donateAmount = parseInt(amountInput);
    }

    if (isNaN(donateAmount) || donateAmount <= 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🤝 Invalid Donation!')
          .setDescription(
            `You need to donate a positive amount!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💡 Use a number like \`50\` or \`1000\`\n┣ 💡 Or type \`all\` to donate everything!\n┗ 💡 Or type \`half\` to donate half!`
          )
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (donateAmount > wallet.balance) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🤝 Not Enough Cash!')
          .setDescription(
            `You only have **${CURRENCY}${wallet.balance.toLocaleString('en-IN')}** in your wallet!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💰 You tried to donate: **${CURRENCY}${donateAmount.toLocaleString('en-IN')}**\n┗ 💡 Try a smaller amount or use \`/work\` to earn more!`
          )
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Deduct from wallet
    const newBalance = wallet.balance - donateAmount;

    await supabase
      .from('wallets')
      .update({ balance: newBalance, username: interaction.user.username })
      .eq('user_id', userId)
      .eq('guild_id', guildId);

    // Add to server pool
    // First, get or create the server pool
    const { data: pool } = await supabase
      .from('server_pools')
      .select('*')
      .eq('guild_id', guildId)
      .maybeSingle();

    if (pool) {
      const newPoolBalance = (pool.balance || 0) + donateAmount;
      const newTotalDonated = (pool.total_donated || 0) + donateAmount;
      const newDonorCount = (pool.donor_count || 0);

      // Check if this user already donated before
      const { data: donorRecord } = await supabase
        .from('pool_donors')
        .select('*')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .maybeSingle();

      let donorCountUpdate = 0;
      if (!donorRecord) {
        donorCountUpdate = 1;
      }

      await supabase
        .from('server_pools')
        .update({
          balance: newPoolBalance,
          total_donated: newTotalDonated,
          donor_count: newDonorCount + donorCountUpdate,
        })
        .eq('guild_id', guildId);

      // Upsert donor record
      if (donorRecord) {
        await supabase
          .from('pool_donors')
          .update({
            total_donated: (donorRecord.total_donated || 0) + donateAmount,
            donation_count: (donorRecord.donation_count || 0) + 1,
            username: interaction.user.username,
          })
          .eq('user_id', userId)
          .eq('guild_id', guildId);
      } else {
        await supabase
          .from('pool_donors')
          .insert({
            user_id: userId,
            guild_id: guildId,
            total_donated: donateAmount,
            donation_count: 1,
            username: interaction.user.username,
          });
      }
    } else {
      // Create server pool
      await supabase
        .from('server_pools')
        .insert({
          guild_id: guildId,
          guild_name: interaction.guild.name,
          balance: donateAmount,
          total_donated: donateAmount,
          donor_count: 1,
        });

      // Create donor record
      await supabase
        .from('pool_donors')
        .insert({
          user_id: userId,
          guild_id: guildId,
          total_donated: donateAmount,
          donation_count: 1,
          username: interaction.user.username,
        });
    }

    const message = DONATE_MESSAGES[Math.floor(Math.random() * DONATE_MESSAGES.length)];

    // Get updated pool balance
    const { data: updatedPool } = await supabase
      .from('server_pools')
      .select('balance')
      .eq('guild_id', guildId)
      .maybeSingle();

    const poolBalance = updatedPool ? updatedPool.balance : donateAmount;

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('🤝 Donation Successful!')
      .setDescription(
        `${message}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💸 **Donated:** ${CURRENCY}${donateAmount.toLocaleString('en-IN')}\n┣ ${CURRENCY} **Your Wallet:** ${newBalance.toLocaleString('en-IN')}\n┣ 🏦 **Server Pool:** ${CURRENCY}${poolBalance.toLocaleString('en-IN')}\n┗ 💖 Thank you for contributing!`
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: '💕 Sweetheart Bot — Server Pool' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
