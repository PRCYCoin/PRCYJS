const Wallet = require("../../src/prcylib/wallet");

var wl = new Wallet({
  mnemonics:
    "knee echo mixed hybrid outside situate loyal leisure rabbit shrimp select flower nose used squirrel crouch appear tourist soccer throw accuse convince custom obscure",
});
wl.scanWalletTransactions(function () {
  //console.log("balance: ", wl.spendable);
  //console.log("address: ", wl.address);
  /*wl.sendTo(wl.address, 10, function (ret) {
    if (!ret.success) {
      console.log("failed due to: ", ret.reason);
    } else {
      console.log("successfully create transaction ", ret.txid);
      wl.recomputeBalance();
      console.log("balance: ", wl.spendable);
      console.log("pending: ", wl.pending);
    }
  });*/
  //showWalletBalance();
});
