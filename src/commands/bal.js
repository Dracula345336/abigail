const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

const CURRENCY = '₹';
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

    // Fetch or create wallet
    let { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', targetUser.id)
      .eq('guild_id', interaction.guild.id)
      .maybeSingle();

    if (error) {
      console.error('Wallet fetch error:', error);
      return interaction.reply({ content: '💔 Something went wrong!', flags: MessageFlags.Ephemeral });
    }

    // Create wallet if doesn't exist
    if (!wallet) {
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert({
          user_id: targetUser.id,
          guild_id: interaction.guild.id,
          balance: 0,
          bank: 0,
          username: targetUser.username,
        })
        .select()
        .single();

      if (createError) {
        console.error('Wallet create error:', createError);
        return interaction.reply({ content: '💔 Could not create wallet!', flags: MessageFlags.Ephemeral });
      }
      wallet = newWallet;
    }

    // Update username if changed
    if (wallet.username !== targetUser.username) {
      await supabase
        .from('wallets')
        .update({ username: targetUser.username })
        .eq('user_id', targetUser.id)
        .eq('guild_id', interaction.guild.id);
    }

    const balance = wallet.balance || 0;
    const bank = wallet.bank || 0;
    const netWorth = balance + bank;

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setAuthor({
        name: isSelf ? '💰 Your Balance' : `💰 ${targetUser.username}'s Balance`,
        iconURL: targetUser.displayAvatarURL({ dynamic: true }),
      })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ ${WALLET_EMOJI} **Wallet:** ${CURRENCY}${balance.toLocaleString('en-IN')}\n` +
        `┣ ${BANK_EMOJI} **Bank:** ${CURRENCY}${bank.toLocaleString('en-IN')}\n` +
        `┗ 🏆 **Net Worth:** ${CURRENCY}${netWorth.toLocaleString('en-IN')}`
      )
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: `💕 Sweetheart Bot — Currency System` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
