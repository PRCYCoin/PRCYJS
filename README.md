# DAPSJS
NodeJS library for making DAPS privacy transactions

API Call List:
|                                                   |      |            |                  |                                                                                                                                        |                                                                                                                                                                                                                                                                                                                                                                                                      |
|:-------------------------------------------------:|:----:|:----------:|:----------------:|:--------------------------------------------------------------------------------------------------------------------------------------:|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------:|
|                      Request                      |      |            |                  |                                                                                                                                        | Response                                                                                                                                                                                                                                                                                                                                                                                             |
| Descriptions                                      | Verb | URI Prefix | Method           | Params                                                                                                                                 |                                                                                                                                                                                                                                                                                                                                                                                                      |
| Requests API to scan for utxos and return them    | post | wallet     | scan             | viewkey:${viewkey}  spendpub:${pubspenkey}  sinceblock: ${sinceblock} filterspents: true/false => true means only return unspent utxos | "scanning": false, "scannedheight": 477302,    "utxos": [keyimage],"txes": { "keyimage": {   "vin": [],   "vout": [],   "blockindex": 476098,   "blocktime": 1592551400,   "txfee": 1.496,   "ringsize": 13,   "_id": "5eec67d9824cf9f9a0195dd8",   "txid": "keyimage",   "__v": 0,   "blockhash": "36540454e15e8a4fc20311feff8e4084e14fb532a855a70a43cbb2beeaca5e76",   "type": "standard"   }   }, |
| Requests the last scanned height for the key pair | post | wallet     | getscannedheight | viewkey:${viewkey}  spendpub:${pubspenkey}                                                                                             |                                                                                                                                                                                                                                                                                                                                                                                                      |
|                                                   | get  | api        | keyimages        | ${keyimages}                                                                                                                           | {"spents":[],"unspents":["13a3caf5416c349f362735b70b6a2f63c2f94fca9ce2bbfb70848d3f102cb054"]}                                                                                                                                                                                                                                                                                                        |
| Get the latest API block height                   | get  | api        | blockcount       |                                                                                                                                        |                                                                                                                                                                                                                                                                                                                                                                                                      |
| Get decoys from the API                           | get  | api        | decoys           | $(number)                                                                                                                              |                                                                                                                                                                                                                                                                                                                                                                                                      |
| Generates the bulletproof for the given params   | get  | api        | bulletproofs     | ${bpinputSerializedHex}                                                                                                                |                                                                                                                                                                                                                                                                                                                                                                                                      |
| Broadcasts the raw transaction                    | post | api        | broadcasttx      | ${rawSignedTx}                                                                                                                         |                                                                                                                                                                                                                                                                                                                                                                                                      |
|server public key for encrypting view key and spend public key| get  | api        | getencryptionkey |                                                                                                                                        |                                                                                                                                                                                                                                                                                                                                                                                                      |
| Allows utxo's to be added to the API              | post | wallet     | addutxos         | viewkey:${viewkey} spendpub:${pubspenkey} scannedheight: ${scannedheight} utxos: string in format txid-index:txid-index...             |                                                                                                                                                                                                                                                                                                                                                                                                      |
| Marks the given utxos as spent in the API         | Post | wallet     | markspents       | viewkey:${viewkey} spendpub:${pubspenkey} spents: string in format txid-index:txid-index...                                            |                                                                                                                                                                                                                                                                                                                                                                                                      |


Note: You must obtain API info and Server Encryption Key from the DAPS team to be able to access the API. These are placed in the `src/dapslib/config.js`.

Usage
===============
* Create a wallet object from mnemonics
```
const Wallet = require('dapsjs').Wallet;
const config = require('dapsjs').Constants;
var walletObject = new Wallet({mnemonics: mnemonics.mnemonics}, config.DAPS_SERVER, config.DAPSCHAIN, "Bitcoin seed");
```

Once wallet object created, then it will automatically send requests to the RPC server to scan for all transactions belonging to the wallet.

* Get wallet balances: wallet balances are only available (and correct) if and only if the transaction scanning is finished. 
```
function getBalance(wl) {
   if (wl.isScanning) return 'wallet is scanning';
   return {spendable: wl.spendable, immature: wl.immature, pending: wl.pending}
}
```
Note that `wl.isScanning` should be always false, except if the user is logging-in the wallet, which might take from 5 second to 1 minute to finishn scanning, depending whether the user log-in the wallet previously or not.

Wallet will periodically send request to the server every minute to scan for new wallet transactions.

For third-party integration, nothing needs to be done except initialize the wallet object and uses it to show information on the apps of the third-parties.

* Get the current block height: 
```
wl.currentBlockHeight
```

* Create transaction and broadcast it:
```
walletObject.sendTo(destination, amount, function(ret) {
  if (ret.success) {
    state.txCreateResult = {success: true, message: "Successfully create transaction " + ret.txid + " sending " + input.amount + " to " + input.destination};
  } else {
    state.txCreateResult = {success: false, message: "Error:" + ret.reason};
  }
  walletObject.recomputeBalance();
})
```
   ** `destination`: the receiver address
   ** `amount`: amount to send. Amount should be in decimal string

It is worth noting that the wallet object will manage and recompute balances so that third-parties only need to inject the wallet object in their app.

API "sinceblock" Parameter Usage
===============
* Server has already seen the key:
    * sinceBlock = XXX => Server scans from the scanned height stored in the server and return all utxos in block > XXX
* Server has never seen the key:
    * sinceBlock = 0 => Server scans the entire chain and returns all utxos found
    * sinceBlock = XXX => Server scan all blocks > XXX and returns all utxos included in blocks > XXX

If it’s a new wallet, you would only need to set sinceBlock = the currentBlock height => done!

EncryptedViewKey and EncryptedSpendPub
================
* Call getencryptionkey from API to get the public key of the server to encrypt view key and public spend key => EncryptionKey
* Encryption:
    * Generate random r (32 bytes), compute R = r*G
    * Compute ECDH = Hash(r*EncryptionKey)
    * Compute encryptedviewkey = viewkey + ECDH
    * Compute encryptedspendpub
        * X = X of public spend key
        * EncryptedX = X + ECDH
        * encryptedspendpub = EncryptedX|| (03|02)
* Send to server: {method=.., encryptedviewkey=encryptedviewkey, encryptedspendpub=encryptedspendpub, encrypted=true}

Note: `r` in the request sent to server is `R` in the formulae

DAPSJS Statuses / Status Values (currentStatus/currentStatusVal)
================
Statuses have been added to keep the user up to date as to what the wallet is currently doing. Each status also has a corresponding currentStatusVal integer that can be accessed as well.
* Idle - 1 - Starting state
* Scanning - 2 - When the wallet is scanning for UTXOs belonging to a restored phrase
* Processing UTXOs - 3 - Taking the UTXOs that were scanned and processing them all
* Generating transaction history - 4 - Creation of the transaction history from scanned UTXOs
* Recomputing wallet balance - 5 - Recomputing wallet balance
* Complete - 6 - The process is complete

Get the current Status: 
```
wl.currentStatus
```
Get the current StatusVal: 
```
wl.currentStatusValue
```

Basic Test
================

### Requires
*  node.js 
*  Mnemonic Recovery Phrase
*  DAPS

### Start Testing
1. Create a new wallet
2. Write down the Mnemonic Recovery Phrase
3. Send some coins (minimum 5 DAPS recommended)
4. Add the Mnemonic Recovery Phrase on [\tests\wallet\createwallet.js](https://github.com/DAPSCoin/DAPSJS/blob/master/tests/wallet/createwallet.js#L5)
5. Edit the amount of DAPS to send on [\tests\wallet\createwallet.js](https://github.com/DAPSCoin/DAPSJS/blob/master/tests/wallet/createwallet.js#L9)
6. Run `npm install`
7. Edit `src/dapslib/config.js` with the required information
8. Run `npm run tests`
