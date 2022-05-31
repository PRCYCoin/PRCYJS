const RingCT = require("./ringct");
const Bulletproofs = require("./bulletproofs");
const config = require("./config");
const request = require("request");
const SimpleCoinSelect = require("../coinselection/simple");
const utils = require('./utils')

// Create a Privacy Transaction using parameters in the format below.
// ins: [{hash, n, amount, blind, commitment}] : (hash, blind, commitment) => byte arrays, amount: string
// outs: [{address, amount}], amount is in string
// decoysDetails: [{hash, n, pubkey, commitment}]: (hash, pubkey, commitment) => byte arrays, amount: string
// privateKeys: [private keys corresponding to inputs being spent]
// ringSize: 27-32
// all commitments are in pubkey format (starts with 02 or 03)
function CreatePRCYPrivacyTransaction(
  apiServer,
  ins,
  outs,
  decoysDetails,
  privateKeys,
  ringSize,
  cb
) {
  var partialTx = RingCT.CreateRingCTTransaction(
    ins,
    outs,
    decoysDetails,
    privateKeys,
    ringSize
  );
  if (!partialTx.tx) {
    cb(partialTx);
    return;
  }

  var blinds = partialTx.blinds;
  var outAmounts = outs.map((e) => e.amount + "");
  var tx = partialTx.tx;
  var blindsHex = blinds.map((e) => Buffer.from(e).toString("hex"));
  Bulletproofs.CreateRangeBulletProof(apiServer, blindsHex, outAmounts, function(bp) {
    tx.bulletproofs = [...Buffer.from(bp, "hex")];
    cb(tx);
  });
}

// Send the provided raw transaction hex over the apiTXServer
function SendRawTransaction(apiTXServer, hex, cb) {
  var options = {
    url: `${apiTXServer}/api/broadcasttx`,
    method:"POST",
    body: JSON.stringify({rawtx: hex}),
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  };
  request(options, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      var parsed = JSON.parse(body);
      cb(parsed);
    } else {
        cb(false);
    }
  });
}

// Get decoys from the API server
function GetDecoys(apiServer, howmany, cb) {
  var options = {
    url: `${apiServer}/api/decoys/${howmany}`,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  };
  request(options, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      var parsed = JSON.parse(body);
      cb(parsed.decoys);
    }
  });
}

// Create a Full Transaction providing: All Unspent UTXOs, a recipent Stealth Address, amount and change address
function CreateFullTransaction(
  apiServer,
  allUnspents,
  recipient,
  amount,
  changeAddress, 
  cb
) {
  // create coinmap
  var coinMap = {};
  for (const ki of Object.keys(allUnspents)) {
    coinMap[ki] = allUnspents[ki].amount.amount;
  }
  var ringSize = Math.floor(Math.random() * 5) + 28;
  console.log("Creating Transaction");
  console.log("Using Ring Size: " + ringSize);
  var selection = SimpleCoinSelect.selectCoins(coinMap, amount, ringSize, 2);
  // create ins
  var ins = [];
  var outs = [];
  var privateKeys = [];

  if (selection){
    txFee = selection.fee;
    for (const ki of selection.selectedCoins) {
      var oneTimePk = allUnspents[ki].oneTimePk;
      privateKeys.push(oneTimePk);

      var input = {
        hash: Buffer.from(allUnspents[ki].txid, "hex").reverse(),
        n: allUnspents[ki].utxo.n,
        blind: allUnspents[ki].amount.blind,
        amount: allUnspents[ki].amount.amount + "",
      };
      ins.push(input);
    }

    var outGoingKeyImages = [...selection.selectedCoins];

    var selectedSum = selection.selectedValueSum;
    var changeAmount = selectedSum - amount - selection.fee;
    outs.push({
      amount: "" + amount,
      address: recipient,
      blind: utils.generateRandom32Bytes()
    });
    if (changeAmount > 0) {
      outs.push({
        amount: "" + changeAmount,
        address: changeAddress,
        blind: utils.generateRandom32Bytes()
      });
    }
    var pendingAmount = changeAmount;
    if (changeAddress == recipient) {
      pendingAmount += amount;
    }

    GetDecoys(apiServer, 200, function (decoysDetails) {
      CreatePRCYPrivacyTransaction(apiServer, ins, outs, decoysDetails, privateKeys, ringSize, function (tx) {
        if (!tx.vin) {
          alert('Error:' + tx);
          return;
        }
        cb(tx, pendingAmount, outGoingKeyImages);
      })
    })
  } else {
    console.log("No coins available for selection. Please try again.");
  }
}

module.exports = {
    CreatePRCYPrivacyTransaction,
    SendRawTransaction,
    CreateFullTransaction,
    GetDecoys
}

