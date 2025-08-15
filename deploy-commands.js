require('dotenv').config();
console.log('Loaded env:', {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN?.slice(0, 10) + '...',
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID: process.env.GUILD_ID
});
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

console.log('Deploying with CLIENT_ID:', process.env.CLIENT_ID);
console.log('Deploying to GUILD_ID:', process.env.GUILD_ID);

const commands = [
  new SlashCommandBuilder()
    .setName('price')
    .setDescription('Get current price for a crypto token')
    .addStringOption(option =>
      option.setName('symbol')
        .setDescription('The symbol of the token (e.g. btc, eth)')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('trending')
    .setDescription('Get the current trending coins'),
  new SlashCommandBuilder()
    .setName('fear')
    .setDescription('Get the current Fear & Greed Index'),
  new SlashCommandBuilder()
    .setName('gas')
    .setDescription('Get current Ethereum gas prices')
]
  .map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log('✅ Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('❌ Failed to deploy commands:');
    console.error(error);
  }
})();