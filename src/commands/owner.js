const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

/* ═══════════════════════════════════════════
   👑 Owner Control System
   Only the BOT_OWNER_ID can use these commands.
   Set BOT_OWNER_ID in your .env or Railway env vars.
   ═══════════════════════════════════════════ */

const OWNER_ID = process.env.BOT_OWNER_ID;

function isOwner(userId) {
  if (!OWNER_ID) return false;
  // Support comma-separated list of owner IDs
  const owners = OWNER_ID.split(',').map(id => id.trim());
  return owners.includes(userId);
}

function ownerOnly(interaction) {
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🚫 Access Denied!')
        .setDescription('Only the bot owner can use this command.')
        .setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }
  return null; // null means allowed
}

function formatUptime(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('👑 Bot owner control panel')
    .addSubcommand(sub =>
      sub.setName('stats')
        .setDescription('📊 View bot statistics (servers, users, uptime, memory)'))
    .addSubcommand(sub =>
      sub.setName('servers')
        .setDescription('🌍 List all servers the bot is in'))
    .addSubcommand(sub =>
      sub.setName('leave')
        .setDescription('🚪 Make the bot leave a server')
        .addStringOption(opt =>
          opt.setName('server_id')
            .setDescription('The server ID to leave')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('🎭 Change the bot\'s activity status')
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('Activity type')
            .setRequired(true)
            .addChoices(
              { name: '🎮 Playing', value: 'Playing' },
              { name: '📺 Watching', value: 'Watching' },
              { name: '🎧 Listening', value: 'Listening' },
              { name: '🏆 Competing', value: 'Competing' },
            ))
        .addStringOption(opt =>
          opt.setName('text')
            .setDescription('The status text')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('shutdown')
        .setDescription('🔴 Gracefully shut down the bot'))
    .addSubcommand(sub =>
      sub.setName('restart')
        .setDescription('🔄 Restart the bot process'))
    .addSubcommand(sub =>
      sub.setName('broadcast')
        .setDescription('📢 Send a message to the first channel of every server')
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('The message to broadcast')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('avatar')
        .setDescription('🖼️ Change the bot\'s avatar')
        .addStringOption(opt =>
          opt.setName('url')
            .setDescription('Direct image URL for the new avatar')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('username')
        .setDescription('✏️ Change the bot\'s username')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('New username (2-32 characters)')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(32)))
    .addSubcommand(sub =>
      sub.setName('nick')
        .setDescription('📝 Set the bot\'s nickname in this server')
        .addStringOption(opt =>
          opt.setName('nickname')
            .setDescription('New nickname (leave empty to reset)')
            .setRequired(false)
            .setMaxLength(32)))
    .addSubcommand(sub =>
      sub.setName('whois')
        .setDescription('🔍 Lookup a user across all servers')
        .addStringOption(opt =>
          opt.setName('user_id')
            .setDescription('The user ID to look up')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('guildinfo')
        .setDescription('📋 Detailed info about a specific server')
        .addStringOption(opt =>
          opt.setName('server_id')
            .setDescription('The server ID to inspect')
            .setRequired(true))),

  async execute(interaction) {
    const denied = ownerOnly(interaction);
    if (denied) return denied;

    const sub = interaction.options.getSubcommand();

    try {
      switch (sub) {
        case 'stats': return await handleStats(interaction);
        case 'servers': return await handleServers(interaction);
        case 'leave': return await handleLeave(interaction);
        case 'status': return await handleStatus(interaction);
        case 'shutdown': return await handleShutdown(interaction);
        case 'restart': return await handleRestart(interaction);
        case 'broadcast': return await handleBroadcast(interaction);
        case 'avatar': return await handleAvatar(interaction);
        case 'username': return await handleUsername(interaction);
        case 'nick': return await handleNick(interaction);
        case 'whois': return await handleWhois(interaction);
        case 'guildinfo': return await handleGuildInfo(interaction);
        default:
          return interaction.reply({ content: 'Unknown subcommand.', flags: MessageFlags.Ephemeral });
      }
    } catch (error) {
      console.error('Owner command error:', error);
      const reply = { content: `Error: ${error.message}`, flags: MessageFlags.Ephemeral };
      interaction.replied || interaction.deferred
        ? await interaction.followUp(reply)
        : await interaction.reply(reply);
    }
  },
};

/* ═══════════════════════════════════════════
   📊 Stats
   ═══════════════════════════════════════════ */
async function handleStats(interaction) {
  const client = interaction.client;
  const guilds = client.guilds.cache;
  const totalMembers = guilds.reduce((acc, g) => acc + g.memberCount, 0);
  const totalChannels = guilds.reduce((acc, g) => acc + g.channels.cache.size, 0);
  const memUsage = process.memoryUsage();

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle('👑 Bot Statistics')
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━\n` +
      `┣ 🖥️ **Servers:** ${guilds.size}\n` +
      `┣ 👥 **Total Members:** ${totalMembers.toLocaleString()}\n` +
      `┣ 💬 **Channels:** ${totalChannels}\n` +
      `┣ ⏱️ **Uptime:** ${formatUptime(client.uptime)}\n` +
      `┣ 📦 **Node.js:** ${process.version}\n` +
      `┣ 🏷️ **Bot Tag:** ${client.user.tag}\n` +
      `┣ 🆔 **Bot ID:** ${client.user.id}\n` +
      `┣ 💾 **RSS Memory:** ${(memUsage.rss / 1024 / 1024).toFixed(1)} MB\n` +
      `┣ 🧠 **Heap Used:** ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB\n` +
      `┣ 🧠 **Heap Total:** ${(memUsage.heapTotal / 1024 / 1024).toFixed(1)} MB\n` +
      `┣ 🔗 **API Latency:** ${client.ws.ping}ms\n` +
      `┗ 📁 **Commands:** ${client.commands.size}`
    )
    .setFooter({ text: `Owner: ${interaction.user.tag}` })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/* ═══════════════════════════════════════════
   🌍 Servers List
   ═══════════════════════════════════════════ */
async function handleServers(interaction) {
  const client = interaction.client;
  const guilds = client.guilds.cache.sort((a, b) => b.memberCount - a.memberCount);

  const lines = guilds.map((g, i) => {
    const owner = g.ownerId ? `<@${g.ownerId}>` : 'Unknown';
    return `**${i + 1}.** ${g.name} (\`${g.id}\`) — ${g.memberCount} members — Owner: ${owner}`;
  });

  // Discord embed limit is 4096 chars, split if needed
  const pages = [];
  let currentPage = '';
  for (const line of lines) {
    if ((currentPage + '\n' + line).length > 3800) {
      pages.push(currentPage);
      currentPage = line;
    } else {
      currentPage = currentPage ? currentPage + '\n' + line : line;
    }
  }
  if (currentPage) pages.push(currentPage);

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle(`👑 Servers (${guilds.size})`)
    .setDescription(pages[0] || 'No servers')
    .setFooter({ text: pages.length > 1 ? `Page 1/${pages.length}` : '' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/* ═══════════════════════════════════════════
   🚪 Leave Server
   ═══════════════════════════════════════════ */
async function handleLeave(interaction) {
  const serverId = interaction.options.getString('server_id');
  const guild = interaction.client.guilds.cache.get(serverId);

  if (!guild) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`🚫 Bot is not in server \`${serverId}\``).setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const guildName = guild.name;
  await guild.leave();

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`✅ Left **${guildName}** (\`${serverId}\`)`).setTimestamp()],
    flags: MessageFlags.Ephemeral,
  });
}

/* ═══════════════════════════════════════════
   🎭 Status
   ═══════════════════════════════════════════ */
async function handleStatus(interaction) {
  const { ActivityType } = require('discord.js');
  const typeStr = interaction.options.getString('type');
  const text = interaction.options.getString('text');

  const typeMap = {
    'Playing': ActivityType.Playing,
    'Watching': ActivityType.Watching,
    'Listening': ActivityType.Listening,
    'Competing': ActivityType.Competing,
  };

  const activityType = typeMap[typeStr];
  interaction.client.user.setActivity(text, { type: activityType });

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`✅ Status set to **${typeStr} ${text}**`).setTimestamp()],
    flags: MessageFlags.Ephemeral,
  });
}

/* ═══════════════════════════════════════════
   🔴 Shutdown
   ═══════════════════════════════════════════ */
async function handleShutdown(interaction) {
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🔴 Shutting Down...').setDescription('Bot is shutting down gracefully.').setTimestamp()],
    flags: MessageFlags.Ephemeral,
  });

  console.log(`🔴 Bot shutdown initiated by owner: ${interaction.user.tag}`);
  interaction.client.destroy();
  process.exit(0);
}

/* ═══════════════════════════════════════════
   🔄 Restart
   ═══════════════════════════════════════════ */
async function handleRestart(interaction) {
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle('🔄 Restarting...').setDescription('Bot process is restarting. Should be back in a few seconds.').setTimestamp()],
    flags: MessageFlags.Ephemeral,
  });

  console.log(`🔄 Bot restart initiated by owner: ${interaction.user.tag}`);
  interaction.client.destroy();
  process.exit(1); // Exit with code 1 so Docker/pm2 restarts the process
}

/* ═══════════════════════════════════════════
   📢 Broadcast
   ═══════════════════════════════════════════ */
async function handleBroadcast(interaction) {
  const message = interaction.options.getString('message');
  const client = interaction.client;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let success = 0;
  let failed = 0;

  for (const [, guild] of client.guilds.cache) {
    try {
      // Find the first channel the bot can send messages in
      const channel = guild.channels.cache.find(ch =>
        ch.isTextBased() && ch.permissionsFor(client.user)?.has('SendMessages')
      );
      if (channel) {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setColor(0xFF69B4)
            .setTitle('📢 Bot Announcement')
            .setDescription(message)
            .setFooter({ text: `From the bot owner` })
            .setTimestamp()]
        });
        success++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
    }
  }

  return interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('📢 Broadcast Complete')
      .setDescription(`✅ Sent to **${success}** servers\n❌ Failed in **${failed}** servers`)
      .setTimestamp()],
  });
}

/* ═══════════════════════════════════════════
   🖼️ Avatar
   ═══════════════════════════════════════════ */
async function handleAvatar(interaction) {
  const url = interaction.options.getString('url');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await interaction.client.user.setAvatar(url);
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription('✅ Bot avatar updated!').setTimestamp()],
    });
  } catch (error) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`❌ Failed to set avatar: ${error.message}`).setTimestamp()],
    });
  }
}

/* ═══════════════════════════════════════════
   ✏️ Username
   ═══════════════════════════════════════════ */
async function handleUsername(interaction) {
  const name = interaction.options.getString('name');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await interaction.client.user.setUsername(name);
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`✅ Username changed to **${name}**`).setTimestamp()],
    });
  } catch (error) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`❌ Failed to set username: ${error.message}\n\nNote: Discord allows username changes only twice per hour.`).setTimestamp()],
    });
  }
}

/* ═══════════════════════════════════════════
   📝 Nickname
   ═══════════════════════════════════════════ */
async function handleNick(interaction) {
  const nickname = interaction.options.getString('nickname'); // can be null (reset)

  if (!interaction.guild) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 This command can only be used in a server.').setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const me = await interaction.guild.members.fetchMe();
    await me.setNickname(nickname);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(nickname ? `✅ Nickname set to **${nickname}**` : '✅ Nickname reset').setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`❌ Failed to set nickname: ${error.message}`).setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }
}

/* ═══════════════════════════════════════════
   🔍 Whois
   ═══════════════════════════════════════════ */
async function handleWhois(interaction) {
  const userId = interaction.options.getString('user_id');
  const client = interaction.client;

  // Try to fetch the user globally
  let user;
  try {
    user = await client.users.fetch(userId, { force: true });
  } catch {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`🚫 User \`${userId}\` not found.`).setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Find which guilds they share with the bot
  const sharedGuilds = [];
  for (const [, guild] of client.guilds.cache) {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        sharedGuilds.push({
          name: guild.name,
          id: guild.id,
          nickname: member.nickname || 'None',
          joinedAt: member.joinedAt,
          roles: member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(', ') || 'None',
        });
      }
    } catch { /* skip */ }
  }

  let desc = `━━━━━━━━━━━━━━━━━━━\n`;
  desc += `┣ 🏷️ **Tag:** ${user.tag}\n`;
  desc += `┣ 🆔 **ID:** ${user.id}\n`;
  desc += `┣ 🤖 **Bot:** ${user.bot ? 'Yes' : 'No'}\n`;
  desc += `┣ 📅 **Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>\n`;
  desc += `┣ 🖼️ **Avatar:** [Link](${user.displayAvatarURL({ dynamic: true, size: 1024 })})\n`;
  desc += `┗ 🌍 **Shared Servers:** ${sharedGuilds.length}\n`;

  if (sharedGuilds.length > 0) {
    desc += '\n';
    for (const sg of sharedGuilds.slice(0, 10)) {
      desc += `\n**${sg.name}** (\`${sg.id}\`)\n`;
      desc += `┣ Nick: ${sg.nickname} ┣ Joined: <t:${Math.floor(sg.joinedAt.getTime() / 1000)}:R>\n`;
      if (sg.roles) desc += `┗ Roles: ${sg.roles}\n`;
    }
    if (sharedGuilds.length > 10) {
      desc += `\n... and ${sharedGuilds.length - 10} more servers`;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle(`🔍 User Lookup: ${user.username}`)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setDescription(desc)
    .setTimestamp();

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/* ═══════════════════════════════════════════
   📋 Guild Info
   ═══════════════════════════════════════════ */
async function handleGuildInfo(interaction) {
  const serverId = interaction.options.getString('server_id');
  const guild = interaction.client.guilds.cache.get(serverId);

  if (!guild) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`🚫 Bot is not in server \`${serverId}\``).setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }

  const owner = await guild.fetchOwner().catch(() => null);
  const channels = guild.channels.cache;
  const textCh = channels.filter(c => c.isTextBased()).size;
  const voiceCh = channels.filter(c => c.isVoiceBased()).size;
  const categories = channels.filter(c => c.type === 4).size; // GUILD_CATEGORY

  let desc = `━━━━━━━━━━━━━━━━━━━\n`;
  desc += `┣ 🏷️ **Name:** ${guild.name}\n`;
  desc += `┣ 🆔 **ID:** ${guild.id}\n`;
  desc += `┣ 👑 **Owner:** ${owner ? `${owner.user.tag} (\`${owner.user.id}\`)` : `Unknown (\`${guild.ownerId}\`)`}\n`;
  desc += `┣ 👥 **Members:** ${guild.memberCount}\n`;
  desc += `┣ 📅 **Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>\n`;
  desc += `┣ 🌍 **Region:** ${guild.preferredLocale || 'Unknown'}\n`;
  desc += `┣ 📊 **Boosts:** ${guild.premiumSubscriptionCount || 0} (Level ${guild.premiumTier})\n`;
  desc += `┣ 🔒 **2FA Required:** ${guild.mfaLevel ? 'Yes' : 'No'}\n`;
  desc += `┣ 📝 **Verification:** ${guild.verificationLevel}\n`;
  desc += `┣ 💬 **Text Channels:** ${textCh}\n`;
  desc += `┣ 🔊 **Voice Channels:** ${voiceCh}\n`;
  desc += `┣ 📁 **Categories:** ${categories}\n`;
  desc += `┣ 🎭 **Roles:** ${guild.roles.cache.size}\n`;
  desc += `┣ 😀 **Emojis:** ${guild.emojis.cache.size}\n`;
  desc += `┗ 🖼️ **Icon:** ${guild.iconURL() ? `[Link](${guild.iconURL({ dynamic: true, size: 1024 })})` : 'None'}`;

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle(`📋 Server Info: ${guild.name}`)
    .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
    .setDescription(desc)
    .setTimestamp();

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
