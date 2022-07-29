const Wallet = require("../../src/prcylib/wallet");

var wl = new Wallet({
  mnemonics:
    "consider float swift material master couple volcano meat sadness purchase grace shop proud faith hundred advance critic practice situate riot weapon pattern family volume",
});
wl.scanWalletTransactions(function () {
  console.log("balance: ", wl.spendable);
  wl.sendTo(wl.address, 1, function (ret) {
    if (!ret.success) {
      console.log("failed due to: ", ret.reason);
    } else {
      console.log("successfully create transaction ", ret.txid);
      wl.recomputeBalance();
      console.log("balance: ", wl.spendable);
      console.log("pending: ", wl.pending);
    }
  });
  //showWalletBalance();
});
