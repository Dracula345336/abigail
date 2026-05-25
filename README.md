# 💕 Sweetheart Bot

A romantic Discord bot with AFK tracking and Mimic features, built with Discord.js 14 and Supabase.

> **Zero privileged intents required** — the bot works without enabling any special gateway intents in the Discord Developer Portal.

## ✨ Features

- **AFK System** — Set yourself as AFK with `/afk`, get welcomed back automatically when you return, and notify others when you're mentioned
- **AFK Break** — Manually remove your AFK status with `/afkbreak`
- **Mimic System** — Impersonate another user via webhooks with `/mimic`
- **Supabase Integration** — Persistent AFK data storage across bot restarts
- **Docker Support** — Ready for containerized deployment on Railway, Fly.io, or any Docker host

## 🤖 Commands

| Command | Description |
|---------|-------------|
| `/afk [reason]` | Set your AFK status with an optional reason (max 200 chars) |
| `/afkbreak` | Manually remove your AFK status |
| `/mimic @user [message]` | Mimic another user in the channel (random message if blank) |

### Automatic Behavior

- When you send **any message** while AFK, your status is automatically removed and you'll get a welcome-back message
- When someone **mentions** an AFK user, they'll be notified that the user is away (with a 30-second cooldown to prevent spam)

## ⚙️ Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A [Discord Bot Application](https://discord.com/developers/applications)
- A [Supabase](https://supabase.com/) project

### 1. Clone & Install

```bash
git clone https://github.com/Dracula345336/abigal.git
cd abigal
npm install
```

### 2. Invite the Bot to Your Server

When generating the invite link in the Discord Developer Portal, make sure your bot has these permissions:

- **Send Messages** — to send AFK/Mimic messages
- **Embed Links** — to send rich embed messages
- **Manage Webhooks** — required for the `/mimic` command
- **Use Application Commands** — to use slash commands

### 3. Set Up Supabase Database

Create a new table called `afk_users` in your Supabase project:

```sql
CREATE TABLE afk_users (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  afk_time TIMESTAMPTZ NOT NULL,
  reason TEXT DEFAULT 'Just stepped away for a moment 💫',
  avatar_url TEXT,
  username TEXT,
  PRIMARY KEY (user_id, guild_id)
);
```

You can run this in the **SQL Editor** in your Supabase dashboard.

### 4. Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
DISCORD_TOKEN=your-discord-bot-token
CLIENT_ID=your-application-client-id
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
```

| Variable | Where to find it |
|----------|-----------------|
| `DISCORD_TOKEN` | Discord Developer Portal → Your App → Bot → Token |
| `CLIENT_ID` | Discord Developer Portal → Your App → General Information → Application ID |
| `SUPABASE_URL` | Supabase Dashboard → Your Project → Settings → API → Project URL |
| `SUPABASE_KEY` | Supabase Dashboard → Your Project → Settings → API → anon public key |

### 5. Deploy Slash Commands

Register the slash commands with Discord (only needed once, or when commands change):

```bash
npm run deploy
```

### 6. Start the Bot

```bash
npm start
```

You should see:
```
📁 Loaded command: /afk
📁 Loaded command: /afkbreak
📁 Loaded command: /mimic
💖 YourBot#1234 is online and spreading love!
📡 Serving 1 server(s)
```

## 🐳 Docker

Build and run with Docker:

```bash
docker build -t sweetheart-bot .
docker run -d --env-file .env sweetheart-bot
```

## 🚀 Railway Deployment

1. Connect your GitHub repo to Railway
2. Add the following environment variables in Railway:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
3. Railway will auto-deploy using the Dockerfile

> **Note:** After the first deploy, run `npm run deploy` once to register slash commands. You can do this by adding a start script or running it locally with the same env vars.

## 📁 Project Structure

```
abigal/
├── .env.example            # Environment variable template
├── Dockerfile              # Docker deployment config
├── package.json            # NPM manifest
├── README.md               # This file
└── src/
    ├── index.js            # Main bot entry point
    ├── deploy-commands.js  # Slash command registration script
    ├── messages.js         # Romantic message banks
    ├── utils.js            # Utility functions (pick, timeSince)
    ├── supabase.example.js # Supabase client template
    └── commands/
        ├── afk.js          # /afk slash command
        ├── afkbreak.js     # /afkbreak slash command
        └── mimic.js        # /mimic slash command
```

## 📝 License

ISC
