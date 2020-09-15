const Coins = require("./coins.json");
const Coins2 = require("./coins2.json");
const CoinSelect = require('../../src/coinselection/simple');

function readCoins() {
    var coinMap = {};
    for(var i = 0; i < Coins.length; i++) {
        coinMap[i] = Coins[i].utxo.amount;
    }
    return coinMap;
}

function readCoins2() {
    return Coins2;
}

var coins = readCoins2();

console.log("Coins:", coins);

var selection = CoinSelect.selectCoins(coins, 10000000000, 12, 2);

console.log("SelectCoins:", selection);



