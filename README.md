# 💕 Sweetheart Bot

A romantic Discord bot with AFK tracking and Mimic features, built with Discord.js 14 and Supabase.

> **Zero privileged intents required** — the bot works without enabling any special gateway intents in the Discord Developer Portal.
> **Slash commands auto-register** — no need to run a separate deploy script, commands register automatically on bot startup.

## ✨ Features

- **AFK System** — Set yourself as AFK with `/afk set`, get welcomed back automatically when you return, and notify others when you're mentioned
- **AFK Break** — Manually remove your AFK status with `/afk break`
- **AFK List** — See all currently AFK users with `/afk list`
- **Mimic System** — Impersonate another user via webhooks with `/mimic`
- **Supabase Integration** — Persistent AFK data storage across bot restarts
- **Docker Support** — Ready for containerized deployment on Railway, Fly.io, or any Docker host

## 🤖 Commands

| Command | Description |
|---------|-------------|
| `/afk set [reason]` | Set your AFK status with an optional reason (max 200 chars) |
| `/afk break` | Manually remove your AFK status |
| `/afk list` | See all currently AFK users in this server |
| `/mimic @user [message]` | Mimic another user in the channel (random message if blank) |

### Automatic Behavior

- When you send **any message** while AFK, your status is automatically removed and you'll get a welcome-back message
- When someone **mentions** an AFK user, they'll be notified that the user is away (with a 30-second cooldown to prevent spam)

> 💖 **See message previews** — check out [`AFK-DEMO.md`](AFK-DEMO.md) for short & clean previews of every AFK message the bot sends.

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

| Variable | Required? | Where to find it |
|----------|-----------|-----------------|
| `DISCORD_TOKEN` | ✅ Yes | Discord Developer Portal → Your App → Bot → Token |
| `CLIENT_ID` | ✅ Yes | Discord Developer Portal → Your App → General Information → Application ID |
| `GUILD_ID` | ⚡ Recommended | Discord → Server Settings → Widget → Server ID (for instant command registration) |
| `SUPABASE_URL` | ✅ Yes | Supabase Dashboard → Your Project → Settings → API → Project URL |
| `SUPABASE_KEY` | ✅ Yes | Supabase Dashboard → Your Project → Settings → API → anon public key |

> 💡 **Tip:** Setting `GUILD_ID` makes slash commands appear **instantly** on startup. Without it, commands register globally which can take **up to 1 hour** to appear in Discord.

### 5. Start the Bot

```bash
npm start
```

You should see:
```
📁 Loaded command: /afk
📁 Loaded command: /mimic
💖 YourBot#1234 is online and spreading love!
📡 Serving 1 server(s)
🔄 Registering 2 guild slash command(s) [instant]...
✅ Guild slash commands registered! Commands should appear instantly.
```

> Slash commands are **automatically registered** every time the bot starts — no need to run a separate deploy script!

## 🐳 Docker

Build and run with Docker:

```bash
docker build -t sweetheart-bot .
docker run -d --env-file .env sweetheart-bot
```

## 🚀 Railway Deployment

1. Connect your GitHub repo to Railway
2. Add the following environment variables in Railway:
   - `DISCORD_TOKEN` (required)
   - `CLIENT_ID` (required — for slash command registration)
   - `GUILD_ID` (recommended — for instant command registration)
   - `SUPABASE_URL` (required)
   - `SUPABASE_KEY` (required)
3. Railway will auto-deploy using the Dockerfile
4. Slash commands are automatically registered on every bot startup

## 📁 Project Structure

```
abigal/
├── .env.example            # Environment variable template
├── Dockerfile              # Docker deployment config
├── package.json            # NPM manifest
├── README.md               # This file
├── AFK-DEMO.md             # AFK message previews
└── src/
    ├── index.js            # Main bot entry point + auto command registration
    ├── deploy-commands.js  # Standalone command registration script (optional)
    ├── messages.js         # Romantic message banks
    ├── utils.js            # Utility functions (pick, timeSince)
    ├── supabase.example.js # Supabase client template
    └── commands/
        ├── afk.js          # /afk set | /afk break | /afk list
        └── mimic.js        # /mimic @user [message]
```

## 📝 License

ISC
