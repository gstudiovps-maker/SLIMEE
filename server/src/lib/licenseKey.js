import crypto from "node:crypto";

/** Human-readable key: SLIMEE-XXXX-XXXX-XXXX */
export function generateLicenseKey() {
  const bytes = crypto.randomBytes(9);
  const hex = bytes.toString("hex").toUpperCase();
  const parts = hex.match(/.{1,4}/g) || [];
  return `SLIMEE-${parts.slice(0, 3).join("-")}`;
}
