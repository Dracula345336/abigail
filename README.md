# Sweetheart Bot 💕

A romantic Discord bot with AFK & Mimic systems, built with Discord.js and Supabase.

## Features

- **AFK System** — Set yourself as AFK with a custom reason, get notified when mentioned
- **Mimic System** — Mimic another user's messages in real-time
- **Supabase Integration** — Persistent data storage (coming soon)

## Commands

| Command | Description |
|---------|-------------|
| `!afk [reason]` | Set AFK status with an optional reason |
| `!afkbreak` | Manually remove your AFK status |
| `!mimic @user` | Start mimicking a user's messages |
| `!mimicoff` | Stop mimicking |

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with your tokens:
   ```
   TOKEN=your-discord-bot-token
   SUPABASE_URL=your-supabase-url
   SUPABASE_KEY=your-supabase-key
   ```
4. Start the bot: `npm start`

## Docker

```bash
docker build -t sweetheart-bot .
docker run -d --env-file .env sweetheart-bot
```

## License

ISC
