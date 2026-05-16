import { hashPassword } from "../lib/auth.js";

const plain = process.argv[2];
if (!plain) {
  console.error("Usage: npm run hash-password -- your_password");
  process.exit(1);
}

const hash = await hashPassword(plain);
console.log(hash);
