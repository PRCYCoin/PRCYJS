var Script = require("btc-script");
var BigInteger = require("bigi");
var conv = require("binstring");
const utils = require("./utils");
var Parser = require("crypto-binary").MessageParser;

function TxOut(data) {
  if (data.script instanceof Script) {
    this.script = data.script;
  } else {
    if (data.scriptPubKey) {
      this.script = Script.fromScriptSig(data.scriptPubKey);
    } else {
      this.script = new Script(data.script);
    }
  }

  if (Array.isArray(data.value)) {
    this.value = data.value;
  } else if ("string" == typeof data.value) {
    var valueHex = new BigInteger(data.value, 10).toString(16);
    while (valueHex.length < 16) valueHex = "0" + valueHex;
    this.value = conv(valueHex, { in: "hex", out: "bytes" }).reverse();
  }
  this.txPriv = data.txPriv ? [...data.txPriv] : [];
  utils.validateArrayType(this.txPriv, 'TxOut.txPriv', true);

  this.txPub = data.txPub ? [...data.txPub] : [];
  utils.validateArrayType(this.txPub, 'TxOut.txPub', true);

  this.encodedAmount = data.encodedAmount
    ? [...data.encodedAmount]
    : Buffer.alloc(32);
  utils.validateArrayType(this.encodedAmount, 'TxOut.encodedAmout', true);

  this.encodedBlind = data.encodedBlind ? [...data.encodedBlind] : Buffer.alloc(32);
  utils.validateArrayType(this.encodedBlind, 'TxOut.encodedBlind', true);

  this.hashOfKey = data.hashOfKey ? [...data.hashOfKey] : [...Buffer.alloc(32)];
  utils.validateArrayType(this.hashOfKey, 'TxOut.hashOfKey', true);

  this.masternodeStealthAddress = data.masternodeStealthAddress
    ? [...data.masternodeStealthAddress]
    : [];
  utils.validateArrayType(this.masternodeStealthAddress, 'TxOut.masternodeStealthAdderss', true);
  this.commitment = data.commitment ? [...data.commitment] : [];
  utils.validateArrayType(this.commitment, 'TxOut.commitment', true);
}

TxOut.prototype.clone = function() {
  var newTxout = new TxOut({
    script: this.script.clone(),
    value: this.value.slice(0),
    txPriv: this.txPriv,
    txPub: this.txPub,
    encodedAmount: this.encodedAmount,
    encodedBlind: this.encodedBlind,
    hashOfKey: this.hashOfKey,
    masternodeStealthAddress: this.masternodeStealthAddress,
    commitment: this.commitment,
  });
  return newTxout;
};

TxOut.prototype.serialize = function() {
  var buffer = [];
  buffer = buffer.concat(this.value);
  var scriptBytes = this.script.buffer;
  buffer = utils.serializeByteArray(scriptBytes, buffer);
  buffer = utils.serializeByteArray(this.txPriv, buffer);
  buffer = utils.serializeByteArray(this.txPub, buffer);
  buffer = utils.serializeFixedByteArray(this.encodedAmount, buffer);
  buffer = utils.serializeFixedByteArray(this.encodedBlind, buffer);
  buffer = utils.serializeFixedByteArray(this.hashOfKey, buffer);
  buffer = utils.serializeByteArray(this.masternodeStealthAddress, buffer);
  buffer = utils.serializeByteArray(this.commitment, buffer);
  return buffer;
};

TxOut.deserialize = function(parser) {
  var val = parser.raw(8);
  if (val === false) {
    return false;
  }
  var txout = {};
  txout.value = conv(val, {out: "bytes"});

  var sLenB = utils.readVarRaw(parser);
  var scriptLength = new Parser(sLenB).readVarInt();

  var sB = parser.raw(scriptLength);
  txout.script = new Script(sB.toString("hex"));

  var lenB = utils.readVarRaw(parser);
  var len = new Parser(lenB).readVarInt();
  txout.txPriv = parser.raw(len);

  lenB = utils.readVarRaw(parser);
  len = new Parser(lenB).readVarInt();
  txout.txPub = parser.raw(len);

  txout.encodedAmount = parser.raw(32);

  txout.encodedBlind = parser.raw(32);

  txout.hashOfKey = parser.raw(32);

  lenB = utils.readVarRaw(parser);
  len = new Parser(lenB).readVarInt();
  txout.masternodeStealthAddress = parser.raw(len);

  lenB = utils.readVarRaw(parser);
  len = new Parser(lenB).readVarInt();
  txout.commitment = parser.raw(len);
  return new TxOut(txout);
};

module.exports = TxOut;

