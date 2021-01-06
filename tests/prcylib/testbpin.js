const bpin = require("../../src/prcylib/bpinput");
const BPCreator = require("../../src/prcylib/bulletproofs");
const config = require('../../src/prcylib/config')

var bp = {
  blinds: Buffer.from(
    "11111111111111111111111111111111111111111111111111111111111111112222222222222222222222222222222222222222222222222222222222222222",
    "hex"
  ),
  amounts: ["400000000", "500000000"],
};

BPCreator.CreateRangeBulletProof(
  config.PRCY_SERVER,
  [
    "1111111111111111111111111111111111111111111111111111111111111111",
    "2222222222222222222222222222222222222222222222222222222222222222",
  ],
  ["400000000", "500000000"],
  function(bp) {
    //console.log("create bp:", bp);
  }
);
