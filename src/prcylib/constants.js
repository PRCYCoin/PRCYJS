var G = "0279BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798";
var H = "0250929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0";

const getG = function() {
    return Uint8Array.from(Buffer.from(G, 'hex'));
}

const getH = function() {
    return Uint8Array.from(Buffer.from(H, 'hex'));
}

const GET = {
    getG: getG,
    getH: getH,
    // Max number of inputs for a transaction
    MAX_TX_INPUTS: 50,
    COIN: 100000000,
    BASE_FEE: 1000000,
    TX_FEE: 0.00026110,
    // Masternode Collateral amount
    COLLATERAL: 500000000000,
    CONFIRMATIONS: 100,
    SEED: "prcycoin seed",
    CoinType: 853,
}

module.exports = GET;