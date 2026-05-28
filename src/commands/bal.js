const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { getOrCreateWallet, safeWallet, CURRENCY } = require('../wallet-helpers');

const WALLET_EMOJI = '💰';
const BANK_EMOJI = '🏦';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bal')
    .setDescription('💰 Check your wallet balance (Dank Memer style)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Check someone else\'s balance')
        .setRequired(false)),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({
        content: '💔 Currency system is not available (database not configured).',
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const isSelf = targetUser.id === interaction.user.id;

    const { wallet: rawWallet, error: walletError } = await getOrCreateWallet(supabase, targetUser.id, interaction.guild.id, targetUser.username);
    if (!rawWallet) {
      return interaction.reply({ content: `💔 Wallet error: ${walletError}`, flags: MessageFlags.Ephemeral });
    }
    const wallet = safeWallet(rawWallet);

    // Update username if changed
    if (wallet.username !== targetUser.username) {
      await supabase
        .from('wallets')
        .update({ username: targetUser.username })
        .eq('user_id', targetUser.id)
        .eq('guild_id', interaction.guild.id);
    }

    const netWorth = wallet.balance + wallet.bank;

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setAuthor({
        name: isSelf ? '💰 Your Balance' : `💰 ${targetUser.username}'s Balance`,
        iconURL: targetUser.displayAvatarURL({ dynamic: true }),
      })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ ${WALLET_EMOJI} **Wallet:** ${CURRENCY}${wallet.balance.toLocaleString('en-IN')}\n` +
        `┣ ${BANK_EMOJI} **Bank:** ${CURRENCY}${wallet.bank.toLocaleString('en-IN')}\n` +
        `┗ 🏆 **Net Worth:** ${CURRENCY}${netWorth.toLocaleString('en-IN')}`
      )
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: `💕 Sweetheart Bot — Currency System` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
