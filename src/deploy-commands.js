require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════
   ✅  Validate Environment
   ═══════════════════════════════════════════ */

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is not set. Please check your .env file.');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error('❌ CLIENT_ID is not set. Please check your .env file.');
  console.error('   You can find your Client ID in the Discord Developer Portal:');
  console.error('   https://discord.com/developers/applications → General Information → APPLICATION ID');
  process.exit(1);
}

/* ═══════════════════════════════════════════
   📁  Load Commands
   ═══════════════════════════════════════════ */

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
    console.log(`  📁 Loaded: /${command.data.name}`);
  } else {
    console.warn(`  ⚠️ Skipped: ${file} (missing "data" or "execute" export)`);
  }
}

/* ═══════════════════════════════════════════
   🚀  Register Commands
   ═══════════════════════════════════════════ */

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    if (process.env.GUILD_ID) {
      /* ── Guild commands = INSTANT (use for testing) ── */
      console.log(`\n🔄 Registering ${commands.length} guild slash command(s) [instant]...`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log('✅ Guild slash commands registered successfully!');
      console.log('   Commands should appear instantly in your server.');
    } else {
      /* ── Global commands = up to 1 hour delay ── */
      console.log(`\n🔄 Registering ${commands.length} global slash command(s)...`);
      console.log('   ⚠️  No GUILD_ID set — using global registration.');
      console.log('   ⚠️  Global commands can take up to 1 HOUR to appear in Discord!');
      console.log('   ⚠️  Add GUILD_ID to .env for instant guild registration.');
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log('✅ Global slash commands registered successfully!');
    }
  } catch (error) {
    console.error('❌ Registration failed:', error.message);
    if (error.status === 401) {
      console.error('   Your DISCORD_TOKEN may be invalid.');
    } else if (error.status === 403) {
      console.error('   Your CLIENT_ID may be incorrect or the token does not match the application.');
    } else if (error.status === 404 && process.env.GUILD_ID) {
      console.error('   Your GUILD_ID may be incorrect. Check your server ID.');
    }
    process.exit(1);
  }
})();
