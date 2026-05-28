const { SlashCommandBuilder, MessageFlags, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { pick } = require('../utils');
const { AFK_SET_MESSAGES, AFK_BREAK_MESSAGES } = require('../messages');

const AFK_ROLE_NAME = 'AFK';

/**
 * Get or create the AFK role in a guild
 */
async function getAfkRole(guild) {
  let role = guild.roles.cache.find(r => r.name === AFK_ROLE_NAME);
  
  if (!role) {
    try {
      role = await guild.roles.create({
        name: AFK_ROLE_NAME,
        color: 0x808080,
        hoist: true, // Show separately in member list!
        mentionable: false,
        reason: 'Auto-created AFK role for Sweetheart Bot',
      });
      console.log(`✅ Created AFK role in ${guild.name}`);
    } catch (err) {
      console.error('Could not create AFK role:', err.message);
      return null;
    }
  }
  
  return role;
}

/**
 * Add [AFK] prefix to nickname
 */
function getAfkNickname(currentNickname, username) {
  const base = currentNickname || username;
  // Remove existing [AFK] prefix if any
  const clean = base.replace(/^\[AFK\]\s*/, '');
  return `[AFK] ${clean}`;
}

/**
 * Remove [AFK] prefix from nickname
 */
function getNormalNickname(currentNickname, username) {
  const base = currentNickname || username;
  return base.replace(/^\[AFK\]\s*/, '');
}

module.exports.getAfkRole = getAfkRole;
module.exports.AFK_ROLE_NAME = AFK_ROLE_NAME;
module.exports.getAfkNickname = getAfkNickname;
module.exports.getNormalNickname = getNormalNickname;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('🌙 Set yourself as AFK or on a break')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('AFK type')
        .setRequired(false)
        .addChoices(
          { name: '🌙 AFK — Away from keyboard', value: 'afk' },
          { name: '☕ Break — Taking a break', value: 'break' },
        ))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Why are you going away? (optional)')
        .setRequired(false)
        .setMaxLength(200)),

  async execute(interaction) {
    const supabase = require('../db');

    if (!supabase) {
      return interaction.reply({
        content: '💔 AFK system is not available right now (database not configured).',
        flags: MessageFlags.Ephemeral,
      });
    }

    const type = interaction.options.getString('type') || 'afk';
    const isBreak = type === 'break';
    const reason = interaction.options.getString('reason') || (isBreak ? 'Taking a break ☕' : 'Just stepped away for a moment 💫');
    const member = interaction.member;
    const displayName = member?.displayName || interaction.user.username;
    const avatarURL = interaction.user.displayAvatarURL({ dynamic: true, size: 256 });

    const { error } = await supabase
      .from('afk_users')
      .upsert({
        user_id: interaction.user.id,
        guild_id: interaction.guild.id,
        afk_time: new Date().toISOString(),
        reason,
        avatar_url: avatarURL,
        username: interaction.user.username,
      }, { onConflict: 'user_id,guild_id' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return interaction.reply({
        content: '💔 Something went wrong! **Quick fix:** Go to Supabase Dashboard → SQL Editor → Run:\n```sql\nALTER TABLE afk_users DISABLE ROW LEVEL SECURITY;\n```',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Add AFK role + Set [AFK] nickname
    const isOwner = interaction.guild.ownerId === interaction.user.id;
    const botCanManageNicknames = interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageNicknames);
    const botCanManageRoles = interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles);

    const afkRole = await getAfkRole(interaction.guild);
    if (afkRole && member && botCanManageRoles) {
      if (!member.roles.cache.has(afkRole.id)) {
        try { await member.roles.add(afkRole, 'User went AFK'); }
        catch (err) { /* silently skip */ }
      }
    }

    // Skip nickname for server owner — Discord doesn't allow it
    // Also skip if bot lacks ManageNicknames permission
    if (member && !isOwner && botCanManageNicknames) {
      try {
        const afkNick = getAfkNickname(member.nickname, interaction.user.username);
        await member.setNickname(afkNick, 'User went AFK');
      } catch (err) { /* silently skip — hierarchy issue */ }
    }

    const styledDesc = `${pick(isBreak ? AFK_BREAK_MESSAGES : AFK_SET_MESSAGES)}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 📝 **Reason:** \`${reason}\`\n┗ ⏱️ **Went away:** <t:${Math.floor(Date.now() / 1000)}:R>`;

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${displayName} is now ${isBreak ? 'on a break' : 'AFK'}`,
        iconURL: avatarURL,
      })
      .setTitle(isBreak ? '☕ Break Time!' : '🌙 AFK Mode Activated')
      .setDescription(styledDesc)
      .setThumbnail(avatarURL)
      .setFooter({ text: `💕 I'll be waiting for you, ${interaction.user.username}…` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
