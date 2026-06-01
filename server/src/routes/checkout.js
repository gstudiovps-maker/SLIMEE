import express from "express";

import Stripe from "stripe";

import { config } from "../config.js";

import { getPackageById, getStripeUnitAmount } from "../lib/packages.js";

import { verifyCustomerToken } from "../lib/customerAuth.js";

import { findCustomerByDiscordId } from "../lib/customers.js";



const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;



async function customerFromRequest(req) {

  const header = req.headers.authorization || "";

  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {

    return null;

  }

  const payload = verifyCustomerToken(token);

  if (!payload) {

    return null;

  }

  return findCustomerByDiscordId(payload.discordId);

}



export const checkoutRouter = express.Router();



checkoutRouter.post("/", async (req, res) => {

  try {

    if (!stripe) {

      return res.status(503).json({ error: "Stripe is not configured on the server." });

    }



    const customer = await customerFromRequest(req);

    if (!customer) {

      return res.status(401).json({

        error: "Please sign in with Discord before purchasing so your assets are linked to your account.",

        code: "login_required"

      });

    }



    const body = req.body || {};

    let ids = [];

    if (Array.isArray(body.packageIds) && body.packageIds.length > 0) {

      ids = [...new Set(body.packageIds.map((id) => String(id).trim()).filter(Boolean))];

    } else if (body.packageId) {

      ids = [String(body.packageId).trim()].filter(Boolean);

    }



    if (!ids.length) {

      return res.status(400).json({ error: "packageIds or packageId is required." });

    }



    const lineItems = [];

    let currency = null;



    for (const id of ids) {

      const pkg = await getPackageById(id);

      if (!pkg) {

        return res.status(404).json({ error: `Package not found: ${id}` });

      }



      const unitAmount = getStripeUnitAmount(pkg);

      if (!unitAmount) {

        return res.status(400).json({ error: `Package has no valid price: ${id}` });

      }



      const cur = String(pkg.currency || "usd").toLowerCase();

      if (currency === null) {

        currency = cur;

      } else if (cur !== currency) {

        return res.status(400).json({

          error: "All cart items must use the same currency for one Stripe Checkout session."

        });

      }



      lineItems.push({

        quantity: 1,

        price_data: {

          currency: cur,

          unit_amount: unitAmount,

          product_data: {

            name: pkg.name,

            description: pkg.description?.slice(0, 200) || undefined

          }

        }

      });

    }



    const session = await stripe.checkout.sessions.create({

      mode: "payment",

      payment_method_types: ["card"],

      line_items: lineItems,

      customer_email: customer.discord_email || undefined,

      metadata: {

        packageIds: JSON.stringify(ids),

        packageId: ids.length === 1 ? ids[0] : "",

        discordId: String(customer.discord_id)

      },

      success_url: `${config.frontendUrl}/success/?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url: `${config.frontendUrl}/cart/?checkout=cancelled`

    });



    return res.json({ url: session.url, sessionId: session.id });

  } catch (err) {

    console.error("[checkout]", err);

    return res.status(500).json({ error: "Could not start checkout." });

  }

});

