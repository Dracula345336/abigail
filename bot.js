require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 🔹 Data file path
const DATA_PATH = path.join(__dirname, 'data.json');

// 🔹 Default data structure
const DEFAULT_DATA = {
  afk: {},
  mimic: null
};

// 🔹 Create data.json automatically if missing
if (!fs.existsSync(DATA_PATH)) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(DEFAULT_DATA, null, 2));
}

// 🔹 Load data
let data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

// 🔹 Ensure data structure integrity
if (!data.afk) data.afk = {};
if (data.mimic === undefined) data.mimic = null;

// 🔹 Save function
function saveData() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save data:', err);
  }
}

// 🔹 Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🔹 Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

// 🔹 Message Event
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  try {
    // =========================
    // AFK REMOVE (automatic)
    // =========================
    if (data.afk[msg.author.id]) {
      delete data.afk[msg.author.id];
      saveData();
      await msg.reply("Welcome back! AFK removed.");
    }

    // =========================
    // AFK SET
    // =========================
    if (msg.content.startsWith('!afk')) {
      const reason = msg.content.slice(4).trim() || "AFK";

      data.afk[msg.author.id] = {
        reason: reason,
        time: Date.now()
      };

      saveData();

      return await msg.reply(`You are now AFK: ${reason}`);
    }

    // =========================
    // AFK BREAK
    // =========================
    if (msg.content === '!afkbreak') {
      if (data.afk[msg.author.id]) {
        delete data.afk[msg.author.id];
        saveData();

        return await msg.reply("AFK manually removed.");
      } else {
        return await msg.reply("You are not AFK.");
      }
    }

    // =========================
    // Mention AFK User
    // =========================
    if (msg.mentions.users.size > 0) {
      for (const [userId, user] of msg.mentions.users) {
        if (data.afk[userId]) {
          const time = Math.floor(
            (Date.now() - data.afk[userId].time) / 60000
          );

          await msg.reply(
            `${user.username} is AFK: ${data.afk[userId].reason} (${time} min ago)`
          );
        }
      }
    }

    // =========================
    // Mimic ON
    // =========================
    if (msg.content.startsWith('!mimic')) {
      const user = msg.mentions.users.first();

      if (!user) {
        return await msg.reply("Mention a user to mimic.");
      }

      data.mimic = user.id;
      saveData();

      return await msg.reply(`Now mimicking ${user.username}`);
    }

    // =========================
    // Mimic OFF
    // =========================
    if (msg.content === '!mimicoff') {
      data.mimic = null;
      saveData();

      return await msg.reply("Mimic turned off.");
    }

    // =========================
    // Mimic WORK
    // =========================
    if (data.mimic === msg.author.id) {
      await msg.channel.send(msg.content);
    }
  } catch (err) {
    console.error('Error handling message:', err);
  }
});

// 🔹 Bot Ready
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 🔹 Login (only once!)
client.login(process.env.TOKEN);
