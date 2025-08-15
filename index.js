require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require('discord.js');
const axios = require('axios');
const WebSocket = require('ws');
const cron = require('node-cron');

class CryptoTradingBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });
        
        this.config = {
            // Discord Bot Token (get from Discord Developer Portal)
            DISCORD_TOKEN: process.env.DISCORD_TOKEN,
            
            // Channel IDs for different types of content
            PRICE_ALERTS_CHANNEL: process.env.PRICE_ALERTS_CHANNEL,
            NEWS_CHANNEL: process.env.NEWS_CHANNEL,
            NFT_CHANNEL: process.env.NFT_CHANNEL,
            ONCHAIN_CHANNEL: process.env.ONCHAIN_CHANNEL,
            GENERAL_TRADING_CHANNEL: process.env.GENERAL_TRADING_CHANNEL,
            
            // Tracked symbols
            TRACKED_SYMBOLS: ['bitcoin', 'ethereum', 'binancecoin', 'cardano', 'solana', 'polkadot', 'dogecoin', 'avalanche-2', 'chainlink', 'polygon'],
            
            // Price alert thresholds (percentage change)
            PRICE_ALERT_THRESHOLD: 5,
            
            // Update intervals (in minutes)
            PRICE_UPDATE_INTERVAL: 5,
            NEWS_UPDATE_INTERVAL: 30,
            NFT_UPDATE_INTERVAL: 60
        };
        
        this.priceCache = new Map();
        this.newsCache = new Set();
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            console.log(`🚀 ${this.client.user.tag} is online!`);
            this.startAutomatedTasks();
        });

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            await this.handleCommands(message);
        });
    }

    async handleCommands(message) {
        const content = message.content.toLowerCase();
        
        if (content.startsWith('!price ')) {
            const symbol = content.split(' ')[1];
            await this.sendPriceInfo(message.channel, symbol);
        }
        
        if (content === '!portfolio') {
            await this.sendPortfolioOverview(message.channel);
        }
        
        if (content === '!trending') {
            await this.sendTrendingCoins(message.channel);
        }
        
        if (content === '!fear') {
            await this.sendFearGreedIndex(message.channel);
        }
        
        if (content === '!gas') {
            await this.sendGasTracker(message.channel);
        }
        
        if (content.startsWith('!alert ')) {
            await this.setupPriceAlert(message);
        }
    }

    async startAutomatedTasks() {
        // Price monitoring every 5 minutes
        cron.schedule(`*/${this.config.PRICE_UPDATE_INTERVAL} * * * *`, async () => {
            await this.checkPriceAlerts();
        });

        // News updates every 30 minutes
        cron.schedule(`*/${this.config.NEWS_UPDATE_INTERVAL} * * * *`, async () => {
            await this.postCryptoNews();
        });

        // NFT trending updates every hour
        cron.schedule(`*/${this.config.NFT_UPDATE_INTERVAL} * * * *`, async () => {
            await this.postNFTTrending();
        });

        // On-chain metrics every 2 hours
        cron.schedule('0 */2 * * *', async () => {
            await this.postOnChainMetrics();
        });

        // Daily market summary at 9 AM UTC
        cron.schedule('0 9 * * *', async () => {
            await this.postDailyMarketSummary();
        });
    }

    // FREE API INTEGRATIONS

    async getPriceData(symbols) {
        try {
            const symbolsStr = Array.isArray(symbols) ? symbols.join(',') : symbols;
            const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price`, {
                params: {
                    ids: symbolsStr,
                    vs_currencies: 'usd',
                    include_24hr_change: true,
                    include_24hr_vol: true,
                    include_market_cap: true
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching price data:', error.message);
            return null;
        }
    }

    async getCryptoNews() {
        try {
            // Using CoinGecko's free news endpoint (alternative: NewsAPI with crypto keywords)
            const response = await axios.get('https://api.coingecko.com/api/v3/news');
            return response.data.data.slice(0, 5); // Get top 5 news
        } catch (error) {
            console.error('Error fetching news:', error.message);
            return [];
        }
    }

    async getFearGreedIndex() {
        try {
            const response = await axios.get('https://api.alternative.me/fng/');
            return response.data.data[0];
        } catch (error) {
            console.error('Error fetching fear & greed index:', error.message);
            return null;
        }
    }

    async getGasTracker() {
        try {
            const response = await axios.get('https://api.etherscan.io/api', {
                params: {
                    module: 'gastracker',
                    action: 'gasoracle',
                    apikey: 'YourEtherscanAPIKey' // Free tier available
                }
            });
            return response.data.result;
        } catch (error) {
            console.error('Error fetching gas data:', error.message);
            return null;
        }
    }

    async getTrendingCoins() {
        try {
            const response = await axios.get('https://api.coingecko.com/api/v3/search/trending');
            return response.data.coins;
        } catch (error) {
            console.error('Error fetching trending coins:', error.message);
            return [];
        }
    }

    // DISCORD POSTING FUNCTIONS

    async sendPriceInfo(channel, symbol) {
        const priceData = await this.getPriceData(symbol);
        if (!priceData || !priceData[symbol]) {
            channel.send(`❌ Could not find price data for ${symbol}`);
            return;
        }

        const data = priceData[symbol];
        const embed = new EmbedBuilder()
            .setTitle(`💰 ${symbol.toUpperCase()} Price`)
            .setColor(data.usd_24h_change > 0 ? 0x00FF00 : 0xFF0000)
            .addFields(
                { name: 'Price', value: `$${data.usd.toLocaleString()}`, inline: true },
                { name: '24h Change', value: `${data.usd_24h_change.toFixed(2)}%`, inline: true },
                { name: 'Market Cap', value: `$${(data.usd_market_cap / 1e9).toFixed(2)}B`, inline: true }
            )
            .setTimestamp();

        channel.send({ embeds: [embed] });
    }

    async checkPriceAlerts() {
        const channel = this.client.channels.cache.get(this.config.PRICE_ALERTS_CHANNEL);
        if (!channel) return;

        const currentPrices = await this.getPriceData(this.config.TRACKED_SYMBOLS);
        if (!currentPrices) return;

        for (const [symbol, data] of Object.entries(currentPrices)) {
            const change = Math.abs(data.usd_24h_change);
            
            if (change >= this.config.PRICE_ALERT_THRESHOLD) {
                const embed = new EmbedBuilder()
                    .setTitle(`🚨 Price Alert: ${symbol.toUpperCase()}`)
                    .setColor(data.usd_24h_change > 0 ? 0x00FF00 : 0xFF0000)
                    .setDescription(`${symbol.toUpperCase()} has moved ${data.usd_24h_change.toFixed(2)}% in the last 24 hours!`)
                    .addFields(
                        { name: 'Current Price', value: `$${data.usd.toLocaleString()}`, inline: true },
                        { name: '24h Change', value: `${data.usd_24h_change.toFixed(2)}%`, inline: true },
                        { name: 'Volume', value: `$${(data.usd_24h_vol / 1e6).toFixed(2)}M`, inline: true }
                    )
                    .setTimestamp();

                channel.send({ embeds: [embed] });
            }
        }
    }

    async postCryptoNews() {
        const channel = this.client.channels.cache.get(this.config.NEWS_CHANNEL);
        if (!channel) return;

        const news = await this.getCryptoNews();
        
        for (const article of news) {
            if (this.newsCache.has(article.id)) continue;
            
            this.newsCache.add(article.id);
            
            const embed = new EmbedBuilder()
                .setTitle(`📰 ${article.title}`)
                .setDescription(article.description?.substring(0, 200) + '...' || 'No description available')
                .setURL(article.url)
                .setThumbnail(article.thumb_2x || article.image)
                .setColor(0x1DA1F2)
                .setTimestamp(new Date(article.created_at));

            channel.send({ embeds: [embed] });
            
            // Prevent spam - small delay between posts
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    async postDailyMarketSummary() {
        const channel = this.client.channels.cache.get(this.config.GENERAL_TRADING_CHANNEL);
        if (!channel) return;

        const priceData = await this.getPriceData(this.config.TRACKED_SYMBOLS);
        const fearGreed = await this.getFearGreedIndex();
        const trending = await this.getTrendingCoins();

        const embed = new EmbedBuilder()
            .setTitle('📊 Daily Market Summary')
            .setColor(0x9932CC)
            .setTimestamp();

        if (fearGreed) {
            embed.addFields({
                name: '😱 Fear & Greed Index',
                value: `${fearGreed.value}/100 - ${fearGreed.value_classification}`,
                inline: false
            });
        }

        if (priceData) {
            const topMovers = Object.entries(priceData)
                .sort((a, b) => Math.abs(b[1].usd_24h_change) - Math.abs(a[1].usd_24h_change))
                .slice(0, 3);

            embed.addFields({
                name: '🚀 Top Movers (24h)',
                value: topMovers.map(([symbol, data]) => 
                    `${symbol.toUpperCase()}: ${data.usd_24h_change.toFixed(2)}%`
                ).join('\n'),
                inline: true
            });
        }

        if (trending.length > 0) {
            embed.addFields({
                name: '🔥 Trending',
                value: trending.slice(0, 5).map((coin, i) => 
                    `${i + 1}. ${coin.item.name} (${coin.item.symbol})`
                ).join('\n'),
                inline: true
            });
        }

        channel.send({ embeds: [embed] });
    }

    async sendTrendingCoins(channel) {
        const trending = await this.getTrendingCoins();
        
        const embed = new EmbedBuilder()
            .setTitle('🔥 Trending Cryptocurrencies')
            .setColor(0xFF6B35)
            .setDescription(
                trending.slice(0, 10).map((coin, i) => 
                    `${i + 1}. **${coin.item.name}** (${coin.item.symbol.toUpperCase()}) - Rank #${coin.item.market_cap_rank || 'N/A'}`
                ).join('\n')
            )
            .setTimestamp();

        channel.send({ embeds: [embed] });
    }

    async sendFearGreedIndex(channel) {
        const fearGreed = await this.getFearGreedIndex();
        if (!fearGreed) {
            channel.send('❌ Could not fetch Fear & Greed Index');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('😱 Crypto Fear & Greed Index')
            .setColor(fearGreed.value < 25 ? 0xFF0000 : fearGreed.value > 75 ? 0x00FF00 : 0xFFFF00)
            .addFields(
                { name: 'Current Value', value: `${fearGreed.value}/100`, inline: true },
                { name: 'Classification', value: fearGreed.value_classification, inline: true },
                { name: 'Last Update', value: new Date(fearGreed.timestamp * 1000).toLocaleString(), inline: true }
            )
            .setDescription(
                `The Fear & Greed Index ranges from 0 (Extreme Fear) to 100 (Extreme Greed).\n` +
                `Current sentiment: **${fearGreed.value_classification}**`
            )
            .setTimestamp();

        channel.send({ embeds: [embed] });
    }

    async sendGasTracker(channel) {
        const gasData = await this.getGasTracker();
        if (!gasData) {
            channel.send('❌ Could not fetch gas data');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('⛽ Ethereum Gas Tracker')
            .setColor(0x627EEA)
            .addFields(
                { name: 'Safe Gas Price', value: `${gasData.SafeGasPrice} gwei`, inline: true },
                { name: 'Standard Gas Price', value: `${gasData.StandardGasPrice} gwei`, inline: true },
                { name: 'Fast Gas Price', value: `${gasData.FastGasPrice} gwei`, inline: true }
            )
            .setTimestamp();

        channel.send({ embeds: [embed] });
    }

    // ON-CHAIN METRICS (using free APIs)
    async postOnChainMetrics() {
        const channel = this.client.channels.cache.get(this.config.ONCHAIN_CHANNEL);
        if (!channel) return;

        try {
            // Bitcoin network stats (free from blockchain.info)
            const btcStats = await axios.get('https://blockchain.info/stats?format=json');
            
            const embed = new EmbedBuilder()
                .setTitle('⛓️ On-Chain Metrics')
                .setColor(0xF7931A)
                .addFields(
                    { name: 'Bitcoin Network', value: `Hash Rate: ${(btcStats.data.hash_rate / 1e18).toFixed(2)} EH/s\nDifficulty: ${(btcStats.data.difficulty / 1e12).toFixed(2)}T`, inline: true },
                    { name: 'Market Activity', value: `Transactions (24h): ${btcStats.data.n_tx.toLocaleString()}\nTotal BTC: ${(btcStats.data.totalbc / 1e8).toFixed(0)}`, inline: true }
                )
                .setTimestamp();

            channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error posting on-chain metrics:', error.message);
        }
    }

    // NFT INTEGRATION (using OpenSea free tier)
    async postNFTTrending() {
        const channel = this.client.channels.cache.get(this.config.NFT_CHANNEL);
        if (!channel) return;

        try {
            // Note: OpenSea API requires API key for most endpoints
            // Alternative: Use CoinGecko's NFT data
            const response = await axios.get('https://api.coingecko.com/api/v3/nfts/list');
            const trending = response.data.slice(0, 5);

            const embed = new EmbedBuilder()
                .setTitle('🖼️ Trending NFT Collections')
                .setColor(0x9932CC)
                .setDescription(
                    trending.map((nft, i) => 
                        `${i + 1}. **${nft.name}** - ${nft.description?.substring(0, 50) + '...' || 'No description'}`
                    ).join('\n')
                )
                .setTimestamp();

            channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error posting NFT data:', error.message);
        }
    }

    async start() {
        try {
            await this.client.login(this.config.DISCORD_TOKEN);
        } catch (error) {
            console.error('Failed to start bot:', error.message);
        }
    }
}

// WEBHOOK SETUP FOR EXCHANGE INTEGRATIONS
class WebhookHandler {
    constructor(bot) {
        this.bot = bot;
        this.setupWebhookServer();
    }

    setupWebhookServer() {
        const express = require('express');
        const app = express();
        app.use(express.json());

        // TradingView webhook endpoint
        app.post('/webhook/tradingview', (req, res) => {
            this.handleTradingViewAlert(req.body);
            res.status(200).send('OK');
        });

        // Exchange webhook endpoint (for order fills, etc.)
        app.post('/webhook/exchange', (req, res) => {
            this.handleExchangeWebhook(req.body);
            res.status(200).send('OK');
        });

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Webhook server running on port ${PORT}`);
        });
    }

    async handleTradingViewAlert(data) {
        const channel = this.bot.client.channels.cache.get(this.bot.config.GENERAL_TRADING_CHANNEL);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle('📈 TradingView Alert')
            .setColor(0x00D4AA)
            .setDescription(`**${data.symbol}** - ${data.message}`)
            .addFields(
                { name: 'Action', value: data.action || 'N/A', inline: true },
                { name: 'Price', value: data.price || 'N/A', inline: true }
            )
            .setTimestamp();

        channel.send({ embeds: [embed] });
    }

    async handleExchangeWebhook(data) {
        const channel = this.bot.client.channels.cache.get(this.bot.config.GENERAL_TRADING_CHANNEL);
        if (!channel) return;

        // Handle different types of exchange notifications
        if (data.type === 'order_fill') {
            const embed = new EmbedBuilder()
                .setTitle('✅ Order Filled')
                .setColor(0x00FF00)
                .addFields(
                    { name: 'Symbol', value: data.symbol, inline: true },
                    { name: 'Side', value: data.side, inline: true },
                    { name: 'Amount', value: data.amount, inline: true },
                    { name: 'Price', value: data.price, inline: true }
                )
                .setTimestamp();

            channel.send({ embeds: [embed] });
        }
    }
}

// ENVIRONMENT SETUP
const setupInstructions = `
🚀 CRYPTO TRADING BOT SETUP INSTRUCTIONS

1. DISCORD BOT SETUP:
   - Go to https://discord.com/developers/applications
   - Create new application
   - Go to "Bot" section, create bot
   - Copy bot token
   - Enable necessary intents

2. ENVIRONMENT VARIABLES (.env file):
   DISCORD_TOKEN=your_bot_token
   PRICE_ALERTS_CHANNEL=channel_id
   NEWS_CHANNEL=channel_id
   NFT_CHANNEL=channel_id
   ONCHAIN_CHANNEL=channel_id
   GENERAL_TRADING_CHANNEL=channel_id

3. REQUIRED NPM PACKAGES:
   npm install discord.js axios ws node-cron express

4. FREE API KEYS NEEDED:
   - Etherscan API (free tier): https://etherscan.io/apis
   - Optional: NewsAPI for more news sources

5. HOSTING OPTIONS (FREE):
   - Railway.app (free tier)
   - Heroku (free tier discontinued, but paid plans available)
   - Replit (free tier)
   - Digital Ocean App Platform ($5/month)

6. WEBHOOK SETUP:
   - Deploy to hosting platform
   - Use webhook URLs for TradingView alerts
   - Set up exchange API webhooks (if supported)

7. BOT COMMANDS:
   !price [symbol] - Get price info
   !portfolio - Portfolio overview
   !trending - Trending coins
   !fear - Fear & Greed Index
   !gas - Ethereum gas tracker
   !alert [symbol] [price] - Set price alert

8. AUTOMATED FEATURES:
   - Price alerts every 5 minutes
   - News updates every 30 minutes
   - NFT trending every hour
   - On-chain metrics every 2 hours
   - Daily market summary at 9 AM UTC
`;

// Initialize the bot
const bot = new CryptoTradingBot();
const webhookHandler = new WebhookHandler(bot);

// Start the bot
bot.start();

console.log(setupInstructions);

module.exports = { CryptoTradingBot, WebhookHandler };