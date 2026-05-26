# 💕 Sweetheart Bot

A romantic Discord bot with AFK tracking and Mimic features, built with Discord.js 14 and Supabase.

> **Zero privileged intents required** — the bot works without enabling any special gateway intents in the Discord Developer Portal.

## ✨ Features

- **AFK System** — Set yourself as AFK with `/afk`, get welcomed back automatically when you return, and notify others when you're mentioned
- **AFK Break** — Manually remove your AFK status with `/afkbreak`
- **AFK List** — See all currently AFK users with `/afk-list`
- **Mimic System** — Impersonate another user via webhooks with `/mimic`
- **Supabase Integration** — Persistent AFK data storage across bot restarts
- **Docker Support** — Ready for containerized deployment on Railway, Fly.io, or any Docker host

## 🤖 Commands

| Command | Description |
|---------|-------------|
| `/afk [reason]` | Set your AFK status with an optional reason (max 200 chars) |
| `/afkbreak` | Manually remove your AFK status |
| `/afk-list` | See all currently AFK users in this server |
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

Use this invite link format (replace `YOUR_CLIENT_ID`):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

> ⚠️ **`applications.commands` scope is required** for slash commands to work!

Make sure your bot has these permissions:

- **Send Messages** — to send AFK/Mimic messages
- **Embed Links** — to send rich embed messages
- **Manage Webhooks** — required for the `/mimic` command
- **Use Application Commands** — to use slash commands

### 3. Set Up Supabase Database

Create a new table called `afk_users` in your Supabase project. Run this in the **SQL Editor**:

```sql
CREATE TABLE IF NOT EXISTS afk_users (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  afk_time TIMESTAMPTZ NOT NULL,
  reason TEXT DEFAULT 'Just stepped away for a moment 💫',
  avatar_url TEXT,
  username TEXT,
  PRIMARY KEY (user_id, guild_id)
);
```

Also disable RLS (Row Level Security) on the table, or add appropriate policies:

```sql
ALTER TABLE afk_users DISABLE ROW LEVEL SECURITY;
```

### 4. Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
DISCORD_TOKEN=your-discord-bot-token
CLIENT_ID=your-application-client-id
GUILD_ID=your-test-server-id
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
```

| Variable | Where to find it |
|----------|-----------------|
| `DISCORD_TOKEN` | Discord Developer Portal → Your App → Bot → Token |
| `CLIENT_ID` | Discord Developer Portal → Your App → General Information → Application ID |
| `GUILD_ID` | Discord → Server Settings → Widget → Server ID (for instant command registration) |
| `SUPABASE_URL` | Supabase Dashboard → Your Project → Settings → API → Project URL |
| `SUPABASE_KEY` | Supabase Dashboard → Your Project → Settings → API → anon public key |

> 💡 **Tip:** Setting `GUILD_ID` makes slash commands appear **instantly**. Without it, commands register globally which can take **up to 1 hour**.

### 5. Deploy Slash Commands

Register the slash commands with Discord (only needed once, or when commands change):

```bash
npm run deploy
```

You should see:
```
  📁 Loaded: /afk
  📁 Loaded: /afkbreak
  📁 Loaded: /afk-list
  📁 Loaded: /mimic

🔄 Registering 4 guild slash command(s) [instant]...
✅ Guild slash commands registered successfully!
   Commands should appear instantly in your server.
```

### 6. Start the Bot

```bash
npm start
```

You should see:
```
📁 Loaded command: /afk
📁 Loaded command: /afkbreak
📁 Loaded command: /afk-list
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
   - `GUILD_ID`
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
        ├── afk-list.js     # /afk-list slash command
        └── mimic.js        # /mimic slash command
```

## 📝 License

ISC
