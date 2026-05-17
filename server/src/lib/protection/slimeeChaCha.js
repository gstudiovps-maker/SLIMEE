import crypto from "node:crypto";
import { config } from "../../config.js";

/** Same algorithm family as CFX FXAP (ChaCha20 double layer) — Slimee-owned keys only. */
const SLIMEE_MASTER_KEY = crypto
  .createHash("sha256")
  .update(process.env.SLIMEE_MASTER_KEY || process.env.PACKAGER_SECRET || config.jwtSecret || "slimee-master-v1")
  .digest();

const HEADER_SIZE = 0x5c;
const OUTER_IV_OFFSET = 0x4a;

export function deriveResourceKey({ licenseKey, packageId, buildId }) {
  return crypto
    .createHmac("sha256", SLIMEE_MASTER_KEY)
    .update(`${String(licenseKey).toUpperCase()}:${packageId}:${buildId}`)
    .digest();
}

/** Node chacha20 expects 16-byte IV; CFX / PyCryptodome use 12-byte nonce (counter prefix). */
function chachaIv(nonce12) {
  if (nonce12.length === 16) return nonce12;
  if (nonce12.length !== 12) {
    throw new Error("ChaCha nonce must be 12 bytes");
  }
  return Buffer.concat([Buffer.alloc(4, 0), nonce12]);
}

function chachaEncrypt(plaintext, key32, nonce12) {
  const cipher = crypto.createCipheriv("chacha20", key32, chachaIv(nonce12));
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

function chachaDecrypt(ciphertext, key32, nonce12) {
  const decipher = crypto.createDecipheriv("chacha20", key32, chachaIv(nonce12));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Build CFX-style encrypted blob (SLME magic) for a single Lua file.
 */
export function encryptLuaChaCha(plaintext, resourceKey32) {
  const body = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8");
  const realIv = crypto.randomBytes(12);

  const innerCipher = chachaEncrypt(body, resourceKey32, realIv);

  const header = Buffer.alloc(HEADER_SIZE, 0);
  header.write("SLME", 0);
  realIv.copy(header, HEADER_SIZE - 12);

  const firstRound = Buffer.concat([header, innerCipher]);
  const outerIv = crypto.randomBytes(12);

  const outerPrefix = Buffer.alloc(OUTER_IV_OFFSET + 12, 0);
  outerPrefix.write("SLME", 0);
  outerIv.copy(outerPrefix, OUTER_IV_OFFSET);

  const outerCipher = chachaEncrypt(firstRound, SLIMEE_MASTER_KEY, outerIv);
  return Buffer.concat([outerPrefix, outerCipher]);
}

export function decryptLuaChaCha(buffer, resourceKey32) {
  const file = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (file.length < 0x56 || file.subarray(0, 4).toString() !== "SLME") {
    throw new Error("Not a Slimee encrypted script");
  }

  const outerIv = file.subarray(OUTER_IV_OFFSET, OUTER_IV_OFFSET + 12);
  const outerEncrypted = file.subarray(0x56);
  const firstRound = chachaDecrypt(outerEncrypted, SLIMEE_MASTER_KEY, outerIv);

  if (firstRound.length < HEADER_SIZE) {
    throw new Error("Corrupt Slimee payload (header)");
  }

  const headerBlock = firstRound.subarray(0, HEADER_SIZE);
  const realIv = headerBlock.subarray(headerBlock.length - 12);
  const content = firstRound.subarray(HEADER_SIZE);
  return chachaDecrypt(content, resourceKey32, realIv);
}
