/* ═══════════════════════════════════════════
   🎁  Lootbox System
   Drops a lootbox every 5 min in server
   Random outcomes: timeouts, coins, nothing, etc.
   ═══════════════════════════════════════════ */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const LOOTBOX_ITEMS = [
  { name: '🥊 1 Min Timeout', type: 'timeout', duration: 60, weight: 25, description: 'You got punched! 1 min timeout!' },
  { name: '💀 3 Min Timeout', type: 'timeout', duration: 180, weight: 15, description: 'Critical hit! 3 min timeout!' },
  { name: '💰 500 Coins', type: 'coins', amount: 500, weight: 20, description: 'Lucky! You found 500 coins!' },
  { name: '💎 1000 Coins', type: 'coins', amount: 1000, weight: 10, description: 'JACKPOT! 1000 coins!' },
  { name: '🧊 Freeze (30s)', type: 'timeout', duration: 30, weight: 15, description: 'Frozen! 30 second timeout!' },
  { name: '🎉 Nothing!', type: 'nothing', weight: 10, description: 'The box was empty... better luck next time!' },
  { name: '🪙 100 Coins', type: 'coins', amount: 100, weight: 5, description: 'A few coins fell out... 100 coins!' },
];

/* ── Weighted random selection ── */
function getRandomItem() {
  const totalWeight = LOOTBOX_ITEMS.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of LOOTBOX_ITEMS) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return LOOTBOX_ITEMS[0];
}

/* ── Active lootboxes tracker (messageId → item) ── */
const activeLootboxes = new Map();

/* ── Spawn a lootbox ── */
async function spawnLootbox(guild, channelId) {
  try {
    let channel = guild.channels.cache.get(channelId);

    // Fallback: fetch from API if not in cache
    if (!channel) {
      try {
        channel = await guild.channels.fetch(channelId);
      } catch (e) { /* channel not found */ }
    }

    if (!channel || !channel.isTextBased()) {
      console.error(`🎁 Lootbox: Invalid channel ${channelId} in guild ${guild.name}`);
      return;
    }

    const item = getRandomItem();

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🎁 A Lootbox Has Appeared!')
      .setDescription(
        'A mysterious lootbox just dropped! 🪂\n\n' +
        '━━━━━━━━━━━━━━━━━━━\n' +
        '┣ ⏰ **First come, first served!**\n' +
        '┣ 🎲 Random reward or punishment...\n' +
        '┗ 👇 Click the button to open it!\n\n' +
        '*Lootbox disappears in 60 seconds!*'
      )
      .setFooter({ text: `Dropped in ${guild.name}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('lootbox_open')
        .setLabel('🎁 Open Lootbox!')
        .setStyle(ButtonStyle.Primary)
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });

    // Store the item for this lootbox
    activeLootboxes.set(msg.id, { item, channelId: channel.id, claimed: false });

    // Auto-expire after 60 seconds
    setTimeout(async () => {
      const lootData = activeLootboxes.get(msg.id);
      if (lootData && !lootData.claimed) {
        try {
          const expiredEmbed = new EmbedBuilder()
            .setColor(0x555555)
            .setTitle('🎁 Lootbox Expired')
            .setDescription('Nobody claimed this lootbox in time! 💨')
            .setTimestamp();
          await msg.edit({ embeds: [expiredEmbed], components: [] });
        } catch (e) { /* message might be deleted */ }
        activeLootboxes.delete(msg.id);
      }
    }, 60000);

  } catch (err) {
    console.error('Lootbox spawn error:', err.message);
  }
}

/* ── Handle lootbox button click ── */
async function handleLootboxButton(interaction) {
  const lootData = activeLootboxes.get(interaction.message.id);
  if (!lootData) {
    return interaction.reply({ content: '❌ This lootbox has expired!', flags: MessageFlags.Ephemeral });
  }

  if (lootData.claimed) {
    return interaction.reply({ content: '❌ Someone already claimed this lootbox!', flags: MessageFlags.Ephemeral });
  }

  lootData.claimed = true;
  const item = lootData.item;
  const member = interaction.member;

  /* ── Apply the effect ── */
  let resultText = '';

  if (item.type === 'timeout') {
    try {
      const botMember = await interaction.guild.members.fetchMe();
      const canTimeout = botMember.permissions.has('ModerateMembers');

      if (!canTimeout) {
        // Bot doesn't have timeout permission — give coins as fallback
        const fallbackCoins = Math.floor(Math.random() * 300) + 100;
        try {
          const supabase = require('./db');
          if (supabase) {
            const { data: wallet } = await supabase
              .from('wallets')
              .select('balance')
              .eq('user_id', interaction.user.id)
              .eq('guild_id', interaction.guild.id)
              .maybeSingle();
            if (wallet) {
              await supabase.from('wallets').update({ balance: wallet.balance + fallbackCoins }).eq('user_id', interaction.user.id).eq('guild_id', interaction.guild.id);
            } else {
              await supabase.from('wallets').insert({ user_id: interaction.user.id, guild_id: interaction.guild.id, username: interaction.user.username, balance: fallbackCoins });
            }
          }
        } catch (e) {}
        resultText = `⚠️ **${item.name}** — but I don't have **Moderate Members** permission!\n\n🪙 You got **${fallbackCoins} coins** instead as consolation!\n\n💡 *Give me "Moderate Members" permission for real timeouts!*`;
      } else if (member.moderatable) {
        await member.timeout(item.duration * 1000, `Lootbox: ${item.name}`);
        resultText = `⏱️ **${item.name}** applied to <@${interaction.user.id}>!\n\n${item.description}`;
      } else {
        resultText = `😅 ${item.description}\n\nBut you're too powerful to be timed out! Lucky escape!`;
      }
    } catch (err) {
      console.error('Lootbox timeout error:', err.message);
      resultText = `😅 ${item.description}\n\nSomething went wrong... you're safe this time!`;
    }
  } else if (item.type === 'coins') {
    // Try to add coins via Supabase
    try {
      const supabase = require('./db');
      if (supabase) {
        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', interaction.user.id)
          .eq('guild_id', interaction.guild.id)
          .maybeSingle();

        if (wallet) {
          await supabase
            .from('wallets')
            .update({ balance: wallet.balance + item.amount })
            .eq('user_id', interaction.user.id)
            .eq('guild_id', interaction.guild.id);
        } else {
          await supabase
            .from('wallets')
            .insert({ user_id: interaction.user.id, guild_id: interaction.guild.id, username: interaction.user.username, balance: item.amount });
        }
      }
      resultText = `${item.description}\n\n💰 **+${item.amount} coins** added to your wallet!`;
    } catch (err) {
      resultText = `${item.description}\n\n(Couldn't add coins to database, but you still won!)`;
    }
  } else {
    resultText = item.description;
  }

  const claimedEmbed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🎁 Lootbox Opened!')
    .setDescription(
      `<@${interaction.user.id}> opened the lootbox!\n\n` +
      '━━━━━━━━━━━━━━━━━━━\n' +
      `┣ 🎊 **Prize:** ${item.name}\n` +
      `┗ ${resultText}`
    )
    .setFooter({ text: `Claimed by ${interaction.user.username}` })
    .setTimestamp();

  await interaction.update({ embeds: [claimedEmbed], components: [] });
  activeLootboxes.delete(interaction.message.id);
}

module.exports = { spawnLootbox, handleLootboxButton, getRandomItem, LOOTBOX_ITEMS };
