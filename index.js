const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Discord client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Load commands
const fs = require('fs');
client.commands = new Map();
const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

// Bot ready
client.once(Events.ClientReady, () => {
  console.log(`✅ ${client.user.tag} is online!`);
});

// Handle slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, supabase);
  } catch (error) {
    console.error('Command error:', error);
    const reply = { content: '❌ There was an error executing this command!', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// Auto-remove AFK when user sends a message
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const { data: afkUser, error } = await supabase
    .from('afk_users')
    .select('*')
    .eq('user_id', message.author.id)
    .eq('guild_id', message.guild.id)
    .single();

  if (afkUser) {
    // Remove from AFK
    await supabase
      .from('afk_users')
      .delete()
      .eq('user_id', message.author.id)
      .eq('guild_id', message.guild.id);

    // Try to remove [AFK] from nickname
    try {
      const currentNick = message.member.nickname;
      if (currentNick && currentNick.startsWith('[AFK] ')) {
        await message.member.setNickname(currentNick.replace('[AFK] ', ''));
      }
    } catch (e) {
      // Missing permissions — skip
    }

    const afkDuration = Math.round((Date.now() - new Date(afkUser.afk_time).getTime()) / 60000);
    await message.reply(`Welcome back! You were AFK for **${afkDuration} minutes**. 🫡`);
  }

  // Check if someone mentions an AFK user
  if (message.mentions.users.size > 0) {
    for (const [userId] of message.mentions.users) {
      const { data: mentionedAfk } = await supabase
        .from('afk_users')
        .select('*')
        .eq('user_id', userId)
        .eq('guild_id', message.guild.id)
        .single();

      if (mentionedAfk) {
        const afkDuration = Math.round((Date.now() - new Date(mentionedAfk.afk_time).getTime()) / 60000);
        await message.reply(`📍 **${mentionedAfk.username}** is AFK: ${mentionedAfk.reason} (${afkDuration} min ago)`);
      }
    }
  }
});

client.login(process.env.TOKEN);
