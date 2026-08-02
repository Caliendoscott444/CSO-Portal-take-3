const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { handleAutoMod } = require('./autoMod');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // required to read message text
    GatewayIntentBits.GuildMembers,   // required for timeout/ban + member.moderatable
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  handleAutoMod(message);
});

client.login(process.env.DISCORD_TOKEN);
