const config = require("./config");
const bpin = require("./bpinput");
const request = require("request");

// Generate BulletProof by providing blinds and outAmounts in serialized hex following the BPInput structure in dapslib/bpinput.js
function CreateRangeBulletProof(apiServer, blinds, outAmounts, cb) {
  if (blinds.length != outAmounts.length || !blinds || blinds.length <= 0) {
    throw "invalid blind and amounts";
  }
  if ("string" != typeof blinds[0]) {
    throw "blinds must be in hex format";
  }
  var blindCombined = "";
  for (const blind of blinds) {
    blindCombined = blindCombined + blind;
  }
  blindCombined = Buffer.from(blindCombined, "hex");
  var bpinput = new bpin.BPInput({
    blinds: blindCombined,
    amounts: outAmounts,
  });
  var bpinputSerializedHex = Buffer.from(bpinput.serialize()).toString("hex");
  var options = {
    url: `${apiServer}/api/bulletproofs/${bpinputSerializedHex}`,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  };
  request(options, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      var parsed = JSON.parse(body);
      cb(parsed.bp);
    } else {
      if (response) {
        console.log('bulletproofs error: ', response.statusCode);
      } else {
        console.log('bulletproofs error: no response');
      }
    }
  });
}

module.exports = {
  CreateRangeBulletProof
}
