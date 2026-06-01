const { SlashCommandBuilder, MessageFlags, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const AFK_ROLE_NAME = 'AFK';

function getNormalNickname(currentNickname, username) {
  const base = currentNickname || username;
  return base.replace(/^\[AFK\]\s*/, '') || username;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk-break')
    .setDescription('🔨 Break/remove AFK status from a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user whose AFK you want to break')
        .setRequired(true)),

  async execute(interaction) {
    const supabase = require('../db');
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '868871716208791593';

    if (!supabase) {
      return interaction.reply({
        content: '💔 AFK system is not available right now (database not configured).',
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const targetMember = interaction.options.getMember('user');
    const displayName = targetMember?.displayName || targetUser.username;
    const avatarURL = targetUser.displayAvatarURL({ dynamic: true, size: 256 });

    // Check if the target user is actually AFK
    const { data: afkData, error: fetchError } = await supabase
      .from('afk_users')
      .select('*')
      .eq('user_id', targetUser.id)
      .eq('guild_id', interaction.guild.id)
      .maybeSingle();

    if (fetchError) {
      console.error('Supabase fetch error (afk-break):', fetchError);
      return interaction.reply({
        content: '💔 Something went wrong checking AFK status.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!afkData) {
      return interaction.reply({
        content: `✨ **${displayName}** is not AFK right now!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const isBotOwner = interaction.user.id === BOT_OWNER_ID;
    const isSelfBreak = targetUser.id === interaction.user.id;

    // ── AFK Break Protection Check ──
    if (!isBotOwner && !isSelfBreak) {
      let isProtected = false;

      // Check in-memory cache
      if (interaction.client.afkBreakProtected) {
        const guildProtected = interaction.client.afkBreakProtected.get(interaction.guild.id);
        if (guildProtected && guildProtected.has(targetUser.id)) isProtected = true;
      }

      // If not in cache, check DB
      if (!isProtected && supabase) {
        try {
          const { data: protData } = await supabase
            .from('afk_break_protected')
            .select('user_id')
            .eq('guild_id', interaction.guild.id)
            .eq('user_id', targetUser.id)
            .maybeSingle();
          if (protData) {
            isProtected = true;
            // Cache it
            if (!interaction.client.afkBreakProtected) interaction.client.afkBreakProtected = new Map();
            let guildProtected = interaction.client.afkBreakProtected.get(interaction.guild.id);
            if (!guildProtected) { guildProtected = new Set(); interaction.client.afkBreakProtected.set(interaction.guild.id, guildProtected); }
            guildProtected.add(targetUser.id);
          }
        } catch (err) {
          console.error('AFK break protection check error:', err.message);
        }
      }

      if (isProtected) {
        return interaction.reply({
          content: `🛡️ **${displayName}** is AFK break protected! Only the bot owner can break their AFK.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // ── Access Check — only allowed users can break ──
    if (!isBotOwner && !isSelfBreak) {
      // Check if breaker is in the allowed list
      let hasAccess = false;

      // Check in-memory cache
      if (interaction.client.afkBreakAccess) {
        const key = interaction.guild.id;
        const allowed = interaction.client.afkBreakAccess.get(key);
        if (allowed && allowed.has(interaction.user.id)) hasAccess = true;
      }

      // If not in cache, check DB
      if (!hasAccess && supabase) {
        try {
          const { data: accessData } = await supabase
            .from('afk_break_access')
            .select('allowed_user_id')
            .eq('guild_id', interaction.guild.id)
            .eq('allowed_user_id', interaction.user.id)
            .maybeSingle();
          if (accessData) hasAccess = true;
        } catch (err) {
          console.error('AFK break access check error:', err.message);
        }
      }

      if (!hasAccess) {
        return interaction.reply({
          content: `🔒 You don't have permission to break AFK! Only users in the access list and the bot owner can use \`/afk-break\`.\n\n💡 Ask the bot owner to use \`/afk-break-access add @${interaction.user.username}\` to allow you.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // Remove the AFK record
    const { error: deleteError } = await supabase
      .from('afk_users')
      .delete()
      .eq('user_id', targetUser.id)
      .eq('guild_id', interaction.guild.id);

    if (deleteError) {
      console.error('Supabase delete error (afk-break):', deleteError);
      return interaction.reply({
        content: '💔 Something went wrong removing AFK status.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Remove AFK role from target member
    const botCanManageNicknames = interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageNicknames);
    const botCanManageRoles = interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles);

    if (targetMember) {
      if (botCanManageRoles) {
        const afkRole = interaction.guild.roles.cache.find(r => r.name === AFK_ROLE_NAME);
        if (afkRole && targetMember.roles.cache.has(afkRole.id)) {
          try { await targetMember.roles.remove(afkRole, 'AFK broken by another user'); } catch (e) { /* silently skip */ }
        }
      }

      // Skip nickname for server owner — Discord doesn't allow it
      // Also skip if bot lacks ManageNicknames permission
      const isTargetOwner = interaction.guild.ownerId === targetUser.id;
      if (!isTargetOwner && botCanManageNicknames) {
        try {
          const normalNick = getNormalNickname(targetMember.nickname, targetUser.username);
          await targetMember.setNickname(normalNick, 'AFK broken — nickname restored');
        } catch (e) { /* silently skip — hierarchy issue */ }
      }
    }

    const breakDesc = `**${interaction.member?.displayName || interaction.user.username}** broke **${displayName}**'s AFK!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 📝 **Reason:** \`${afkData.reason}\`\n┗ ⏱️ **Away For:** \`${timeSince(afkData.afk_time)}\``;

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${displayName}'s AFK was broken!`,
        iconURL: avatarURL,
      })
      .setTitle('🔨 AFK Broken!')
      .setDescription(breakDesc)
      .setThumbnail(avatarURL)
      .setFooter({ text: `💨 Forcefully returned by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // DM the target user — tell them who broke their AFK
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔨 Your AFK Was Broken!')
        .setDescription(
          `**${interaction.member?.displayName || interaction.user.username}** broke your AFK in **${interaction.guild.name}**!\n\n━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 📝 **Your Reason:** \`${afkData.reason}\`\n` +
          `┣ ⏱️ **You Were Away For:** \`${timeSince(afkData.afk_time)}\`\n` +
          `┣ 🏠 **Server:** ${interaction.guild.name}\n` +
          `┗ 💨 **Broken By:** ${interaction.user.username}`
        )
        .setFooter({ text: '💕 Abigail — AFK Notification' })
        .setTimestamp();
      await targetUser.send({ embeds: [dmEmbed] });
    } catch (e) {
      console.error(`Could not DM ${targetUser.username} about AFK break:`, e.message);
    }
  },
};

function timeSince(isoString) {
  const ms = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  const parts = [];
  if (d) parts.push(`${d} day${d > 1 ? 's' : ''}`);
  if (h % 24) parts.push(`${h % 24} hr${h % 24 > 1 ? 's' : ''}`);
  if (m % 60) parts.push(`${m % 60} min${m % 60 > 1 ? 's' : ''}`);
  if (!parts.length) parts.push('a few seconds');
  return parts.join(' ');
}
