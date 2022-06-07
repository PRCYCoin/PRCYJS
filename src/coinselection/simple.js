const utils = require('./utils')
const config = require("../prcylib/config");
const constants = require('../prcylib/constants');

// Debug variables
var enableDebug = config.ENABLE_DEBUG;

const selectCoins = function (coinMap, sendAmount, ringSize, numOut) {
    var vValue = [];    
    var nTotalLower = 0;
    var feeNeeded = 0;
    var setCoinsRet = [];
    var coinLowestLarger = null
    var nValueRet = 0;
    var LockCollateral = config.LOCK_COLLATERAL;
    if (enableDebug == true) {
        if (config.LOCK_COLLATERAL == true) {
            console.log("LOCK_COLLATERAL: " + config.LOCK_COLLATERAL + ": Masternode Collateral will not be spent");
        } else {
            console.log("LOCK_COLLATERAL: " + config.LOCK_COLLATERAL + ": Masternode Collateral will be spent");
        }
    }
    for (const ki of Object.keys(coinMap)) {
        var n = coinMap[ki];
        if (n == 0 || (n == constants.COLLATERAL && LockCollateral)) continue;

        feeNeeded = utils.ComputeFee(vValue.length + 1, numOut, ringSize);
        var feeForOneInput = utils.ComputeFee(1, numOut, ringSize);

        if (n === sendAmount + feeForOneInput) {
            // clear all previous findings
            setCoinsRet = [];
            setCoinsRet.push(ki);
            nValueRet = n;
            feeNeeded = feeForOneInput;
            return {selectedCoins: setCoinsRet, selectedValueSum: nValueRet, fee: feeNeeded};
        } else if (n < sendAmount + feeNeeded) {
            vValue.push({ki: ki, amount: n});
            nTotalLower += n;
        } else if (n >= sendAmount + feeForOneInput && (!coinLowestLarger || n < coinLowestLarger.amount)) {
            coinLowestLarger = {ki: ki, amount: n};
        } 
    }

    if (Object.keys(vValue).length <= constants.MAX_TX_INPUTS) {
        if (nTotalLower == sendAmount + feeNeeded) {
            for (const v of vValue) {
                setCoinsRet.push(v.ki);
                nValueRet +=v.amount;
            }
            return {selectedCoins: setCoinsRet, selectedValueSum: nValueRet, fee: feeNeeded};
        }
    }
    if (nTotalLower < sendAmount + feeNeeded) {
        if (!coinLowestLarger) // there is no input larger than nTargetValue
        {
            return false;
        }
        setCoinsRet.push(coinLowestLarger.ki);
        nValueRet += coinLowestLarger.amount;
        return {selectedCoins: setCoinsRet, selectedValueSum: nValueRet, fee: feeNeeded};
    } 
    
    // total lower > sendAmount + feeNeeded => two cases:
    // 1. If sum of 50 highest lower coins > sendAmount + feeNeeded => heuristics
    // 2. otherwise, take the coin lowest larger if any
    vValue.sort(function(c1, c2) {
        return c1.amount - c2.amount;
    });
    
    var sumOf50LargestLowers = vValue.reduce(function(total, currentValue, currentIndex) {
        currentIndex + constants.MAX_TX_INPUTS >= vValue.length?total + currentValue : total;
    }, 0)
    var maxFee = utils.ComputeFee(50, numOut, ringSize);

    if (sumOf50LargestLowers < sendAmount + maxFee) {
        if (!coinLowestLarger) // there is no input larger than nTargetValue
        {
            return false;
        }
        setCoinsRet.push(coinLowestLarger.ki);
        nValueRet += coinLowestLarger.amount;
        return {selectedCoins: setCoinsRet, selectedValueSum: nValueRet, fee: feeNeeded};
    } 
   
    nValueRet = 0;
    var min = vValue.length >= constants.MAX_TX_INPUTS? vValue.length - constants.MAX_TX_INPUTS: 0;
    for (var i = vValue.length - 1; i >= min; i--) {
        nValueRet += vValue[i].amount;
        setCoinsRet.push(vValue[i].ki);
        feeNeeded = utils.ComputeFee(setCoinsRet.length, 2, ringSize);
        if (nValueRet >= feeNeeded + sendAmount) break;
    }
    if (enableDebug == true) {
        console.log("Selecting coins");
        console.log("selectedCoins (Key Images): " + setCoinsRet);
        console.log("selectedValueSum: " + nValueRet / constants.COIN);
        console.log("fee: " + feeNeeded / constants.COIN);
    }
    return {selectedCoins: setCoinsRet, selectedValueSum: nValueRet, fee: feeNeeded};
}

module.exports = {
    selectCoins
};