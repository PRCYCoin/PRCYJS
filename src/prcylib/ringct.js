const secp256k1 = require("secp256k1");
const utils = require("./utils");
const bcrypto = require("../crypto");
const Transaction = require("./transaction");
const Script = require("btc-script");

// Default settings for Ring Sizes
const MAX_NUM_RING = 50;
const MIN_RING_SIZE = 27;
const MAX_RING_SIZE = 32;

function negatePoint(p) {
    var cop = [...p];
    cop[0] = (cop[0] % 2 == 0)? 3: 2;
    return Uint8Array.from(cop);
}

// Verify validity of Rings up to MAX_NUM_RING
function VerifyRingValidity(rings) {
  var numRing = rings.length;
  if (numRing < 1) {
    console.error("There is no ring to make signature");
    return false;
  }

  if (numRing >= MAX_NUM_RING) {
    console.error("Too many inputs for ring signature");
    return false;
  }

  // check ringsizes
  var ringSize = rings[0].length;
  for (var i = 1; i < numRing; i++) {
    if (rings[i].length != ringSize) {
      console.error("The number of keys per ring must be equal to each other");
      return false;
    }
  }
  if (ringSize < MIN_RING_SIZE + 1 || ringSize > MAX_RING_SIZE + 1) {
    console.error(
      "Ring size must be within:",
      MIN_RING_SIZE,
      " and ",
      MAX_RING_SIZE
    );
    return false;
  }
  return true;
}

// Returns {keyImages, c, S}
function CreateMSLAG(
  message, // uint256
  rings, // array of array of pubkeys
  index, // secret index
  privateKeys // array of private keys
) {
  var keyImages = [];
  var c = [];
  var S = [];
  if (!VerifyRingValidity(rings)) {
    return false;
  }

  var numRing = rings.length;
  var ringSize = rings[0].length;

  if (privateKeys.length != numRing) {
    console.error("The number of signing keys and rings do not match");
    return false;
  }

  if (index < 0 || index >= ringSize) {
    console.error("Index for ring signature is not valid");
    return false;
  }

  // setup
  // check that key at index is indeed the signer
  for (var i = 0; i < numRing; i++) {
    var pubkey = secp256k1.publicKeyCreate(privateKeys[i], true);
    if (
      Buffer.from(rings[i][index]).toString("hex") !=
      Buffer.from(pubkey).toString("hex")
    ) {
      console.error("Secret index in ring is not the signer");
      return false;
    }
  }

  // generate key images
  for (i = 0; i < numRing; i++) {
    var ki = utils.computeKeyImage(privateKeys[i]);
    keyImages.push(ki);
  }

  // start at c[1]
  // pick random scalar u (glue value), calculate c[1] = H(m, u*G) where H is a hash function and G is the base point of the curve
  var CLocal = new Array(ringSize);
  var SLocal = new Array(numRing); // [ringSize];

  // Initialize S except S[..][index]
  for (i = 0; i < numRing; i++) {
    SLocal[i] = new Array(ringSize);
    for (var j = 0; j < ringSize; j++) {
      if (j != index) {
        SLocal[i][j] = utils.generateRandom32Bytes();
      }
    }
  }

  var alpha = new Array(numRing);
  var l = [];
  // compute L[i][s], R[i][s], i = 0..numRing
  for (i = 0; i < numRing; i++) {
    alpha[i] = utils.generateRandom32Bytes();
    // start at secret index s/PI
    // compute L_s = u*G
    var L = secp256k1.publicKeyCreate(Uint8Array.from(alpha[i]));
    l = l.concat([...L]);
    // compute R_s = u*H_p(P[s])
    var hashPoint = utils.computeHashPoint(Uint8Array.from(rings[i][index]));
    var R = secp256k1.publicKeyTweakMul(
      Uint8Array.from(hashPoint),
      Uint8Array.from(alpha[i])
    );
    //LogPrintf("%s:R[%d][%d] = %s\n", __func__, i, index, HexStr(R , R + 33));
    l = l.concat([...R]);
  }
  l = l.concat([...message]);
  var CTemp = bcrypto.hash256(Buffer.from(l));
  var idx = (index + 1) % ringSize;
  CLocal[idx] = CTemp;
  while (idx != index) {
    l = [];
    for (j = 0; j < numRing; j++) {
      var sPubKey = secp256k1.publicKeyCreate(SLocal[j][idx], true);
      L = secp256k1.publicKeyCombine([
        sPubKey,
        secp256k1.publicKeyTweakMul(
          rings[j][idx],
          Uint8Array.from(CLocal[idx])
        ),
      ]);

      l = l.concat([...L]);

      var ringHashPoint = utils.computeHashPoint(rings[j][idx]);
      var mulHashPoint = secp256k1.publicKeyTweakMul(
        Uint8Array.from(ringHashPoint),
        Uint8Array.from(SLocal[j][idx])
      );

      R = secp256k1.publicKeyCombine([
        Uint8Array.from(mulHashPoint),
        secp256k1.publicKeyTweakMul(
          Uint8Array.from(keyImages[j]),
          Uint8Array.from(CLocal[idx])
        ),
      ]);
      l = l.concat([...R]);
    }
    idx++;
    idx = idx % ringSize;

    var ciIdx = idx;
    l = l.concat([...message]);
    CTemp = bcrypto.hash256(Buffer.from(l));
    CLocal[ciIdx] = CTemp;
  }

  // compute S[j][s] = alpha[j] - c[s] * privkeys[j], privkeys[j] = private key corresponding to key image I[j]
  for (j = 0; j < numRing; j++) {
    // close ring by finding S[j][s] = (alpha[j] - c[s]*privkeys[s] ) mod P where k[s] is the private key and P is the order of the curve
    SLocal[j][index] = secp256k1.privateKeyTweakAdd(
      Uint8Array.from(alpha[j]),
      secp256k1.privateKeyNegate(
        secp256k1.privateKeyTweakMul(
          Uint8Array.from(CLocal[index]),
          privateKeys[j]
        )
      )
    );
  }

  // everything ok, add values to signature
  // copy SLocal to S
  for (i = 0; i < ringSize; i++) {
    var column = [];

    for (j = 0; j < numRing; j++) {
      column.push([...SLocal[j][i]]);
    }
    S.push(column);
  }
  c = CLocal[0];
  return { keyImages: keyImages, c: c, S: S };
}

// Create RingCT Transaction using the parameters in the format below.
// ins: [{hash, n, amount, blind, commitment}] : (hash, blind, commitment) => byte arrays, amount: string
// outs: [{address, amount}], amount is in string
// decoysDetails: [{hash, n, pubkey, commitment}]: (hash, pubkey, commitment) => byte arrays, amount: string
// privateKeys: [private keys corresponding to inputs being spent]
// all commitments are in pubkey format (starts with 02 or 03)
function CreateRingCTTransaction(ins, outs, decoysDetails, privateKeys, ringSize) {
  var pubkeys = privateKeys.map((p) => {
    return secp256k1.publicKeyCreate(Uint8Array.from(p));
  });
  var txPrivs = [];
  var blinds = [];
  var tx = {};
  tx.vin = [];
  tx.vout = [];
  for (var i = 0; i < outs.length; i++) {
    var out = {};
    txPrivs.push(utils.generateRandom32Bytes());
    var decoded = utils.decodePrivacyAddress(outs[i].address);
    if (!decoded) {
      return "Invalid address!";
    }
    var pubview = decoded.pubview;
    var pubspend = decoded.pubspend;
    var paymentID = decoded.paymentID;
    if (paymentID.length == 8) {
      tx.hasPaymentID = 1;
      tx.paymentID = paymentID;
    }

    out.txPub = [...secp256k1.publicKeyCreate(Uint8Array.from(txPrivs[i]))];
    // create out address
    var ECDHPub = secp256k1.publicKeyTweakMul(
      Uint8Array.from(pubview),
      txPrivs[i]
    );
    var ECDHHash = bcrypto.hash256(Buffer.from(ECDHPub));
    var destinationPub = secp256k1.publicKeyTweakAdd(
      Uint8Array.from(pubspend),
      Uint8Array.from(ECDHHash)
    );
    var scriptBytes = [33].concat([...destinationPub]).concat([172]);
    out.script = new Script(scriptBytes, false);

    out.value = Buffer.alloc(8);
    var blind = [...outs[i].blind]
    blinds.push(blind);

    // encode value
    var encoded = utils.encodeValues(ECDHPub, outs[i].amount + "", blind);
    out.encodedAmount = encoded.encodedAmount;
    out.encodedBlind = encoded.encodedBlind;

    out.commitment = [...utils.createCommitment(outs[i].amount, blind)];
    var txout = new Transaction.TxOut(out);

    tx.vout.push(txout);
  }

  // create vin
  var excludesForAll = {};
  for (i = 0; i < ins.length; i++) {
    var existing = decoysDetails.find(
      (d) =>
        Buffer.from(d.txid, "hex")
          .reverse()
          .toString("hex") == Buffer.from(ins[i].hash).toString("hex") &&
        d.n == ins[i].n
    );
    if (existing) {
      excludesForAll[existing] = true;
    }
  }

  // note this ringSize is one bigger than ringSize in cpp
  var secretIndex = Math.floor(Math.random() * ringSize);
  var rings = [];
  var commitmentRings = [];

  var txFee = 0;
  for (i = 0; i < ins.length; i++) {
    txFee += parseInt(ins[i].amount);
  }

  for (i = 0; i < outs.length; i++) {
    txFee -= parseInt(outs[i].amount);
  }
  tx.txFee = txFee.toString();

  var txFeeCommitment = utils.createCommitment(tx.txFee, Buffer.alloc(32));
  // compute sum of all out commitments + txFeeCommitment
  var sumOfAllOutCommitments = Uint8Array.from(txFeeCommitment);
  for (i = 0; i < tx.vout.length; i++) {
    sumOfAllOutCommitments = secp256k1.publicKeyCombine([
      Uint8Array.from(sumOfAllOutCommitments),
      Uint8Array.from(tx.vout[i].commitment),
    ]);
    tx.vout[i].commitment = utils.toCommitmentFormat(tx.vout[i].commitment);
  }

  // compute private key for last ring
  var lastRingPrivateKey = Uint8Array.from(privateKeys[0]);
  for (i = 1; i < privateKeys.length; i++) {
    lastRingPrivateKey = secp256k1.privateKeyTweakAdd(
      Uint8Array.from(lastRingPrivateKey),
      Uint8Array.from(privateKeys[i])
    );
  }
  for (i = 0; i < ins.length; i++) {
    lastRingPrivateKey = secp256k1.privateKeyTweakAdd(
      Uint8Array.from(lastRingPrivateKey),
      Uint8Array.from(ins[i].blind)
    );
  }

  var sumOfOutBlinds = blinds[0];
  for (i = 1; i < blinds.length; i++) {
    sumOfOutBlinds = secp256k1.privateKeyTweakAdd(
      Uint8Array.from(sumOfOutBlinds),
      Uint8Array.from(blinds[i])
    );
  }
  var negSumOfOutBlinds = secp256k1.privateKeyNegate(
    Uint8Array.from(sumOfOutBlinds)
  );
  lastRingPrivateKey = secp256k1.privateKeyTweakAdd(
    lastRingPrivateKey,
    negSumOfOutBlinds
  );


  var lastRingPubkeys = new Array(ringSize);
  lastRingPubkeys[secretIndex] = secp256k1.publicKeyCreate(
    lastRingPrivateKey,
    true
  );

  for (i = 0; i < ins.length; i++) {
    var inCreated = {};
    inCreated.prevout = {};
    inCreated.decoys = new Array(ringSize - 1);
    var excludes = JSON.parse(JSON.stringify(excludesForAll));
    var ring = new Array(ringSize);
    var commitmentRing = new Array(ringSize);
    for (var j = 0; j < ringSize; j++) {
      if (j == secretIndex) {
        if (j == 0) {
          inCreated.prevout.hash = [...ins[i].hash];
          inCreated.prevout.n = ins[i].n;
        } else {
          inCreated.decoys[j - 1] = { hash: [...ins[i].hash], n: ins[i].n };
        }
        ring[j] = pubkeys[i];
      } else {
        var selected = utils.selectRandomIndex(decoysDetails.length, excludes);
        excludes[selected] = true;
        if (j == 0) {
          inCreated.prevout = {
            hash: [
              ...Buffer.from(decoysDetails[selected].txid, "hex").reverse(),
            ],
            n: decoysDetails[selected].utxo.n,
          };
        } else {
          inCreated.decoys[j - 1] = {
            hash: [
              ...Buffer.from(decoysDetails[selected].txid, "hex").reverse(),
            ],
            n: decoysDetails[selected].utxo.n,
          };
        }
        ring[j] = Buffer.from(
          decoysDetails[selected].utxo.pubkey,
          "hex"
        ).reverse();
        commitmentRing[j] = Buffer.from(
          decoysDetails[selected].utxo.commitment,
          "hex"
        );
      }
    }
    inCreated.script = new Script();
    inCreated.s = [];
    inCreated.R = [];
    inCreated.encryptionKey = [];
    inCreated.keyImage = [
      ...utils.computeKeyImage(Uint8Array.from(privateKeys[i])),
    ];
    rings.push(ring);
    commitmentRings.push(commitmentRing);
    var txin = new Transaction.TxIn(inCreated);
    tx.vin.push(txin);
  }

  for (j = 0; j < ringSize; j++) {
    if (j != secretIndex) {
      var lastPubkey = rings[0][j];
      var tempCommitment = commitmentRings[0][j];
      tempCommitment = utils.toPubkeyFormat(tempCommitment);
      lastPubkey = secp256k1.publicKeyCombine([
        Uint8Array.from(lastPubkey),
        Uint8Array.from(tempCommitment),
      ]);
      for (i = 1; i < rings.length; i++) {
        tempCommitment = commitmentRings[i][j];
        tempCommitment = utils.toPubkeyFormat(tempCommitment);
        lastPubkey = secp256k1.publicKeyCombine([
          Uint8Array.from(lastPubkey),
          Uint8Array.from(rings[i][j]),
        ]);
        lastPubkey = secp256k1.publicKeyCombine([
          Uint8Array.from(lastPubkey),
          Uint8Array.from(tempCommitment),
        ]);
      }

      var neg = negatePoint(sumOfAllOutCommitments);
      lastPubkey = secp256k1.publicKeyCombine([lastPubkey, neg]);
      lastRingPubkeys[j] = lastPubkey;
    }
  }
  rings.push(lastRingPubkeys);
  var secretKeys = privateKeys.concat([lastRingPrivateKey]);

  tx = new Transaction.Transaction(tx);

  var ringCTSignatureHash = tx.computeTxHashForRingCT();

  var ringct = CreateMSLAG(ringCTSignatureHash, rings, secretIndex, secretKeys);
  tx.txFeeKeyImage = [...ringct.keyImages[ringct.keyImages.length - 1]];
  tx.c = ringct.c;
  tx.S = ringct.S;
  return { tx: new Transaction.Transaction(tx), blinds: blinds };
}

module.exports = { CreateRingCTTransaction };
