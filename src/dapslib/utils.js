const bcrypto = require("../crypto");
const bs58 = require("bs58");
const conv = require("binstring");
const secp256k1 = require("secp256k1");
const Constants = require('./constants');
const BigInteger = require('bigi');
const EC = require("elliptic").ec;
const ec = new EC("secp256k1");
const ecparams = ec.curve;
const BN = ecparams.n.constructor;

function numToBytes(num, bytes) {
  if (bytes === undefined) bytes = 8;
  if (bytes == 0) return [];
  else return [num % 256].concat(numToBytes(Math.floor(num / 256), bytes - 1));
}

function numToVarInt(num) {
  if (num < 253) return [num];
  else if (num < 65536) return [253].concat([...numToBytes(num, 2)]);
  else if (num < 4294967296) return [254].concat([...numToBytes(num, 4)]);
  else return [253].concat([...numToBytes(num, 8)]);
}

// TODO(shtylman) crypto sha uses this also
// Convert a byte array to big-endian 32-bit words
function bytesToWords(bytes) {
  for (var words = [], i = 0, b = 0; i < bytes.length; i++, b += 8)
    words[b >>> 5] |= bytes[i] << (24 - (b % 32));
  return words;
}

// Convert big-endian 32-bit words to a byte array
function wordsToBytes(words) {
  for (var bytes = [], b = 0; b < words.length * 32; b += 8)
    bytes.push((words[b >>> 5] >>> (24 - (b % 32))) & 0xff);
  return bytes;
}


function serializeByteArray(bs, buffer) {
  var ret = buffer.concat([...numToVarInt(bs.length)]);
  ret = ret.concat([...bs]);
  return ret;
}

function serializeFixedByteArray(bs, buffer) {
  return buffer.concat([...bs]);
}

function readVarRaw(parser) {
  if (parser.hasFailed || parser.pointerCheck() === false) return false;
  var flagRaw = parser.raw(1);
  if (flagRaw) {
    var flag = flagRaw.readUInt8(0);
  } else {
    return false;
  }

  if (flag < 0xfd) {
    return flagRaw;
  } else if (flag == 0xfd) {
    return Buffer.concat([flagRaw, parser.raw(2)]);
  } else if (flag == 0xfe) {
    return Buffer.concat([flagRaw, parser.raw(4)]);
  } else {
    return Buffer.concat([flagRaw, parser.raw(8)]);
  }
}

function paddTo11Char(str) {
  var ret = str;
  while (ret.length < 11) {
    ret = `1${ret}`;
  }
  return ret;
}

// Genereate a Stealth Address from the view and spend key
function generatePrivacyAddress(view, spend) {
  var addressBuff = Buffer.concat([
    Buffer.from([18]),
    Buffer.from(spend),
    Buffer.from(view),
  ]);
  var h = bcrypto.hash256(addressBuff);
  addressBuff = Buffer.concat([Buffer.from(addressBuff), h.slice(0, 4)]);
  var address = "";
  for (var i = 0; i < 9; i++) {
    var end = (i + 1) * 8 > 71 ? 71 : (i + 1) * 8;
    address =
      address + paddTo11Char(bs58.encode(addressBuff.slice(i * 8, end)));
  }
  return address;
}

function decodeWithRemovePadding(encoded, expectedLength) {
  var encodedBlock = encoded;
  var decoded = bs58.decode(encodedBlock);
  while (decoded.length != expectedLength) {
    if (encodedBlock[0] != "1") {
      return false;
    }
    encodedBlock = encodedBlock.substring(1);
    decoded = bs58.decode(encodedBlock);
  }
  return decoded;
}

// Decode a Stealth Address to retrieve it's public view key and public spend key and oayment ID (if integrated address)
function decodePrivacyAddress(address) {
  var pubview = [];
  var pubspend = [];
  if (address.length != 99 && address.length != 110) {
    return false;
  }

  var numBlocksOf8 = Math.floor(address.length / 11);
  var decodedBytes = [];

  for (var i = 0; i < numBlocksOf8; i++) {
    var decoded = decodeWithRemovePadding(
      address.substring(i * 11, (i + 1) * 11),
      i == numBlocksOf8 - 1 ? 7 : 8
    );
    if (!decoded) return false;
    decodedBytes = decodedBytes.concat([...decoded]);
  }

  // verify check sum
  var rawData = decodedBytes.slice(0, decodedBytes.length - 4);
  var hash = bcrypto.hash256(Buffer.from(rawData));
  if (Buffer.from(decodedBytes.slice(decodedBytes.length - 4)).toString('hex') != Buffer.from(hash.slice(0, 4)).toString('hex')) {
    return false;
  }

  pubspend = decodedBytes.slice(1, 34);
  pubview = decodedBytes.slice(34, 67);
  var paymentID = [];
  if (decodedBytes.length == 79) {
    paymentID = decodedBytes.slice(67, 75);
  }

  return { pubview: pubview, pubspend: pubspend, paymentID: paymentID };
}

const genRanHex = (size) =>
  [...Array(size)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join("");

function generateRandom32Bytes() {
  return Buffer.from(genRanHex(64), "hex");
}

// Create commitment using the amount and blind
function createCommitment(amount, blind) {
  var byteArrayAmount = []
  if (Array.isArray(amount)) {
    byteArrayAmount = amount;
  } else if ("string" == typeof amount) {
    var valueHex = new BigInteger(amount, 10).toString(16);
    while (valueHex.length < 16) valueHex = "0" + valueHex;
    byteArrayAmount = conv(valueHex, { in: "hex", out: "bytes" });
  }


  while(byteArrayAmount.length < 32) {
    byteArrayAmount = [0].concat([...byteArrayAmount]);
  }

  if (Buffer.from(blind).toString('hex') == Buffer.alloc(32).toString('hex')) {
    return secp256k1.publicKeyTweakMul(Constants.getH(), Uint8Array.from(byteArrayAmount));
  }
  
  
  // commitment = amount*H + blind*G
  var commitment = secp256k1.publicKeyCombine([
    secp256k1.publicKeyTweakMul(Constants.getH(), Uint8Array.from(byteArrayAmount)),
    secp256k1.publicKeyTweakMul(Constants.getG(), Uint8Array.from(blind))
  ], true);
  return commitment;
}

function computeYFromX(x) {
    let X = new BN(x);
    X = X.toRed(ecparams.red);

    // compute corresponding Y
    let Y2 = X.redSqr()
      .redIMul(X)
      .redIAdd(ecparams.b);
    var Y2Hex = Y2.redSqrt().clone().toString('hex');
    while (Y2Hex.length < 64) {
      Y2Hex = "0" + Y2Hex;
    }
    return Array.from(Buffer.from(Y2Hex, 'hex'));
}

// Convert input to Commitment format
function toCommitmentFormat(input) {
  if (input[0] == 8 || input[0] == 9) return Uint8Array.from(input);
  var x = Uint8Array.from(input.slice(1));
  var firstAssumption = Uint8Array.from([8].concat([...x]));
  var reverted = toPubkeyFormat(firstAssumption);
  if (Buffer.from(reverted).toString('hex') == Buffer.from(input).toString('hex')) {
    return firstAssumption;
  }
  return Uint8Array.from([9].concat([...x]));
}

// Convert input to Pub Key format
function toPubkeyFormat(input) {
  if (input[0] == 2 || input[0] == 3) return Uint8Array.from(input);
  var x = Uint8Array.from(input.slice(1));
  var y = computeYFromX(x);
  var longkey = Uint8Array.from([...Buffer.from([4])].concat([...x]).concat([...y]));
  var ret = secp256k1.publicKeyConvert(longkey, true);
  if (input[0] % 2 == 1) {
    ret[0] = ret[0] == 2? 3:2;
  }
  return ret;
}

function selectRandomIndex(max, excludes) {
  var selected = Math.floor(Math.random() * max);
  while(excludes[selected]) {
    selected = Math.floor(Math.random() * max);
  }
  return selected;
}

// Compute the transaction fee based on the number Number of Inputs, Number of Outputs, and Ring Size
function computeTxFee(numIn, numOut, ringSize) {
  var txinSize = 36 + 4 + 33 + 36 * ringSize;
  var txoutSize = 8 + 35 + 33 + 32 + 32 + 32 + 33;
  var bpSize = numOut == 1 ? 675 : 738;
  var txSize =  4 + numIn * txinSize + numOut * txoutSize + 4 + 1 + 8 + 4 + bpSize + 8 + 32 + (numIn + 1) * (ringSize + 1) * 32 + 33;
  return 100000000 + Math.floor(10000000.0 * (txSize/1000.0));
}

function validateArrayType(input, errorMessage, allowEmpty) {
  var isValid = false;
  if (allowEmpty) {
    isValid = (!input || input.length == 0);
  }
  if (!isValid && !Array.isArray(input)) {
    throw errorMessage + ' must be array typed, actual type ' + typeof input;
  }
}

function toDAPS(amount) {
  return amount/100000000.0;
}
function balanceInDAPS(amount) {
  return toDAPS(amount);
}

// Check if coin type is from Audit or Masternode/Staking
function isSpecialCoin(type) {
  type = type.trim();
  return (type == "coinbase") || (type == "coinaudit") || (type == "coinstake");
}

// Check if a public key is valid
function isPubkeyValid(pub) {
  try {
    var decompressed = secp256k1.publicKeyConvert(Uint8Array.from(pub), false);
    var x = decompressed.slice(1, 33);
    var y = decompressed.slice(33, 65);
    let X = new BN(x);
    let Y = new BN(y);
    if (X.cmp(ecparams.p) >= 0) return false;
    X = X.toRed(ecparams.red);

    // compute corresponding Y
    let yFromX = X.redSqr()
      .redIMul(X)
      .redIAdd(ecparams.b);
    return (
      Y.toRed(ecparams.red)
        .redSqr()
        .toString() == yFromX.toString()
    );
  } catch(e) {
    // do nothing
  }
  return false;
}

// Decode values  providing the encodedAmount and encoded Amount
function decodeValues(ECDH, encodedAmount, encodedBlind) {
  var sharedSec1 = bcrypto.hash256(ECDH);
  var sharedSec2 = bcrypto.hash256(sharedSec1);

  var tempAmount = [...encodedAmount];
  var tmp = [...tempAmount];
  for (var i = 0; i < 8; i++) {
    tempAmount[i] = 0;
  }
  for (i = 0; i < 32; i++) {
    tempAmount[i] = tmp[i % 8] ^ sharedSec2[i];
  }

  var tempBlind = [...encodedBlind];
  for (i = 0; i < 32; i++) {
    tempBlind[i] ^= sharedSec1[i];
  }
  var slice = Buffer.from(tempAmount.slice(0, 8)).reverse();
  const decodedAmount = parseInt(slice.toString("hex"), 16);
  return { amount: parseInt(decodedAmount, 10), blind: tempBlind };
}

// Return the encoded values in format: {encodedAmount, encodedBlind};
function encodeValues(ECDH, amount, blind) {
  var sharedSec1 = bcrypto.hash256(ECDH);
  var sharedSec2 = bcrypto.hash256(sharedSec1);

  var encodedBlind = [...blind];
  for (var i = 0; i < 32; i++) {
    encodedBlind[i] ^= sharedSec1[i];
  }

  var encodedAmount = [];
  var amountHex = new BigInteger(amount, 10).toString(16);
  while (amountHex.length < 16) amountHex = "0" + amountHex;
  var amountPlain = conv(amountHex, { in: "hex", out: "bytes" }).reverse();

  encodedAmount = encodedAmount
    .concat([...amountPlain])
    .concat([...amountPlain])
    .concat([...amountPlain])
    .concat([...amountPlain]);

  var tmp = [...encodedAmount];
  for (i = 0; i < 32; i++) {
    encodedAmount[i] = tmp[i % 8] ^ sharedSec2[i];
  }
  return { encodedAmount: encodedAmount, encodedBlind: encodedBlind };
}

// Decode amount and mask of a utxo using the view key for utxo and it's type (standard/non-standard)
function decodeAmountAndMask(view, utxo, txtype) {
  if (txtype == "standard") {
    var txPubkey = Buffer.from(utxo.txpubkey, "hex");
    txPubkey = txPubkey.reverse();
    var ECDH = secp256k1.publicKeyTweakMul(txPubkey, view, true);

    var tempAmount = Buffer.from(utxo.encoded_amount, "hex").reverse();
    var tempBlind = Buffer.from(utxo.encoded_mask, "hex").reverse();
    
    return decodeValues(ECDH, tempAmount, tempBlind);
  } else {
    return { amount: parseInt(utxo.amount), blind: Buffer.alloc(32, 0) };
  }
}

// Compute Key Images from the provided Private Key
function computeKeyImage(privateKey) {
  var decodedPrivateKey = privateKey;
  var pub = secp256k1.publicKeyCreate(decodedPrivateKey, true);
  var hash = bcrypto.hash256(pub);
  var pubData = [pub[0]].concat([...hash]);
  var newPubKey = [...pubData];
  var ki = [...pubData];

  while (!isPubkeyValid(ki)) {
    hash = bcrypto.hash256(Buffer.from(newPubKey));
    pubData = [newPubKey[0]].concat([...hash]);
    newPubKey = [...pubData];
    ki = [...newPubKey];
  }
  var keyImage = secp256k1.publicKeyTweakMul(
    Uint8Array.from(ki),
    decodedPrivateKey
  );
  return keyImage;
}

// Compute hash point from a pub key 
function computeHashPoint(pub) {
  var hash = bcrypto.hash256(pub);
  var pubData = [pub[0]].concat([...hash]);
  var newPubKey = [...pubData];
  var ki = [...pubData];

  while (!isPubkeyValid(ki)) {
    hash = bcrypto.hash256(Buffer.from(newPubKey));
    pubData = [newPubKey[0]].concat([...hash]);
    newPubKey = [...pubData];
    ki = [...newPubKey];
  }
  return ki;
}

// Compute private key from a view key, spend key and tx pub key
function computePrivateKeyFromTxPub(view, spend, txpub) {
  var txPubkey = Buffer.from(txpub, "hex");
  txPubkey = txPubkey.reverse();
  var ecdh = secp256k1.publicKeyTweakMul(txPubkey, view, true);
  var HS = bcrypto.hash256(ecdh);
  return secp256k1.privateKeyTweakAdd(HS, spend);
}

// Compute private key from a public view key and spend key
function computePrivateKey(view, spend, o) {
  var txPubkey = Buffer.from(o.txpubkey, "hex");
  txPubkey = txPubkey.reverse();
  var ecdh = secp256k1.publicKeyTweakMul(txPubkey, view, true);
  var HS = bcrypto.hash256(ecdh);
  return secp256k1.privateKeyTweakAdd(HS, spend);
}

// Compute details of UTXO(s) from the given view key, spend key, and utxos
function computeUTXODetails(view, spend, utxos) {
  var utxoDetailsMap = {};
  var keyImageList = utxos.map(function(utxo) {
    var pk = computePrivateKey(view, spend, utxo.utxo);
    var ki = computeKeyImage(pk);
    ki = ki.reverse();
    ki = Buffer.from(ki).toString("hex");
    keyImageList = keyImageList + "-" + ki;
    var amount = decodeAmountAndMask(view, utxo.utxo, utxo.txtype);
    var obj = {
      utxo: utxo.utxo,
      txid: utxo.txid,
      keyimage: ki,
      amount: amount,
      txtype: utxo.txtype,
      blockheight: utxo.blockheight,
    };
    utxoDetailsMap[ki] = obj;
    return ki;
  });
  return { utxoDetails: utxoDetailsMap, keyImageList: keyImageList };
}

// Return the view key and spend pub in buffer format
function encryptKeys(encryptPubKey, viewKey, spendPub) {
  var r = generateRandom32Bytes();
  var R = secp256k1.publicKeyCreate(Uint8Array.from(r), true);
  var ecdhPub = secp256k1.publicKeyTweakMul(Uint8Array.from(encryptPubKey), Uint8Array.from(r));
  var ecdhHash = bcrypto.hash256(ecdhPub);
  var encryptedViewKey = secp256k1.privateKeyTweakAdd(Uint8Array.from(viewKey), Uint8Array.from(ecdhHash));
  var spendPubXBytes = spendPub.slice(1);
  var xEncrypted = secp256k1.privateKeyTweakAdd(Uint8Array.from(spendPubXBytes), ecdhHash);
  var encryptedSpendPub = [spendPub[0]].concat([...xEncrypted]);
  return {encryptedViewKey: encryptedViewKey, encryptedSpendPub: encryptedSpendPub, R: R}; 
}

module.exports = {
  decodePrivacyAddress: decodePrivacyAddress,
  generatePrivacyAddress: generatePrivacyAddress,
  genRanHex: genRanHex,
  generateRandom32Bytes: generateRandom32Bytes,
  createCommitment: createCommitment,
  numToVarInt: numToVarInt,
  bytesToWords: bytesToWords,
  wordsToBytes: wordsToBytes,
  numToBytes: numToBytes,
  serializeFixedByteArray: serializeFixedByteArray,
  serializeByteArray: serializeByteArray,
  readVarRaw: readVarRaw,
  selectRandomIndex: selectRandomIndex,
  computeTxFee: computeTxFee,
  validateArrayType: validateArrayType,
  computeYFromX: computeYFromX,
  toPubkeyFormat: toPubkeyFormat,
  toCommitmentFormat: toCommitmentFormat,
  toDAPS: toDAPS,
  balanceInDAPS: balanceInDAPS,
  isSpecialCoin: isSpecialCoin,
  computeKeyImage: computeKeyImage,
  computeUTXODetails: computeUTXODetails,
  computePrivateKey: computePrivateKey,
  computeHashPoint: computeHashPoint,
  decodeAmountAndMask: decodeAmountAndMask,
  encodeValues: encodeValues,
  decodeValues: decodeValues,
  computePrivateKeyFromTxPub:computePrivateKeyFromTxPub,
  encryptKeys: encryptKeys
}
