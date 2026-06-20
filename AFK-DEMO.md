# 🌙 AFK Message Demos

Short & clean AFK message previews for the Abigail bot. All embeds use pink accents (`#FF69B4` / `#FF1493` / `#E91E63`) and the user's avatar as a thumbnail.

---

## 1. 🌙 AFK Set — `.afk [reason]` / `!afk [reason]`

Triggered when a user goes AFK.

```
🌙 AFK Mode Activated
👤 Dracula is now AFK

Off you go, my love! Come back soon 💖
📝 sleeping • ⏱️ just now
```

Random message line is picked from `src/messages.js` → `AFK_SET_MESSAGES`.

---

## 2. ☕ AFK Break — `.afk break [reason]` / `!afk break [reason]`

Triggered when a user goes on a break.

```
☕ Break Time!
👤 Dracula is now on a break

Break time, darling ☕ Rest up! 💕
📝 lunch • ⏱️ just now
```

Random message line is picked from `src/messages.js` → `AFK_BREAK_MESSAGES`.

---

## 3. 💝 AFK Return — automatic

Triggered automatically when an AFK user sends any message. Posted in the same channel, **auto-deletes after 5 seconds**.

```
💝 Welcome Back!
👤 Dracula is back!

Look who's back! 😍
📝 sleeping 💤 • ⏱️ Away for 2 hours 15 mins
```

Random message line is picked from `src/messages.js` → `AFK_RETURN_MESSAGES`.

---

## 4. 🌙 AFK Mention — channel reply

Triggered when someone pings an AFK user. Posted as a reply, **auto-deletes after 1 second** (30s cooldown per pinged user).

```
🌙 Dracula is AFK — `sleeping 💤` (2 hours 15 mins)
```

---

## 5. 📢 AFK Mention — DM to AFK user

Sent via DM to the AFK user, telling them who pinged them and where.

```
📢 Mentioned While AFK
👤 Snow pinged you!

👤 Who: Snow (<@982661154843291658>)
📢 Where: #general in My Server
💬 Msg: @Dracula kaha ho?
🔗 Jump to message
```

---

## 6. 🔨 AFK Broken — `.afkbreak @user` / `!afkbreak @user`

Triggered when the bot owner or Snow breaks someone's AFK. Posted in the channel where the command was used.

```
🔨 AFK Broken!
👤 Dracula's AFK was broken!

Snow broke Dracula's AFK!
📝 sleeping 💤 • ⏱️ 2 hours 15 mins
```

A DM is also sent to the target user:

```
🔨 Your AFK Was Broken!

Snow broke your AFK in My Server!
📝 sleeping 💤 • ⏱️ 2 hours 15 mins
```

---

## 🛡️ AFK Break Protection

If the target is protected (added via `/afk-break-protection`), only the bot owner can break their AFK:

```
🛡️ Dracula is AFK break protected! Only the bot owner can break their AFK.
```

---

## 🎨 Design Notes

- All embeds use pink color palette (`#FF69B4`, `#FF1493`, `#E91E63`)
- Thumbnail = user's display avatar (256px, dynamic)
- Author line shows username + status with avatar icon
- Timestamps use Discord's `<t:...:R>` relative format
- Channel replies (mention) auto-delete after 1 second to keep chat clean
- Return message auto-deletes after 5 seconds
- All romantic message lines are randomized from `src/messages.js`

## 📜 Source

All message banks live in [`src/messages.js`](src/messages.js):
- `AFK_SET_MESSAGES` — when going AFK
- `AFK_BREAK_MESSAGES` — when going on break
- `AFK_RETURN_MESSAGES` — when returning
- `AFK_MENTION_MESSAGES` — (legacy) when mentioned

Embed rendering logic lives in [`src/index.js`](src/index.js) — search for `AFK Prefix Commands`, `AFK Return`, `AFK Mention`, and `afkbreak`.
