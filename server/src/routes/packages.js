import express from "express";
import { loadPackages } from "../lib/packages.js";

export const packagesRouter = express.Router();

packagesRouter.get("/", async (_req, res) => {
  try {
    const packages = await loadPackages({ publishedOnly: true });
    return res.json({ packages });
  } catch (err) {
    console.error("[packages]", err);
    return res.status(500).json({ error: "Could not load catalog" });
  }
});
