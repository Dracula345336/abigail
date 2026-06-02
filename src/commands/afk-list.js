const { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

const PER_PAGE = 5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk-list')
    .setDescription('📋 See all currently AFK users in this server'),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({
        content: '💔 AFK system is not available right now (database not configured).',
        flags: MessageFlags.Ephemeral,
      });
    }

    const { data: afkUsers, error } = await supabase
      .from('afk_users')
      .select('*')
      .eq('guild_id', interaction.guild.id)
      .order('afk_time', { ascending: true });

    if (error) {
      console.error('Supabase query error (afk-list):', error);
      return interaction.reply({
        content: '💔 Could not fetch AFK list. Make sure the database is set up correctly.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!afkUsers || afkUsers.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('📋 AFK List')
        .setDescription('No one is AFK right now! 🎉\nEveryone is here and present 💕')
        .setFooter({ text: `💕 ${interaction.guild.name}` })
        .setTimestamp();

      return interaction.reply({ embeds: [emptyEmbed] });
    }

    const totalPages = Math.ceil(afkUsers.length / PER_PAGE);
    let currentPage = 0;

    function getPageEmbed(page) {
      const start = page * PER_PAGE;
      const end = start + PER_PAGE;
      const pageUsers = afkUsers.slice(start, end);

      const userList = pageUsers.map((user, index) => {
        const num = start + index + 1;
        const timestamp = Math.floor(new Date(user.afk_time).getTime() / 1000);
        return `**${num}.** <@${user.user_id}> — *${user.reason}*\n   ⏰ Away <t:${timestamp}:R>`;
      }).join('\n\n');

      return new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('📋 AFK List')
        .setDescription(`**${afkUsers.length}** user${afkUsers.length > 1 ? 's' : ''} currently AFK:\n\n${userList}`)
        .setFooter({ text: `Page ${page + 1}/${totalPages} • 💕 ${interaction.guild.name}` })
        .setTimestamp();
    }

    function getButtons(page) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('afklist_first')
          .setEmoji('⏮️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('afklist_prev')
          .setEmoji('◀️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('afklist_next')
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === totalPages - 1),
        new ButtonBuilder()
          .setCustomId('afklist_last')
          .setEmoji('⏭️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages - 1),
      );
    }

    // If only 1 page, no buttons needed
    if (totalPages === 1) {
      return interaction.reply({ embeds: [getPageEmbed(0)] });
    }

    const reply = await interaction.reply({
      embeds: [getPageEmbed(0)],
      components: [getButtons(0)],
      fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({ content: '🚫 Not your list!', flags: MessageFlags.Ephemeral });
      }

      if (btn.customId === 'afklist_first') currentPage = 0;
      else if (btn.customId === 'afklist_prev') currentPage = Math.max(0, currentPage - 1);
      else if (btn.customId === 'afklist_next') currentPage = Math.min(totalPages - 1, currentPage + 1);
      else if (btn.customId === 'afklist_last') currentPage = totalPages - 1;

      await btn.update({
        embeds: [getPageEmbed(currentPage)],
        components: [getButtons(currentPage)],
      });
    });

    collector.on('end', async () => {
      try {
        await reply.edit({ components: [] });
      } catch (e) { /* message deleted */ }
    });
  },
};
