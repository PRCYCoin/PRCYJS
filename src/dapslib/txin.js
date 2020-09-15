var Script = require("btc-script");
var Parser = require("crypto-binary").MessageParser;
const utils = require("./utils");
var binConv = require("binstring");

function TxIn(data) {
  // if prevout hash is null
  // then this is a coinbase transaction
  // Note: we can never have a null hash, this makes serilization of the transaction impossible
  if (!data) {
    data = {};
  }
  if (!data.prevout) {
    data.prevout = {};
  }

  if (!data.prevout.hash) {
    data.prevout.hash = [...Buffer.alloc(32)];
    data.prevout.n = -1;
  }

  this.prevout = data.prevout;
  utils.validateArrayType(this.prevout.hash, 'Txin');

  if (data.script instanceof Script) {
    this.script = data.script;
  } else {
    if (data.scriptSig) {
      this.script = Script.fromScriptSig(data.scriptSig);
    } else {
      this.script = new Script(data.script);
    }
  }
  
  this.s = data.s ? [...data.s] : [];
  utils.validateArrayType(this.s, 'TxIn.s', true);

  this.R = data.R ? [...data.R] : [];
  utils.validateArrayType(this.R, 'TxIn.R', true);

  this.encryptionKey = data.encryptionKey ? [...data.encryptionKey] : [];
  utils.validateArrayType(this.encryptionKey, 'TxIn.encryptionKey', true);

  this.keyImage = data.keyImage ? [...data.keyImage] : [];
  utils.validateArrayType(this.keyImage, 'Txin.keyImage', true);

  this.decoys = data.decoys ? [...data.decoys] : [];
  utils.validateArrayType(this.decoys, 'Txin.decoys', true);

  this.masternodeStealthAddress = data.masternodeStealthAddress
    ? [...data.masternodeStealthAddress]
    : [];
  utils.validateArrayType(this.masternodeStealthAddress, 'Txin.masternodeStealthAddress', true);
  
  this.sequence = data.sequence ? data.sequence : 4294967295;
}

TxIn.prototype.clone = function() {
  var newTxin = new TxIn({
    prevout: {
      hash: this.prevout.hash,
      index: this.prevout.n,
    },
    script: this.script.clone(),
    s: this.s,
    R: this.R,
    encryptionKey: this.encryptionKey,
    keyImage: this.keyImage,
    decoys: this.decoys,
    masternodeStealthAddress: this.masternodeStealthAddress,
    sequence: this.sequence,
  });
  return newTxin;
};

TxIn.prototype.serialize = function() {
  var buffer = [];
  buffer = buffer.concat(this.prevout.hash);
  buffer = buffer.concat(utils.wordsToBytes([parseInt(this.prevout.n)]).reverse());
  var scriptBytes = this.script.buffer;
  buffer = utils.serializeByteArray(scriptBytes, buffer);
  buffer = buffer.concat(utils.wordsToBytes([parseInt(this.sequence)]).reverse());

  buffer = utils.serializeByteArray(this.encryptionKey, buffer);
  buffer = utils.serializeByteArray(this.keyImage, buffer);

  buffer = buffer.concat(utils.numToVarInt(this.decoys.length));
  for (var i = 0; i < this.decoys.length; i++) {
    var decoy = this.decoys[i];
    buffer = buffer.concat(decoy.hash);
    buffer = buffer.concat(utils.wordsToBytes([parseInt(decoy.n)]).reverse());
  }
  buffer = utils.serializeByteArray(this.masternodeStealthAddress, buffer);
  buffer = utils.serializeByteArray(this.s, buffer);
  buffer = utils.serializeByteArray(this.R, buffer);
  return buffer;
};

TxIn.deserialize = function(parser) {
  var txin = {}
  var txHash = parser.raw(32);
  if (txHash === false) {
    return false;
  }
  txin.prevout = {}
  txin.prevout.hash = binConv(txHash, { out: "bytes" });
  var hashHex = binConv(txin.prevout.hash, { out: "hex" });

  var indexB = parser.raw(4);
  txin.prevout.n = new Parser(indexB).readUInt32LE();
  // 0xFFFFFFFF (4294967295) is -1 when trying to read it as UInt32
  if (txin.prevout.n === 4294967295) {
    txin.prevout.n = -1;
  }

  var isCoinbase =
    hashHex ===
    "0000000000000000000000000000000000000000000000000000000000000000";

  // read script
  var sLenB = utils.readVarRaw(parser);
  var scriptLength = new Parser(sLenB).readVarInt();
  var sB = parser.raw(scriptLength);
  txin.script = new Script(sB.toString("hex"), isCoinbase);

  // read sequence
  var sequenceB = parser.raw(4);
  txin.sequence = new Parser(sequenceB).readUInt32LE();

  // encryptionKey
  var ekLenB = utils.readVarRaw(parser);
  var ekLength = new Parser(ekLenB).readVarInt();
  txin.encryptionKey = parser.raw(ekLength);

  // keyImage
  var kiLenB = utils.readVarRaw(parser);
  var kiLength = new Parser(kiLenB).readVarInt();
  txin.keyImage = parser.raw(kiLength);

  // decoys
  var decoyLenB = utils.readVarRaw(parser);
  var decoyLength = new Parser(decoyLenB).readVarInt();
  txin.decoys = [];
  for (var i = 0; i < decoyLength; i++) {
    txHash = parser.raw(32);
    var decoyHash = binConv(txHash, { out: "bytes" });

    var decoyIndexB = parser.raw(4);
    var decoyIndex = new Parser(decoyIndexB).readUInt32LE();
    txin.decoys.push({hash: decoyHash, n: decoyIndex});
  }

  // masternodeStealthAddress
  var mnLenB = utils.readVarRaw(parser);
  var mnLength = new Parser(mnLenB).readVarInt();
  txin.masternodeStealthAddress = parser.raw(mnLength);

  // s
  var ssLenB = utils.readVarRaw(parser);
  var ssLength = new Parser(ssLenB).readVarInt();
  txin.s = parser.raw(ssLength);

  // R
  var RLenB = utils.readVarRaw(parser);
  var RLength = new Parser(RLenB).readVarInt();
  txin.R = parser.raw(RLength);
  return new TxIn(txin);
};

module.exports = TxIn;
