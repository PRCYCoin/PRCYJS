var BigInteger = require('bigi');
var bcrypto = require('../crypto');
var binConv = require('binstring');
var Parser = require('crypto-binary').MessageParser;
const utils = require("./utils");

const TxIn = require('./txin');
const TxOut = require('./txout');

function Transaction(doc) {
  this.version = doc.version?doc.version:1;
  this.lock_time = doc.lock_time? doc.lock_time:0;
  this.vin = doc.vin? [...doc.vin]:[];
  utils.validateArrayType(this.vin, 'Tx.vin', false);

  this.vout = doc.vout? [...doc.vout]:[];
  utils.validateArrayType(this.vout, 'Tx.vout', false);

  this.hasPaymentID = doc.hasPaymentID? doc.hasPaymentID: false;
  if (this.hasPaymentID) {
    if (Array.isArray(doc.paymentID)) {
      this.paymentID = doc.paymentID;
    } else if ("string" == typeof doc.paymentID) {
      var paymentIDHex = new BigInteger(doc.paymentID, 10).toString(16);
      while (paymentIDHex.length < 16) paymentIDHex = "0" + paymentIDHex;
      this.paymentID = binConv(paymentIDHex, { in: "hex", out: "bytes" }).reverse();
    }
  }
  this.txType = doc.txType? doc.txType:0;
  this.bulletproofs = doc.bulletproofs?[...doc.bulletproofs]:[];
  utils.validateArrayType(this.bulletproofs, 'Tx.bulletproofs', true);
  
  if (Array.isArray(doc.txFee)) {
    this.txFee = doc.txFee;
  } else if ("string" == typeof doc.txFee) {
    var valueHex = (new BigInteger(doc.txFee, 10)).toString(16);
    while (valueHex.length < 16) valueHex = "0" + valueHex;
    this.txFee = binConv(valueHex, {in: 'hex', out: 'bytes'}).reverse();
  }

  this.c = doc.c?[...doc.c]:[...Buffer.alloc(32)];
  this.S = doc.S? [...doc.S]:[];
  this.txFeeKeyImage = doc.txFeeKeyImage? [...doc.txFeeKeyImage]: [];
  return this;
}

/**
 * Turn transaction data into Transaction objects.
 *
 * Takes an array of plain JavaScript objects containing transaction data and
 * returns an array of Transaction objects.
 */
Transaction.objectify = function(txs) {
  var objs = [];
  for (var i = 0; i < txs.length; i++) {
    objs.push(new Transaction(txs[i]));
  }
  return objs;
};

/**
 * Serialize this transaction.
 *
 * Returns the transaction as a byte array in the standard Bitcoin binary
 * format. This method is byte-perfect, i.e. the resulting byte array can
 * be hashed to get the transaction's standard Bitcoin hash.
 */
Transaction.prototype.serialize = function() {
  var buffer = [];
  buffer = buffer.concat(utils.wordsToBytes([parseInt(this.version)]).reverse());

  buffer = buffer.concat(utils.numToVarInt(this.vin.length));
  for (var i = 0; i < this.vin.length; i++) {
    buffer = buffer.concat(this.vin[i].serialize());
  }

  buffer = buffer.concat(utils.numToVarInt(this.vout.length));
  for (i = 0; i < this.vout.length; i++) {
    buffer = buffer.concat(this.vout[i].serialize());
  }

  buffer = buffer.concat(utils.wordsToBytes([parseInt(this.lock_time)]).reverse());

  buffer = buffer.concat([this.hasPaymentID]);
  if (this.hasPaymentID) {
    buffer = buffer.concat(this.paymentID);
  }

  buffer = buffer.concat(utils.wordsToBytes([parseInt(this.txType)]).reverse());
  buffer = utils.serializeByteArray(this.bulletproofs, buffer);
  
  buffer = buffer.concat(this.txFee);

  buffer = buffer.concat(this.c);

  buffer = buffer.concat(utils.numToVarInt(this.S.length));
  for(i = 0; i < this.S.length; i++) {
    buffer = buffer.concat(utils.numToVarInt(this.S[i].length));
    var si = this.S[i];
    for(var j = 0; j < si.length; j++) {
      buffer = buffer.concat(si[j]);
    }
  }

  buffer = utils.serializeByteArray(this.txFeeKeyImage, buffer);

  return buffer;
};

Transaction.prototype.getTxId = function() {
  var buf = this.serialize();
  return bcrypto.hash256(buf);
}

Transaction.prototype.clone = function() {
  return new Transaction({...this});
}


// Second argument txCount is optional; It indicates
// the number of the transactions that you expect to
// parse. The default number is 1
Transaction.deserialize = function(buf) {
  if (!Buffer.isBuffer(buf)) {
    buf = binConv(buf, {
      in: 'hex',
      out: 'buffer'
    });
  }

  var s = new Parser(buf)

  var tx = {}
  var verB = s.raw(4)
  tx.version = new Parser(verB).readUInt32LE()

  tx.vin = []
  tx.vout = []

  var inB = utils.readVarRaw(s)
  var inputCount = new Parser(inB).readVarInt()
  for (var i = 0; i < inputCount; i++) {
    var txin = TxIn.deserialize(s);
    tx.vin.push(txin)
  }

  var outB = utils.readVarRaw(s)
  var outputCount = new Parser(outB).readVarInt()
  for (i = 0; i < outputCount; i++) {
    var txout = TxOut.deserialize(s);
    tx.vout.push(txout)
  }

  var lockB = s.raw(4)
  tx.lock_time = new Parser(lockB).readUInt32LE()

  var hasPaymentIDB = s.raw(1);
  tx.hasPaymentID = (new Parser(hasPaymentIDB).readUInt32LE() != 0)? 1: 0;

  if (tx.hasPaymentID) {
    var paymentIDB = s.raw(8);
    tx.paymentID = binConv(paymentIDB, {out: "bytes"});
  }

  var txTypeB = s.raw(4)
  tx.txType = new Parser(txTypeB).readUInt32LE();

  var lenB = utils.readVarRaw(s);
  var len = new Parser(lenB).readVarInt();
  tx.bulletproofs = s.raw(len);

  var txFeeB = s.raw(8);
  tx.txFee = binConv(txFeeB, {out: "bytes"});

  var cB = s.raw(32);
  tx.c = binConv(cB, {out: "bytes"});

  tx.S = [];
  lenB = utils.readVarRaw(s);
  var SLen = new Parser(lenB).readVarInt();
  for(i = 0; i < SLen; i++) {
    var itemLenB = utils.readVarRaw(s);
    var itemSLen = new Parser(itemLenB).readVarInt();
    var sRow = [];
    for(var j = 0; j < itemSLen; j++) {
      var b = s.raw(32);
      sRow.push(binConv(b, {out: "bytes"}));
    }
    tx.S.push(sRow);
  }

  lenB = utils.readVarRaw(s);
  len = new Parser(lenB).readVarInt();
  tx.txFeeKeyImage = s.raw(len);


  if (s.hasFailed) {
    return false
  }
  return new Transaction(tx);
}

Transaction.prototype.computeTxHashForRingCT = function() {
  for(var i = 0; i < this.vout.length; i++) {
    this.vout[i].value = [0,0,0,0,0,0,0,0];
  }
  var buffer = [];
  buffer = buffer.concat(utils.wordsToBytes([parseInt(this.version)]).reverse());

  buffer = buffer.concat(utils.numToVarInt(this.vin.length));
  for (i = 0; i < this.vin.length; i++) {
    buffer = buffer.concat(this.vin[i].serialize());
  }

  buffer = buffer.concat(utils.numToVarInt(this.vout.length));
  for (i = 0; i < this.vout.length; i++) {
    var tempOut = new TxOut(this.vout[i]);
    buffer = buffer.concat(tempOut.serialize());
  }

  buffer = buffer.concat(utils.wordsToBytes([parseInt(this.lock_time)]).reverse());

  buffer = buffer.concat([this.hasPaymentID]);
  if (this.hasPaymentID) {
    buffer = buffer.concat(this.paymentID);
  }

  buffer = buffer.concat(utils.wordsToBytes([parseInt(this.txType)]).reverse());
  
  buffer = buffer.concat(this.txFee);

  return bcrypto.hash256(Buffer.from(buffer));
}

module.exports = {
  Transaction,
  TxIn,
  TxOut
}