import express from "express";
import cors from "cors";
import { config, assertConfig } from "./config.js";
import { checkoutRouter } from "./routes/checkout.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { licensesRouter } from "./routes/licenses.js";
import { downloadsRouter } from "./routes/downloads.js";
import { ordersRouter } from "./routes/orders.js";
import { packagesRouter } from "./routes/packages.js";
import { adminRouter } from "./routes/admin.js";
import { adminUploadsRouter } from "./routes/adminUploads.js";
import { adminLicensesRouter } from "./routes/adminLicenses.js";
import { seedAdminsFromEnv } from "./lib/adminSeed.js";
import { seedPackagesFromJsonIfEmpty } from "./lib/packages.js";
import { logAdminStartupDiagnostics } from "./lib/adminAuthLog.js";

assertConfig();

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "slimee-store-api" });
});

// Stripe webhook must receive raw body (mounted before express.json)
app.use("/api/webhooks", webhooksRouter);

app.use(
  cors({
    origin(origin, callback) {
      if (config.nodeEnv !== "production") {
        callback(null, true);
        return;
      }
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    }
  })
);

app.use(express.json({ limit: "1mb" }));

app.use("/api/packages", packagesRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/licenses", licensesRouter);
app.use("/api/downloads", downloadsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/uploads", adminUploadsRouter);
app.use("/api/admin/licenses", adminLicensesRouter);

app.use((err, req, res, _next) => {
  if (err.message === "Not allowed by CORS") {
    console.warn(
      `[cors] blocked origin=${req.headers.origin || "(none)"} path=${req.method} ${req.path}`
    );
    return res.status(403).json({ error: "CORS blocked" });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

async function bootstrap() {
  try {
    await logAdminStartupDiagnostics();
    await seedPackagesFromJsonIfEmpty();
    await seedAdminsFromEnv();
    await logAdminStartupDiagnostics();
  } catch (err) {
    console.error("[bootstrap]", err);
  }
}

app.listen(config.port, () => {
  console.log(`Slimee API listening on port ${config.port}`);
  console.log(`Frontend URL: ${config.frontendUrl}`);
  bootstrap();
});
