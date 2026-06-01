import express from "express";

import Stripe from "stripe";

import { config } from "../config.js";

import { createLicense } from "../lib/licenses.js";



const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;



export const webhooksRouter = express.Router();



function packageIdsFromSession(session) {

  const raw = session.metadata?.packageIds;

  if (raw) {

    try {

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {

        return [...new Set(parsed.map((id) => String(id).trim()).filter(Boolean))];

      }

    } catch {

      /* fall through */

    }

  }

  const single = session.metadata?.packageId;

  if (single && String(single).trim()) {

    return [String(single).trim()];

  }

  return [];

}



webhooksRouter.post(

  "/stripe",

  express.raw({ type: "application/json" }),

  async (req, res) => {

    if (!stripe || !config.stripeWebhookSecret) {

      return res.status(503).send("Stripe webhook not configured");

    }



    const signature = req.headers["stripe-signature"];

    let event;



    try {

      event = stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret);

    } catch (err) {

      console.error("[webhook] Signature verification failed:", err.message);

      return res.status(400).send(`Webhook Error: ${err.message}`);

    }



    try {

      if (event.type === "checkout.session.completed") {

        const session = event.data.object;

        const ids = packageIdsFromSession(session);



        if (!ids.length) {

          console.warn("[webhook] checkout.session.completed missing packageIds/packageId metadata");

          return res.json({ received: true });

        }



        const email = session.customer_details?.email || session.customer_email;

        const discordId = String(session.metadata?.discordId || "").trim() || null;

        const pi =

          typeof session.payment_intent === "string"

            ? session.payment_intent

            : session.payment_intent?.id;



        const { linkLicensesForCheckoutEmail } = await import("../lib/customers.js");

        for (const packageId of ids) {

          await createLicense({

            packageId,

            customerEmail: email,

            discordId,

            stripeSessionId: session.id,

            stripePaymentIntent: pi

          });

          console.log("[webhook] License ensured for", packageId, session.id);

        }

        if (email) {
          await linkLicensesForCheckoutEmail(email);
          const { syncRolesAfterPurchase } = await import("../lib/discordRoleSync.js");
          await syncRolesAfterPurchase(email);
        }

      }

    } catch (err) {

      console.error("[webhook] Handler error:", err);

      return res.status(500).json({ error: "Webhook handler failed" });

    }



    return res.json({ received: true });

  }

);

