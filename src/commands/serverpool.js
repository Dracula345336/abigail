const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { CURRENCY } = require('../wallet-helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverpool')
    .setDescription('🏦 Check the server event pool & top donors!'),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({ content: '💔 Currency system not available!', flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;

    // Get server pool
    const { data: pool, error: poolError } = await supabase
      .from('server_pools')
      .select('*')
      .eq('guild_id', guildId)
      .maybeSingle();

    if (poolError) {
      console.error('Pool fetch error:', poolError);
      return interaction.reply({ content: '💔 Something went wrong!', flags: MessageFlags.Ephemeral });
    }

    if (!pool) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🏦 Server Event Pool')
          .setDescription(
            `No server pool yet!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💡 Use \`/donate\` to contribute!\n┣ 💡 Every donation helps fund events!\n┗ 🤝 Be the first donor!`
          )
          .setTimestamp()],
      });
    }

    // Get top 10 donors
    const { data: donors } = await supabase
      .from('pool_donors')
      .select('*')
      .eq('guild_id', guildId)
      .order('total_donated', { ascending: false })
      .limit(10);

    let donorList = '';
    if (donors && donors.length > 0) {
      const medals = ['🥇', '🥈', '🥉'];
      for (let i = 0; i < donors.length; i++) {
        const d = donors[i];
        const medal = i < 3 ? medals[i] : `**${i + 1}.**`;
        donorList += `${medal} **${d.username || 'Unknown'}** — ${CURRENCY}${(d.total_donated || 0).toLocaleString('en-IN')} (${d.donation_count || 1} donation${d.donation_count > 1 ? 's' : ''})\n`;
      }
    } else {
      donorList = 'No donors yet!';
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏦 Server Event Pool')
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━\n` +
        `┣ 💰 **Pool Balance:** ${CURRENCY}${(pool.balance || 0).toLocaleString('en-IN')}\n` +
        `┣ 📊 **Total Donated:** ${CURRENCY}${(pool.total_donated || 0).toLocaleString('en-IN')}\n` +
        `┣ 👥 **Donors:** ${pool.donor_count || 0}\n` +
        `┗ 🏷️ **Server:** ${interaction.guild.name}`
      )
      .addFields({ name: '🏆 Top Donors', value: donorList, inline: false })
      .setFooter({ text: '💕 Use /donate to contribute — /event for admin distribution' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
