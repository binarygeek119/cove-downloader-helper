#!/usr/bin/env node
// Write a CRX3 file. The header matches Chrome's --pack-extension output.
import crypto from 'node:crypto';
import fs from 'node:fs';

const [zipPath, pemPath, crxPath] = process.argv.slice(2);
if (!zipPath || !pemPath || !crxPath) {
  console.error('usage: pack-crx.mjs <zip> <private.pem> <out.crx>');
  process.exit(1);
}

const pem = fs.readFileSync(pemPath);
const zip = fs.readFileSync(zipPath);
const publicKey = crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' });
const crxId = crypto.createHash('sha256').update(publicKey).digest().subarray(0, 16);

function varint(value) {
  const bytes = [];
  let n = value;
  while (n > 127) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n);
  return Buffer.from(bytes);
}

function field(fieldNumber, bytes) {
  const tag = (fieldNumber << 3) | 2;
  return Buffer.concat([varint(tag), varint(bytes.length), bytes]);
}

const signedHeader = field(1, crxId);
const signedHeaderSize = Buffer.alloc(4);
signedHeaderSize.writeUInt32LE(signedHeader.length);
const signed = Buffer.concat([
  Buffer.from('CRX3 SignedData\0', 'utf8'),
  signedHeaderSize,
  signedHeader,
  zip,
]);
const signature = crypto.sign('sha256', signed, pem);
const proof = Buffer.concat([field(1, publicKey), field(2, signature)]);
const header = Buffer.concat([field(2, proof), field(10000, signedHeader)]);
const headerSize = Buffer.alloc(4);
headerSize.writeUInt32LE(header.length);
const crx = Buffer.concat([Buffer.from('Cr24'), Buffer.from([3, 0, 0, 0]), headerSize, header, zip]);
fs.writeFileSync(crxPath, crx);

const extensionId = [...crxId].map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');
process.stdout.write(`${extensionId}\n`);
