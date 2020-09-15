var Parser = require("crypto-binary").MessageParser;
const utils = require("./utils");
var binConv = require("binstring");
var BigInteger = require("bigi");

function BPInput(data) {
  // if prevout hash is null
  // then this is a coinbase transaction
  // Note: we can never have a null hash, this makes serilization of the transaction impossible
  if (!data) {
    data = {};
  }
  this.blinds = [...data.blinds];
  var numOfBlinds = this.blinds.length / 32;
  if (data.amounts.length != numOfBlinds) {
    throw "amounts and blinds are not matched";
  }
  this.amounts = []
  for (var i = 0; i < data.amounts.length; i++) {
    if (Array.isArray(data.amounts[i])) {
      this.amounts.push(data.amounts[i]);
    } else {
      var valueHex = new BigInteger(data.amounts[i], 10).toString(16);
      while (valueHex.length < 16) valueHex = "0" + valueHex;
      this.amounts.push(binConv(valueHex, { in: "hex", out: "bytes" }).reverse());
    }
  }
}

BPInput.prototype.clone = function() {
  var newInput = new BPInput({
    blinds: this.blinds,
    amounts: this.amounts
  });
  return newInput;
};

BPInput.prototype.serialize = function() {
  var buffer = [];

  buffer = utils.serializeByteArray(this.blinds, buffer);
  buffer = buffer.concat([...utils.numToVarInt(this.amounts.length)]);
  for(var i = 0; i < this.amounts.length; i++) {
    buffer = buffer.concat(this.amounts[i]);
  }
  return buffer;
};

BPInput.deserialize = function(buf) {
  if (!Buffer.isBuffer(buf)) {
    buf = binConv(buf, {
      in: 'hex',
      out: 'buffer'
    });
  }

  var parser = new Parser(buf)
  var bpin = {};
  // read script
  var sLenB = utils.readVarRaw(parser);
  var blindLength = new Parser(sLenB).readVarInt();
  var blinds = parser.raw(blindLength);
  bpin.blinds = blinds;
  bpin.amounts = [];

  sLenB = utils.readVarRaw(parser);
  var amountsLength = new Parser(sLenB).readVarInt();
  for(var i = 0; i < amountsLength; i++) {
    var val = parser.raw(8);
    bpin.amounts.push(binConv(val, {out: "bytes"}));
  }
  return new BPInput(bpin);
};

module.exports = {
  BPInput
}
