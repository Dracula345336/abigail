const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

const CURRENCY = '₹';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rich')
    .setDescription('🏆 See the richest people in this server!'),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({ content: '💔 Currency system not available!', flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;

    // Get top 10 by net worth (balance + bank)
    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('guild_id', guildId)
      .order('balance', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Rich leaderboard error:', error);
      return interaction.reply({ content: '💔 Something went wrong!', flags: MessageFlags.Ephemeral });
    }

    if (!wallets || wallets.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🏆 Richest Players')
          .setDescription('Nobody has a wallet yet! Be the first with `/daily`!')
          .setTimestamp()],
      });
    }

    // Sort by net worth
    wallets.sort((a, b) => ((b.balance || 0) + (b.bank || 0)) - ((a.balance || 0) + (a.bank || 0)));

    const medals = ['🥇', '🥈', '🥉'];
    let leaderboard = '';

    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const netWorth = (w.balance || 0) + (w.bank || 0);
      const medal = i < 3 ? medals[i] : `**${i + 1}.**`;
      const name = w.username || 'Unknown';
      leaderboard += `${medal} **${name}** — ${CURRENCY}${netWorth.toLocaleString('en-IN')}\n`;
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Richest Players')
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n${leaderboard}\n━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({ text: `💕 ${interaction.guild.name} — Currency Leaderboard` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
