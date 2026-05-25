require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

// 🔹 Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🔹 Create data.json automatically if missing
if (!fs.existsSync('./data.json')) {
  fs.writeFileSync(
    './data.json',
    JSON.stringify(
      {
        afk: {},
        mimic: null
      },
      null,
      2
    )
  );
}

// 🔹 Load data
let data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));

// 🔹 Save function
function saveData() {
  fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
}

// 🔹 Message Event
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  // =========================
  // AFK REMOVE (automatic)
  // =========================
  if (data.afk[msg.author.id]) {
    delete data.afk[msg.author.id];
    saveData();
    msg.reply("Welcome back! AFK removed.");
  }

  // =========================
  // AFK SET
  // =========================
  if (msg.content.startsWith('!afk')) {
    const reason = msg.content.slice(5).trim() || "AFK";

    data.afk[msg.author.id] = {
      reason: reason,
      time: Date.now()
    };

    saveData();

    return msg.reply(`You are now AFK: ${reason}`);
  }

  // =========================
  // AFK BREAK
  // =========================
  if (msg.content === '!afkbreak') {
    if (data.afk[msg.author.id]) {
      delete data.afk[msg.author.id];
      saveData();

      return msg.reply("AFK manually removed.");
    } else {
      return msg.reply("You are not AFK.");
    }
  }

  // =========================
  // Mention AFK User
  // =========================
  if (msg.mentions.users.size > 0) {
    msg.mentions.users.forEach(user => {
      if (data.afk[user.id]) {
        const time = Math.floor(
          (Date.now() - data.afk[user.id].time) / 60000
        );

        msg.reply(
          `${user.username} is AFK: ${data.afk[user.id].reason} (${time} min ago)`
        );
      }
    });
  }

  // =========================
  // Mimic ON
  // =========================
  if (msg.content.startsWith('!mimic')) {
    const user = msg.mentions.users.first();

    if (!user) {
      return msg.reply("Mention a user to mimic.");
    }

    data.mimic = user.id;
    saveData();

    return msg.reply(`Now mimicking ${user.username}`);
  }

  // =========================
  // Mimic OFF
  // =========================
  if (msg.content === '!mimicoff') {
    data.mimic = null;
    saveData();

    return msg.reply("Mimic turned off.");
  }

  // =========================
  // Mimic WORK
  // =========================
  if (data.mimic === msg.author.id) {
    msg.channel.send(msg.content);
  }
});

// 🔹 Bot Ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 🔹 Login
client.login(process.env.TOKEN);
