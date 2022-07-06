const bip39 = require("bip39");
const hdkey = require("../hdkey");
const bs58check = require("bs58check");
const secp256k1 = require("secp256k1");
const sha3 = require("js-sha3");
const config = require("./config");
const utils = require("./utils");
const request = require("request");
const constants = require('../prcylib/constants');

const promisify = (fn) => {
  return (...args) => {
    return new Promise((resolve, reject) => {
      fn(...args, function (err, res) {
        if (err) {
          return reject(err);
        }
        return resolve(res);
      });
    });
  };
};

const requestPromise = promisify(request);
const prcyindex = require("./index");

var coinType = "0";
var viewPath = "m/44'/" + coinType + "'/0'/0/0";
var spendPath = "m/44'/" + coinType + "'/0'/0/0";
var apiTXServer = config.PRCY_TX_SERVER;
var filterspents = false;
var currentStatus = "Idle";
var currentStatusVal = 1;
// Current mnemonics for the current session
var mnemonics;
// Current seed for the current session (prcycoin or Bitcoin)
var seed;
// Last payment received
var lastPayment;
// Last reward received
var lastReward;
// Last reward type received
var lastRewardType;
// Total number of Masternode rewards earned
var rewardMNCount = 0;
// Last Masternode reward earned (amount)
var lastMNReward;
// Total number of Staking rewards earned
var rewardStakeCount = 0;
// Last Staking reward earned (amount)
var lastStakeReward;
// Total number of PoA Mined rewards earned
var rewardPoACount = 0;
// Last PoA Mined reward earned (amount)
var lastPoAReward;
// Total number of rewards earned
var rewardCount = 0;
// Total rewards earned in PRCY
var rewardTotal = 0;
// Transaction Fee
var txFee = 0;

// Debug variables
var enableDebug = config.ENABLE_DEBUG;
var enableRewardsCounter = config.ENABLE_REWARDS_COUNTER;
var startDate;
var endDate;
var scanTime;

// Get the current job status
Wallet.prototype.currentStatus = function () {
  console.log(currentStatus);
  return currentStatus;
}

// Get the current job status value
Wallet.prototype.currentStatusValue = function () {
  console.log(currentStatusVal);
  return currentStatusVal;
}

// Get the current 24 word Mnemonic Recovery Phrase
Wallet.prototype.getMnemonics = function () {
  return mnemonics;
}

// Get the current seed used: prcycoin or Bitcoin
Wallet.prototype.getSeed = function () {
  return seed;
}

// Get the current View Path
Wallet.prototype.getViewPath = function () {
  return viewPath;
}

// Get the current Spend Path
Wallet.prototype.getSpendPath = function () {
  return spendPath;
}

// Set the current View Path
Wallet.prototype.setViewPath = function (passedViewPath) {
  viewPath = passedViewPath;
  return viewPath;
}

// Set the current Spend Path
Wallet.prototype.setSpendPath = function (passedSpendPath) {
  spendPath = passedSpendPath;
  return spendPath;
}

// Get last payment received in PRCY
Wallet.prototype.lastPayment = function () {
  return lastPayment / constants.COIN;
}

// Get last reward received in PRCY (includes Masternode, Mined, Minted)
Wallet.prototype.lastReward = function () {
  return lastReward / constants.COIN;
}

// Get last reward type received (between Masternode, Mined, Minted)
Wallet.prototype.lastRewardType = function () {
  return lastRewardType;
}

// Get last Masternode reward received in PRCY
Wallet.prototype.lastMNReward = function () {
  return lastMNReward / constants.COIN;
}

// Get last Stake (Minted) reward received in PRCY
Wallet.prototype.lastStakeReward = function () {
  return lastStakeReward / constants.COIN;
}

// Get last PoA Mined reward received in PRCY
Wallet.prototype.lastPoAReward = function () {
  return lastPoAReward / constants.COIN;
}

// Get the total count of Masternode rewards received
Wallet.prototype.rewardMNCount = function () {
  return rewardMNCount;
}

// Get the total count of Stake (Minted) rewards received
Wallet.prototype.rewardStakeCount = function () {
  return rewardStakeCount;
}

// Get the total count of PoA Mined rewards received
Wallet.prototype.rewardPoACount = function () {
  return rewardPoACount;
}

// Get the total count of rewards received (includes Masternode, Mined, Minted)
Wallet.prototype.rewardCount = function () {
  return rewardCount;
}

// Get total rewards received in PRCY (includes Masternode, Mined, Minted)
Wallet.prototype.rewardTotal = function () {
  return rewardTotal / constants.COIN;
}

// Get the Estimated Transaction Fee in PRCY - 0.26 default like QT wallet if the value has not changed from 0
Wallet.prototype.estimatedFee = function () {
  if (txFee == 0) {
    // Use estimated constants.BASE_FEE
    txFee = constants.TX_FEE;
  }
  return txFee;
}

// Generate a new 24 word Mnemonic Recovery Phrase using bip39
Wallet.prototype.generateMnemonic = function generateMnemonic() {
  var mnemonics = bip39.generateMnemonic(256);
  return mnemonics;
}

// Generate Extended View Key from Mnemonics and master seed (prcycoin or Bitcoin)
function generateViewExtendedKey(mnemonics, masterseed) {
  var seed = bip39.mnemonicToSeedSync(mnemonics);
  var hd = hdkey.fromMasterSeed(seed);
  hd.setMasterSeed(masterseed);
  hd = hdkey.fromMasterSeed(seed);
  var childkey = hd.derive(viewPath);
  return childkey;
}

// Generate Extended Spend Key from Mnemonics and master seed (prcycoin or Bitcoin)
function generateSpendExtendedKey(mnemonics, masterseed) {
  var seed = bip39.mnemonicToSeedSync(mnemonics);
  var hd = hdkey.fromMasterSeed(seed);
  hd.setMasterSeed(masterseed);
  hd = hdkey.fromMasterSeed(seed);
  var childkey = hd.derive(spendPath);
  return childkey;
}

// Converts key to private spend key and private view key
function toBTCSecret(key) {
  var btcsecret = Buffer.concat([Buffer.from([28]), key, Buffer.from([1])]);
  return bs58check.encode(btcsecret);
}

// Check if coin type is from Audit or Masternode/Staking
function isSpecialCoin(type) {
  type = type.trim();
  return type == "coinbase" || type == "coinaudit" || type == "coinstake";
}

// Update Block count and recompute balance
Wallet.prototype.updateBlockcount = function () {
  var options = {
    url: `${this.apiServer}/api/blockcount`,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  };
  var wl = this;
  request(options, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var parsed = JSON.parse(body);
      wl.currentBlockHeight = parsed;
      wl.recomputeBalance();
      setTimeout(function () {
        wl.updateBlockcount();
      }, 60000);
    }
  });
};

function Wallet(input, apiServer, network, masterseed) {
  if (!input.mnemonics && !(input.viewkey && input.spendkey)) {
    throw "Input must be either mnemonics or view/spend key pair";
  }

  mnemonics = input.mnemonics.trim();
  if (!bip39.validateMnemonic(mnemonics)) {
    throw "Invalid mnemonics";
  }

  var net = network ? network : config.PRCYCHAIN;
  seed = masterseed ? masterseed : constants.SEED;

  coinType = net == "testnet" ? "1" : constants.CoinType;

  this.apiServer = apiServer ? apiServer : config.PRCY_SERVER;

  if (seed == constants.SEED) {
    this.setViewPath("m/44'/" + coinType + "'/0'/0/0");
    this.setSpendPath("m/44'/" + coinType + "'/1'/0/0");
    // Generate private view and spend key
    this.extendedViewKey = generateViewExtendedKey(mnemonics, seed);
    this.extendedSpendKey = generateSpendExtendedKey(mnemonics, seed);
    this.viewKey = toBTCSecret(this.extendedViewKey.privateKey);
    this.spendKey = toBTCSecret(this.extendedSpendKey.privateKey);
    this.pubSpend = Buffer.from(this.extendedSpendKey.publicKey)
      .reverse()
      .toString("hex");
    this.address = utils.generatePrivacyAddress(
      this.extendedViewKey.publicKey,
      this.extendedSpendKey.publicKey
    );
    this.viewPubKey = this.extendedViewKey.publicKey;
    this.spendPubKey = this.extendedSpendKey.publicKey;
    this.viewPrivKey = this.extendedViewKey.privateKey;
  } else if (seed == "Bitcoin seed") {
    this.setViewPath("m/44'/" + coinType + "'/0'/0/0");
    this.setSpendPath("m/44'/" + coinType + "'/0'/0/0");
    // Generate private view and spend key
    this.extendedViewKey = generateViewExtendedKey(mnemonics, seed);
    this.extendedSpendKey = generateSpendExtendedKey(mnemonics, seed);
    if (secp256k1.privateKeyVerify(this.extendedSpendKey.privateKey)) {
      this.spendPubKey = secp256k1.publicKeyCreate(this.extendedSpendKey.privateKey);
    }
    this.viewPrivKey = Buffer.from(sha3.keccak_256(this.extendedSpendKey.privateKey), "hex");
    if (secp256k1.privateKeyVerify(this.viewPrivKey)) {
      this.viewPubKey = secp256k1.publicKeyCreate(this.viewPrivKey);
    }
    this.address = utils.generatePrivacyAddress(
      this.viewPubKey,
      this.spendPubKey
    );
  } else {
    console.log("Incorrect masterseed used - must be " + constants.SEED + " or Bitcoin seed");
  }

  this.utxoDetails = {};
  this.unspentKeyImages = {};
  this.txKeyImageMap = {};
  this.scannedHeight = 0;
  this.pendingBalance = {};
  this.transactionHistory = {};
  this.isScanning = false;
  this.currentBlockHeight = 0;
  this.updateBlockcount();
  this.getViewPath();
  this.getSpendPath();
}

// Create a Raw Transaction to a destination Stealth Address for n amount
Wallet.prototype.createRawTransaction = function (destination, amount, cb) {
  // Check for Spendable amount with a bit of padding for fees
  if (this.spendable <= parseInt((parseFloat(amount) + 0.1) * constants.COIN)) {
    throw "Insufficient funds! Please include 0.1 PRCY for fee.";
  }

  var allUnspentUTXOs = {};
  for (const ki of Object.keys(this.unspentKeyImages)) {
    if (
      !(
        isSpecialCoin(this.utxoDetails[ki].txtype) &&
        this.utxoDetails[ki].blockheight + constants.CONFIRMATIONS >
        this.currentBlockHeight
      )
    ) {
      if (!this.utxoDetails[ki].isOutgoing) {
        allUnspentUTXOs[ki] = this.utxoDetails[ki];
        allUnspentUTXOs[ki].oneTimePk = utils.computePrivateKeyFromTxPub(
          this.viewPrivKey,
          this.extendedSpendKey.privateKey,
          allUnspentUTXOs[ki].utxo.txpubkey
        );
      }
    }
  }
  prcyindex.CreateFullTransaction(
    this.apiServer,
    allUnspentUTXOs,
    destination,
    constants.COIN * amount,
    this.address,
    function (tx, changeAmount, outgoingKeyImages) {
      // Broadcasting tx
      cb(tx, changeAmount, outgoingKeyImages);
    }
  );
};

// Broadcast the created transaction to the network
Wallet.prototype.broadcastTransaction = function (tx, cb) {
  prcyindex.SendRawTransaction(
    apiTXServer,
    Buffer.from(tx.serialize()).toString("hex"),
    function (ret) {
      cb(ret);
      if (enableDebug == true) {
        console.log("Broadcasting TX using: " + apiTXServer);
      }
    }
  );
};

// Send n amount to destination Stealth Address
Wallet.prototype.sendTo = function (destination, amount, cb) {
  var wl = this;
  var isSelfPayment = destination == this.address;
  this.createRawTransaction(destination, amount, function (
    tx,
    changeAmount,
    outgoingKeyImages
  ) {
    wl.broadcastTransaction(tx, function (ret) {
      if (ret.result) {
        // Update pending balance
        var pendingState = {};
        pendingState.outgoings = outgoingKeyImages;
        if (changeAmount > 0) {
          pendingState.amount = changeAmount;
          pendingState.txid = tx.getTxId().reverse().toString("hex");
        }
        wl.updatePendingState(pendingState);

        var historyItem = {
          type: isSelfPayment ? "Self Payment" : "Sent",
          amount: constants.COIN * amount,
          timestamp: Math.floor(Date.now() / 1000),
          txid: Buffer.from(tx.getTxId()).reverse().toString("hex"),
          confirmed: false,
        };
        wl.transactionHistory[historyItem.txid] = historyItem;
        cb({ success: true, txid: historyItem.txid });
        if (enableDebug == true) {
          console.log("TXID: " + historyItem.txid);
          console.log("Explorer Link: https://explorer.prcycoin.com/tx/" + historyItem.txid);
        }
      } else {
        cb({ success: false, reason: ret.reason });
        if (enableDebug == true) {
          console.log("Error: " + ret.reason);
        }
      }
    });
  });
};

// Update the pending balance state
Wallet.prototype.updatePendingState = function (pendingState) {
  for (const element of pendingState.outgoings) {
    this.utxoDetails[element].isOutgoing = true;
  }
  if (pendingState.txid) {
    this.pendingBalance[pendingState.txid] = pendingState.amount;
  }
};

// Recompute the balance of the wallet
Wallet.prototype.recomputeBalance = function () {
  var spendable = 0;
  var immature = 0;
  for (const ki of Object.keys(this.unspentKeyImages)) {
    // Don't count utxos being spent as spendable balance
    if (this.utxoDetails[ki].isOutgoing) {
      continue;
    }
    if (
      !(
        isSpecialCoin(this.utxoDetails[ki].txtype) &&
        this.utxoDetails[ki].blockheight + constants.CONFIRMATIONS >
        this.currentBlockHeight
      )
    ) {
      spendable += parseInt(this.utxoDetails[ki].amount.amount);
    } else {
      immature += parseInt(this.utxoDetails[ki].amount.amount);
    }
  }
  this.spendable = spendable;
  this.immature = immature;
  var pending = 0;
  for (const txid of Object.keys(this.pendingBalance)) {
    pending += this.pendingBalance[txid];
  }
  this.pending = pending;
};

// Scan wallet for all related transactions for the connected wallet
Wallet.prototype.scanWalletTransactions = async function (cb) {
  if (this.isScanning) return;
  this.isScanning = true;
  if (enableDebug == true && startDate == undefined) {
    startDate = new Date();
    console.log("Scanning started at: " + startDate);
  }

  // Getting server encryption key
  if (!this.server_encryption_key) {
    var options = {
      url: `${this.apiServer}/api/getencryptionkey`,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    };
    var response = await requestPromise(options);
    this.server_encryption_key = JSON.parse(response.body);
  }

  var encrypted = utils.encryptKeys(
    Buffer.from(this.server_encryption_key, 'hex').reverse(),
    this.viewPrivKey,
    this.spendPubKey,
  );
  var bodyObj = {
    method: "scan",
    encrypted: true,
    encryptedviewkey: Buffer.from(encrypted.encryptedViewKey).toString('hex'),
    encryptedspendpub: Buffer.from(encrypted.encryptedSpendPub).reverse().toString('hex'),
    r: Buffer.from(encrypted.R).reverse().toString('hex'),
    sinceblock: this.scannedHeight,
    filterspents: filterspents,
  };
  var options = {
    url: `${this.apiServer}/wallet`,
    method: "POST",
    body: JSON.stringify(bodyObj),
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  };
  var wl = this;
  requestFromServer(options, function (parsed) {
    currentStatus = "Currently scanning the chain for your transactions. If this is the first time you are using this wallet, it may take up to 20 minutes to complete";
    currentStatusVal = 2;
    if (parsed.scanning) {
      setTimeout(() => {
        wl.currentStatus();
        wl.isScanning = false;
        wl.scanWalletTransactions(cb);
      }, 15000);
    } else {
      if (enableDebug == true && endDate == undefined) {
        endDate = new Date();
        var seconds = (endDate.getTime() - startDate.getTime()) / 1000;
        console.log("Scanning finished at: " + endDate);
        console.log("Scan completed in " + seconds + " seconds");
        scanTime = seconds;
      }
      wl.computeWalletState(
        parsed.utxos,
        parsed.txes,
        parsed.scannedheight,
        cb
      );
    }
  });
};

Wallet.prototype.computeWalletState = async function (
  utxos,
  txes,
  scannedHeight,
  cb
) {
  if (enableDebug == true) {
    startDate = new Date();
    console.log("Processing UTXOs started at: " + startDate);
  } else {
    currentStatus = "Processing UTXOs. If you have a lot of UTXOs this may take some time to complete.";
    currentStatusVal = 3;
    this.currentStatus();
  }
  var allUTXOData = utxos.map(function (utxo) {
    var splits = utxo.split("-");
    return {
      txid: splits[0],
      utxo: txes[splits[0]].vout[parseInt(splits[1])],
      txtype: txes[splits[0]].type,
      blockheight: txes[splits[0]].blockindex,
    };
  });
  var walletDetails = utils.computeUTXODetails(
    this.viewPrivKey,
    this.extendedSpendKey.privateKey,
    allUTXOData
  );
  for (const ki of Object.keys(walletDetails.utxoDetails)) {
    this.utxoDetails[ki] = walletDetails.utxoDetails[ki];
  }

  this.setUnspentKeyImages(walletDetails.keyImageList);

  var keyimagesList = walletDetails.keyImageList;
  var unspents = Object.keys(this.unspentKeyImages);
  keyimagesList = keyimagesList.concat([...unspents]);
  var keyimages = [];
  var spentsKeyImages = [];
  for (const ki of keyimagesList) {
    var found = false;
    // Check if ki in one of the transaction
    for (const tx of Object.values(txes)) {
      for (const input of tx.vin) {
        if (input.keyimage == ki) {
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      keyimages.push(ki);
    } else {
      spentsKeyImages.push(ki);
    }
  }
  this.setSpentKeyImages(spentsKeyImages);

  const numKeyImagesPerReq = 30;
  var times = Math.floor(keyimages.length / numKeyImagesPerReq) + 1;
  for (var i = 0; i < times; i++) {
    var start = i * numKeyImagesPerReq;
    var end =
      (i + 1) * numKeyImagesPerReq > keyimages.length
        ? keyimages.length
        : (i + 1) * numKeyImagesPerReq;
    if (start == end) continue;
    var slice = keyimages.slice(start, end).reduce(function (total, current) {
      return total + "-" + current;
    }, "");
    slice = slice.substring(1);
    if (slice.length == 0) continue;
    await checkKeyImagesSpent(this, slice);
  }

  if (enableDebug == true) {
    endDate = new Date();
    var seconds = (endDate.getTime() - startDate.getTime()) / 1000;
    console.log("Processing UTXOs finished at: " + endDate);
    console.log("Processing UTXOs completed in " + seconds + " seconds");
    var processUTXOTime = seconds;
  }

  // Generate Tansaction History
  if (enableDebug == true) {
    startDate = new Date();
    console.log("Generating transaction history started at: " + startDate);
  } else {
    currentStatus = "Generating transaction history.";
    currentStatusVal = 4;
    this.currentStatus();
  }
  for (const tx of Object.values(txes)) {
    // Check if this is transaction from me
    var isFromMe = true;
    for (const input of tx.vin) {
      if (
        !this.utxoDetails[input.keyimage] &&
        !this.utxoDetails[input.keyimage]
      ) {
        isFromMe = false;
        break;
      }
    }

    var credit = 0;
    var debit = 0;

    for (const input of tx.vin) {
      if (this.utxoDetails[input.keyimage]) {
        debit += this.utxoDetails[input.keyimage].amount.amount;
      }
    }

    var utxoAmountMap = {};
    var firstOut = 0;
    for (const out of tx.vout) {
      var utxostr = `${tx.txid}-${out.n}`;
      if (utxos.includes(utxostr)) {
        for (const utxoDetail of Object.values(walletDetails.utxoDetails)) {
          if (utxoDetail.txid == tx.txid && utxoDetail.utxo.n == out.n) {
            utxoAmountMap[out.n] = utxoDetail.amount.amount;
            credit += utxoDetail.amount.amount;
            if (firstOut == 0) {
              firstOut = utxoDetail.amount.amount;
            }
            break;
          }
        }
      }
    }

    var TxAmount = 0;
    var txKind = "Received";
    if (tx.type == "coinaudit") {
      txKind = "Mined";
      TxAmount = credit;
    } else if (tx.type == "coinbase") {
      txKind = "Mined";
      TxAmount = credit;
    } else if (tx.type == "coinstake") {
      if (isFromMe) {
        txKind = "Minted";
      } else {
        txKind = "Masternode";
      }
      TxAmount = credit - debit;
    } else if (tx.type == "standard") {
      if (isFromMe) {
        if (debit == credit + parseInt(tx.txfee * constants.COIN)) {
          TxAmount = firstOut;
          if (TxAmount == constants.COLLATERAL || debit == constants.COLLATERAL || credit == constants.COLLATERAL) {
            // send to self for masternode
            txKind = "Collateral";
          } else {
            // send to self
            txKind = "Self Payment";
          }
        } else {
          txKind = "Sent";
          TxAmount = debit - credit - parseInt(tx.txfee * constants.COIN);
        }
      } else {
        txKind = "Received";
        TxAmount = credit;
      }
    }
    if (TxAmount > 0) {
      var historyItem = {
        type: txKind,
        amount: TxAmount,
        timestamp: tx.blocktime,
        txid: tx.txid,
        confirmed: true,
      };
      if (historyItem.type == "Received") {
        lastPayment = historyItem.amount;
      }
      if ((historyItem.type == "Mined" || historyItem.type == "Minted" || historyItem.type == "Masternode") && historyItem.amount < "1200000000000") {
          rewardCount = rewardCount + 1;
          rewardTotal = rewardTotal + historyItem.amount;
          lastReward = historyItem.amount;
          lastRewardType = historyItem.type;
      }
      if (historyItem.type == "Masternode" && historyItem.amount < "600000000000") {
        lastMNReward = historyItem.amount;
        rewardMNCount = rewardMNCount + 1;
      }
      if (historyItem.type == "Minted" && historyItem.amount < "600000000000") {
        lastStakeReward = historyItem.amount;
        rewardStakeCount = rewardStakeCount + 1;
      }
      if (historyItem.type == "Mined" && historyItem.amount < "600000000000") {
        lastPoAReward = historyItem.amount;
        rewardPoACount = rewardPoACount + 1;
      }
      this.transactionHistory[tx.txid] = historyItem;
    }
  }
  if (enableRewardsCounter == true) {
    console.log("Your last received payment was: " + lastPayment / constants.COIN + " PRCY");
    console.log("Your last received reward was: " + lastReward / constants.COIN + " PRCY");
    console.log("Your last received reward type was: " + lastRewardType);
    console.log("Your last received MN reward was: " + lastMNReward / constants.COIN + " PRCY");
    console.log("Your last received Staking reward was: " + lastStakeReward / constants.COIN + " PRCY");
    console.log("Your last received PoA reward was: " + lastPoAReward / constants.COIN + " PRCY");
    console.log("You have received a total of: " + rewardMNCount + " MN rewards");
    console.log("You have received a total of: " + rewardStakeCount + " Staking rewards");
    console.log("You have received a total of: " + rewardPoACount + " PoA Mining rewards");
    console.log("You have received a total of: " + rewardCount + " rewards");
    console.log("You have received a total of: " + rewardTotal / constants.COIN + " PRCY from rewards");
  }
  if (enableDebug == true) {
    endDate = new Date();
    seconds = (endDate.getTime() - startDate.getTime()) / 1000;
    console.log("Generating transaction history finished at: " + endDate);
    console.log("Generating transaction history completed in " + seconds + " seconds");
    var genHistoryTime = seconds;
  }

  this.isScanning = false;
  this.scannedHeight = scannedHeight;
  this.currentBlockHeight =
    this.currentBlockHeight <= this.scannedHeight
      ? this.scannedHeight
      : this.currentBlockHeight;
  currentStatus = "Recomputing your wallet balance";
  currentStatusVal = 5;
  this.currentStatus();
  this.recomputeBalance();
  cb();
  if (enableDebug == true) {
    var endDate = new Date();
    var totalTime = scanTime + processUTXOTime + genHistoryTime;
    console.log("Completed at: " + endDate);
    console.log("Completed in " + (totalTime / 60).toFixed(2) + " minutes (" + totalTime.toFixed(2) + " seconds)");
  }
  currentStatus = "Complete";
  currentStatusVal = 6;
  this.currentStatus();
};

Wallet.prototype.setUnspentKeyImages = function (unspents) {
  for (const element of unspents) {
    this.unspentKeyImages[element] = true;
    if (this.utxoDetails[element]) {
      delete this.pendingBalance[this.utxoDetails[element].txid];
    }
  }
};

Wallet.prototype.setSpentKeyImages = function (spents) {
  for (const element of spents) {
    delete this.unspentKeyImages[element];
    this.utxoDetails[element].isOutgoing = false;
  }
};

function updateKeyImageSpent(wl, parsed) {
  var unspents = parsed.unspents;
  var spents = parsed.spents;
  wl.setSpentKeyImages(spents);
  wl.setUnspentKeyImages(unspents);
}

async function checkKeyImagesSpent(wl, keyImageList) {
  var options = {
    url: `${wl.apiServer}/api/keyimages/${keyImageList}`,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  };
  var response = await requestPromise(options);
  var parsed = JSON.parse(response.body);
  updateKeyImageSpent(wl, parsed);
}

function requestFromServer(options, cb) {
  request(options, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var parsed = JSON.parse(body);
      cb(parsed);
    } else {
      console.log("error:", options);
    }
  });
}

// Mark spent UTXOs on the API Server
Wallet.prototype.markSpents = function (viewkey, spendpub, spents) {
  var bodyObj = {
    method: "markspents",
    viewkey: viewkey,
    spendpub: spendpub,
    spents: spents,
  };
  var options = {
    url: `${this.apiServer}/wallet`,
    method: "POST",
    body: JSON.stringify(bodyObj),
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  };
  requestFromServer(options, function (parsed) {
    if (parsed.success) {
      console.log(parsed);
    } else {
      console.log('error:', parsed);
    }
  });
};

module.exports = Wallet;
