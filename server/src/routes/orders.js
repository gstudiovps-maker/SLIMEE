import express from "express";

import Stripe from "stripe";

import { config } from "../config.js";

import { createLicense, findLicensesByStripeSession } from "../lib/licenses.js";

import { getPackageById } from "../lib/packages.js";



const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;



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



export const ordersRouter = express.Router();



/**

 * GET /api/orders/session/:sessionId

 * Success page — returns all licenses for cart or single-package checkout.

 */

ordersRouter.get("/session/:sessionId", async (req, res) => {

  try {

    if (!stripe) {

      return res.status(503).json({ error: "Stripe not configured" });

    }



    const { sessionId } = req.params;

    const session = await stripe.checkout.sessions.retrieve(sessionId);



    if (session.payment_status !== "paid") {

      return res.status(402).json({ error: "Payment not completed", status: session.payment_status });

    }



    const ids = packageIdsFromSession(session);

    const email = session.customer_details?.email || session.customer_email;

    const discordId = String(session.metadata?.discordId || "").trim() || null;

    const pi =

      typeof session.payment_intent === "string"

        ? session.payment_intent

        : session.payment_intent?.id;



    for (const packageId of ids) {

      await createLicense({

        packageId,

        customerEmail: email,

        discordId,

        stripeSessionId: session.id,

        stripePaymentIntent: pi

      });

    }

    if (email) {
      const { linkLicensesForCheckoutEmail } = await import("../lib/customers.js");
      const { syncRolesAfterPurchase } = await import("../lib/discordRoleSync.js");
      await linkLicensesForCheckoutEmail(email);
      await syncRolesAfterPurchase(email);
    }

    const rows = await findLicensesByStripeSession(session.id);

    if (!rows.length) {

      return res.status(404).json({ error: "License not found for this session" });

    }



    const licenses = await Promise.all(
      rows.map(async (license) => {
        const pkg = await getPackageById(license.package_id);
        return {
          licenseKey: license.license_key,
          packageId: license.package_id,
          packageName: pkg?.name || license.package_id,
          status: license.status
        };
      })
    );



    const first = licenses[0];

    return res.json({

      email,

      licenses,

      licenseKey: first.licenseKey,

      packageId: first.packageId,

      packageName: first.packageName,

      status: first.status

    });

  } catch (err) {

    console.error("[orders/session]", err);

    return res.status(500).json({ error: "Could not load order" });

  }

});

