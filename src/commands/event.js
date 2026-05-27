const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { CURRENCY } = require('../wallet-helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('🎪 Manage server pool events (Admin only)')
    .addSubcommand(sub =>
      sub.setName('distribute')
        .setDescription('🎁 Distribute pool money to members')
        .addStringOption(option =>
          option.setName('amount')
            .setDescription('Amount per member (number or "all" for whole pool)')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Only give to members with this role (optional)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('give')
        .setDescription('🎁 Give pool money to a specific user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to give money to')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('amount')
            .setDescription('Amount to give')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('🗑️ Reset the server pool (Admin only)')),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({ content: '💔 Currency system not available!', flags: MessageFlags.Ephemeral });
    }

    // Check admin permissions
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🚫 Admin Only!')
          .setDescription('Only server admins can manage events!')]
          .setTimestamp(),
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildId = interaction.guild.id;
    const subcommand = interaction.options.getSubcommand();

    // Get server pool
    const { data: pool } = await supabase
      .from('server_pools')
      .select('*')
      .eq('guild_id', guildId)
      .maybeSingle();

    if (!pool && subcommand !== 'reset') {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🏦 Empty Pool!')
          .setDescription('No server pool exists yet! Use `/donate` first.')]
          .setTimestamp(),
      });
    }

    /* ── /event distribute ── */
    if (subcommand === 'distribute') {
      const amountInput = interaction.options.getString('amount').toLowerCase().trim();
      const role = interaction.options.getRole('role');

      let perMember;
      if (amountInput === 'all') {
        perMember = null; // Will calculate after counting members
      } else {
        perMember = parseInt(amountInput);
      }

      const poolBalance = pool.balance || 0;

      if (poolBalance <= 0) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('🏦 Pool is Empty!')
            .setDescription(`The server pool has **${CURRENCY}0**! Nothing to distribute.`)
            .setTimestamp()],
        });
      }

      // Get members to distribute to
      let members;
      if (role) {
        members = interaction.guild.members.cache.filter(m => m.roles.cache.has(role.id) && !m.user.bot);
      } else {
        members = interaction.guild.members.cache.filter(m => !m.user.bot);
      }

      if (members.size === 0) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('🎪 No Members!')
            .setDescription('No eligible members found to distribute to!')
            .setTimestamp()],
        });
      }

      // If "all", split pool equally
      if (perMember === null) {
        perMember = Math.floor(poolBalance / members.size);
      }

      if (isNaN(perMember) || perMember <= 0) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('🎪 Invalid Amount!')
            .setDescription('The amount per member would be too small!')
            .setTimestamp()],
        });
      }

      const totalNeeded = perMember * members.size;

      if (totalNeeded > poolBalance) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('🎪 Not Enough in Pool!')
            .setDescription(
              `You need **${CURRENCY}${totalNeeded.toLocaleString('en-IN')}** but the pool only has **${CURRENCY}${poolBalance.toLocaleString('en-IN')}**!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 👥 **Members:** ${members.size}\n┣ 💰 **Per member:** ${CURRENCY}${perMember.toLocaleString('en-IN')}\n┗ 💡 Try a smaller amount or fewer members!`
            )
            .setTimestamp()],
        });
      }

      // Distribute to each member's wallet
      let distributed = 0;
      for (const [, member] of members) {
        const { data: existingWallet } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', member.user.id)
          .eq('guild_id', guildId)
          .maybeSingle();

        if (existingWallet) {
          await supabase
            .from('wallets')
            .update({ balance: (existingWallet.balance || 0) + perMember })
            .eq('user_id', member.user.id)
            .eq('guild_id', guildId);
        } else {
          await supabase
            .from('wallets')
            .insert({ user_id: member.user.id, guild_id: guildId, balance: perMember, bank: 0, username: member.user.username });
        }
        distributed++;
      }

      // Deduct from pool
      const newPoolBalance = poolBalance - totalNeeded;
      await supabase
        .from('server_pools')
        .update({ balance: newPoolBalance })
        .eq('guild_id', guildId);

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🎪 Event Distribution Complete!')
        .setDescription(
          `Money has been distributed to ${role ? `members with **${role.name}** role` : 'all members'}!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 👥 **Members:** ${distributed}\n┣ 💸 **Per Member:** ${CURRENCY}${perMember.toLocaleString('en-IN')}\n┣ 💰 **Total Distributed:** ${CURRENCY}${totalNeeded.toLocaleString('en-IN')}\n┣ 🏦 **Pool Remaining:** ${CURRENCY}${newPoolBalance.toLocaleString('en-IN')}\n┗ 🎉 Event success!`
        )
        .setFooter({ text: '💕 Sweetheart Bot — Server Events' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    /* ── /event give ── */
    if (subcommand === 'give') {
      const targetUser = interaction.options.getUser('user');
      const amountInput = interaction.options.getString('amount').toLowerCase().trim();

      let giveAmount;
      if (amountInput === 'all') {
        giveAmount = pool.balance || 0;
      } else {
        giveAmount = parseInt(amountInput);
      }

      if (isNaN(giveAmount) || giveAmount <= 0) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('🎁 Invalid Amount!')
            .setDescription('Enter a valid positive amount!')
            .setTimestamp()],
        });
      }

      const poolBalance = pool.balance || 0;
      if (giveAmount > poolBalance) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('🎁 Not Enough in Pool!')
            .setDescription(`Pool has **${CURRENCY}${poolBalance.toLocaleString('en-IN')}** — you tried to give **${CURRENCY}${giveAmount.toLocaleString('en-IN')}**!`)
            .setTimestamp()],
        });
      }

      if (targetUser.bot) {
        return interaction.reply({ content: '🤖 You can\'t give pool money to bots!', flags: MessageFlags.Ephemeral });
      }

      // Add to target's wallet
      const { data: targetWallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', targetUser.id)
        .eq('guild_id', guildId)
        .maybeSingle();

      if (targetWallet) {
        await supabase
          .from('wallets')
          .update({ balance: (targetWallet.balance || 0) + giveAmount })
          .eq('user_id', targetUser.id)
          .eq('guild_id', guildId);
      } else {
        await supabase
          .from('wallets')
          .insert({ user_id: targetUser.id, guild_id: guildId, balance: giveAmount, bank: 0, username: targetUser.username });
      }

      // Deduct from pool
      const newPoolBalance = poolBalance - giveAmount;
      await supabase
        .from('server_pools')
        .update({ balance: newPoolBalance })
        .eq('guild_id', guildId);

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🎁 Pool Money Given!')
        .setDescription(
          `**${targetUser.username}** received money from the server pool!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💸 **Given:** ${CURRENCY}${giveAmount.toLocaleString('en-IN')}\n┣ 🎯 **To:** ${targetUser.username}\n┣ 🏦 **Pool Remaining:** ${CURRENCY}${newPoolBalance.toLocaleString('en-IN')}\n┗ 🎉 Enjoy!`
        )
        .setFooter({ text: '💕 Sweetheart Bot — Server Events' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    /* ── /event reset ── */
    if (subcommand === 'reset') {
      await supabase
        .from('pool_donors')
        .delete()
        .eq('guild_id', guildId);

      await supabase
        .from('server_pools')
        .delete()
        .eq('guild_id', guildId);

      const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🗑️ Server Pool Reset!')
        .setDescription('The server pool and all donor records have been cleared.')
        .setFooter({ text: '💕 Sweetheart Bot — Server Events' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
