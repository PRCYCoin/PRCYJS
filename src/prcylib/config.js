// Obtain Server Info from PRCY Team
const PRODUCTION_SERVER = "";
const DEV_SERVER = "";
const TX_SERVER = "";
console.log('wallet env:', process.env.NODE_ENV)
const config = {
    // Choose mainnet or testnet - testnet currently not supported.
    PRCYCHAIN: "mainnet",
    // Obtain SERVER_ENCRYPTION_KEY from PRCY Team
    SERVER_ENCRYPTION_KEY: "",
    // Choose whether you are using Production or Dev servers
    PRCY_SERVER: process.env.NODE_ENV == 'DEV' ? DEV_SERVER : PRODUCTION_SERVER,
    // Set the transaction server to handle transaction broadcasts
    PRCY_TX_SERVER: process.env.NODE_ENV == 'DEV' ? DEV_SERVER : TX_SERVER,
    CONFIRMATION: 100,
    // CoinGecko Price API Link (USD)
    PRICE_COINGECKO: "https://api.coingecko.com/api/v3/simple/price?ids=prcy-coin&vs_currencies=USD&include_market_cap=false&include_24hr_vol=false&include_24hr_change=false&include_last_updated_at=false",
    // Whether or not to lock masternode collaterals during transaction sends - default true to avoid breaking Masternodes
    LOCK_COLLATERAL: true,
    // Enable Debugging
    ENABLE_DEBUG: true,
    // Enable the Rewards Counter in console log
    ENABLE_REWARDS_COUNTER: false,
    // reCAPTCHA key from https://developers.google.com/recaptcha/docs/verify
    CAPTCHA_KEY: "",
}
module.exports = config;
