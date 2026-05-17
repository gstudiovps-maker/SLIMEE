import crypto from "node:crypto";
import { config } from "../../config.js";

const MAGIC = Buffer.from("SLFX");
const VERSION = 1;

export function deriveSlimeeKey({ licenseKey, packageId, buildId }) {
  const secret = process.env.PACKAGER_SECRET || config.jwtSecret || "slimee-dev-packager-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(`${String(licenseKey).toUpperCase()}:${packageId}:${buildId}`)
    .digest();
}

function xorWithKey32(data, key32) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i += 1) {
    out[i] = buf[i] ^ key32[i % 32];
  }
  return out;
}

export function encryptSlimeefxap(plaintext, key32) {
  const body = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8");
  const encrypted = xorWithKey32(body, key32);
  const tag = crypto.createHmac("sha256", key32).update(encrypted).digest();
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), encrypted, tag]);
}

export function decryptSlimeefxap(buffer, key32) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 37 || !buf.subarray(0, 4).equals(MAGIC)) {
    throw new Error("Invalid .slimeefxap file");
  }
  if (buf[4] !== VERSION) {
    throw new Error("Unsupported .slimeefxap version");
  }
  const encrypted = buf.subarray(5, buf.length - 32);
  const tag = buf.subarray(buf.length - 32);
  const expected = crypto.createHmac("sha256", key32).update(encrypted).digest();
  if (!expected.equals(tag)) {
    throw new Error(".slimeefxap integrity check failed");
  }
  return xorWithKey32(encrypted, key32);
}

export function luaPathToSlimeefxap(luaPath) {
  return luaPath.replace(/\.lua$/i, ".slimeefxap");
}
