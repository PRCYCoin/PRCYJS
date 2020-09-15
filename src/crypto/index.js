'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const createHash = require('create-hash');
function ripemd160(buffer) {
  try {
    return createHash('rmd160')
      .update(buffer)
      .digest();
  } catch (err) {
    return createHash('ripemd160')
      .update(buffer)
      .digest();
  }
}
function sha1(buffer) {
  return createHash('sha1')
    .update(buffer)
    .digest();
}
function sha256(buffer) {
  return createHash('sha256')
    .update(Buffer.from(buffer))
    .digest();
}
function hash160(buffer) {
  return ripemd160(sha256(buffer));
}
function hash256(buffer) {
  return sha256(sha256(buffer));
}

module.exports = {
  ripemd160, 
  sha1,
  sha256,
  hash160, 
  hash256
}