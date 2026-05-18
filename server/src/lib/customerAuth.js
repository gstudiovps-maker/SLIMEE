import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function signCustomerToken(customer) {
  return jwt.sign(
    {
      typ: "customer",
      sub: customer.id,
      discordId: customer.discord_id
    },
    config.jwtSecret,
    { expiresIn: config.customerJwtExpiresIn || "30d" }
  );
}

export function verifyCustomerToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.typ !== "customer" || !payload.discordId) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function signOAuthState({ returnTo }) {
  return jwt.sign(
    { typ: "oauth_state", returnTo: returnTo || "" },
    config.jwtSecret,
    { expiresIn: "15m" }
  );
}

export function verifyOAuthState(state) {
  try {
    const payload = jwt.verify(state, config.jwtSecret);
    if (payload.typ !== "oauth_state") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
