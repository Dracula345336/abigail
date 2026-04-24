require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));

function saveData() {
  fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
}

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  // 🔹 AFK REMOVE (auto)
  if (data.afk[msg.author.id]) {
    delete data.afk[msg.author.id];
    saveData();
    msg.reply("Welcome back! AFK removed.");
  }

  // 🔹 AFK SET
  if (msg.content.startsWith('!afk')) {
    const reason = msg.content.slice(5) || "AFK";
    data.afk[msg.author.id] = {
      reason: reason,
      time: Date.now()
    };
    saveData();
    return msg.reply(`You are now AFK: ${reason}`);
  }

  // 🔹 AFK BREAK (manual)
  if (msg.content === '!afkbreak') {
    if (data.afk[msg.author.id]) {
      delete data.afk[msg.author.id];
      saveData();
      return msg.reply("AFK manually removed.");
    } else {
      return msg.reply("You are not AFK.");
    }
  }

  // 🔹 Mention AFK user
  if (msg.mentions.users.size > 0) {
    msg.mentions.users.forEach(user => {
      if (data.afk[user.id]) {
        const time = Math.floor((Date.now() - data.afk[user.id].time) / 60000);
        msg.reply(`${user.username} is AFK: ${data.afk[user.id].reason} (${time} min ago)`);
      }
    });
  }

  // 🔹 Mimic SET
  if (msg.content.startsWith('!mimic')) {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention a user to mimic.");

    data.mimic = user.id;
    saveData();
    return msg.reply(`Now mimicking ${user.username}`);
  }

  // 🔹 Mimic OFF
  if (msg.content === '!mimicoff') {
    data.mimic = null;
    saveData();
    return msg.reply("Mimic turned off.");
  }

  // 🔹 Mimic WORK
  if (data.mimic === msg.author.id) {
    msg.channel.send(msg.content);
  }

});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
