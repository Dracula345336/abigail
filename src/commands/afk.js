const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');
const { AFK_SET_MESSAGES, AFK_RETURN_MESSAGES } = require('../messages');
const { pick, timeSince } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('🌙 AFK system commands')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set yourself as AFK')
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Why are you going AFK?')
            .setRequired(false)
            .setMaxLength(200)))
    .addSubcommand(sub =>
      sub.setName('break')
        .setDescription('Manually remove your AFK status'))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('See all currently AFK users in this server')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'set':
        return await handleAfkSet(interaction);
      case 'break':
        return await handleAfkBreak(interaction);
      case 'list':
        return await handleAfkList(interaction);
    }
  },
};

/* ── /afk set ── */
async function handleAfkSet(interaction) {
  const reason = interaction.options.getString('reason') || 'Just stepped away for a moment 💫';
  const member = interaction.member;

  const { error } = await supabase
    .from('afk_users')
    .upsert({
      user_id: interaction.user.id,
      guild_id: interaction.guild.id,
      afk_time: new Date().toISOString(),
      reason,
      avatar_url: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }),
      username: interaction.user.username,
    }, { onConflict: 'user_id,guild_id' });

  if (error) {
    console.error('Supabase upsert error:', error);
    return interaction.reply({ content: '💔 Something went wrong setting your AFK status!', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setAuthor({
      name: `${member.displayName || interaction.user.username} is now AFK`,
      iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
    })
    .setTitle('🌙 AFK Mode Activated')
    .setDescription(pick(AFK_SET_MESSAGES))
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: '📝 Reason', value: `*${reason}*`, inline: true },
      { name: '⏰ Went away', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: `💕 I'll be waiting for you, ${interaction.user.username}…` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

/* ── /afk break ── */
async function handleAfkBreak(interaction) {
  const { data: afkData, error: dbError } = await supabase
    .from('afk_users')
    .select('*')
    .eq('user_id', interaction.user.id)
    .eq('guild_id', interaction.guild.id)
    .maybeSingle();

  if (dbError) {
    console.error('Supabase query error:', dbError);
    return interaction.reply({ content: '💔 Something went wrong checking your AFK status!', ephemeral: true });
  }

  if (!afkData) {
    return interaction.reply({ content: "💕 You're not currently AFK, sweetheart!", ephemeral: true });
  }

  const away = timeSince(afkData.afk_time);

  const embed = new EmbedBuilder()
    .setColor(0xFF1493)
    .setAuthor({
      name: `${interaction.member.displayName || interaction.user.username} is back!`,
      iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
    })
    .setTitle('💝 Welcome Back!')
    .setDescription(pick(AFK_RETURN_MESSAGES))
    .setThumbnail(afkData.avatar_url || interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: '⏰ You were away for', value: `**${away}**`, inline: true },
      { name: '📝 Your reason was', value: `*${afkData.reason}*`, inline: true },
    )
    .setFooter({ text: "💫 So glad you're back!" })
    .setTimestamp();

  // Reply FIRST, then delete the record (prevents data loss if reply fails)
  await interaction.reply({ embeds: [embed] });

  await supabase
    .from('afk_users')
    .delete()
    .eq('user_id', interaction.user.id)
    .eq('guild_id', interaction.guild.id);
}

/* ── /afk list ── */
async function handleAfkList(interaction) {
  const { data: afkUsers, error: dbError } = await supabase
    .from('afk_users')
    .select('*')
    .eq('guild_id', interaction.guild.id);

  if (dbError) {
    console.error('Supabase error:', dbError);
    return interaction.reply({ content: '💔 Failed to fetch AFK list!', ephemeral: true });
  }

  if (!afkUsers || afkUsers.length === 0) {
    return interaction.reply('✨ No one is AFK right now, everyone is here! 💕');
  }

  const list = afkUsers.map(user => {
    const away = timeSince(user.afk_time);
    return `🌙 **${user.username}** — *${user.reason}* (${away} ago)`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle('📋 AFK Users')
    // Discord embed description max is 4096 chars — truncate if needed
    .setDescription(list.length > 4096 ? list.substring(0, 4090) + '…' : list)
    .setFooter({ text: `${afkUsers.length} user(s) currently AFK` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
