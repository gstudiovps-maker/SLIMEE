import { verifyCustomerToken } from "../lib/customerAuth.js";
import { findCustomerByDiscordId } from "../lib/customers.js";

export async function requireCustomer(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Sign in required", code: "auth_required" });
  }

  const payload = verifyCustomerToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Session expired — sign in again", code: "auth_invalid" });
  }

  const customer = await findCustomerByDiscordId(payload.discordId);
  if (!customer) {
    return res.status(401).json({ error: "Account not found", code: "auth_not_found" });
  }

  req.customer = customer;
  req.customerAuth = payload;
  return next();
}
