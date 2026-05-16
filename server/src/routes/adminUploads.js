import express from "express";
import multer from "multer";
import { config } from "../config.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { getPackageById } from "../lib/packages.js";
import { buildSourceStorageKey, getStorage } from "../storage/index.js";
import { upsertPackageSourceFile, getPackageSourceFile } from "../lib/packageFiles.js";
import { logAdminActivity } from "../lib/adminLog.js";

export const adminUploadsRouter = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 }
});

function clientIp(req) {
  return req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || null;
}

adminUploadsRouter.post(
  "/:packageId/source-zip",
  requireAdmin,
  upload.single("sourceZip"),
  async (req, res) => {
    try {
      const packageId = String(req.params.packageId || "").trim();
      const pkg = await getPackageById(packageId, { publishedOnly: false, bypassCache: true });
      if (!pkg) {
        return res.status(404).json({ error: "Package not found" });
      }

      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: "sourceZip file is required (multipart field name: sourceZip)" });
      }

      if (!req.file.originalname?.toLowerCase().endsWith(".zip")) {
        return res.status(400).json({ error: "Only .zip development packages are accepted" });
      }

      const storageKey = buildSourceStorageKey(packageId);
      await getStorage().saveFromBuffer(storageKey, req.file.buffer);

      const record = await upsertPackageSourceFile({
        packageId,
        storageKey,
        originalFilename: req.file.originalname,
        byteSize: req.file.size,
        uploadedBy: req.admin.username
      });

      await logAdminActivity({
        adminUserId: req.admin.id,
        adminUsername: req.admin.username,
        action: "package_source_upload",
        resourceType: "package",
        resourceId: packageId,
        details: { byteSize: req.file.size, storageKey: "[redacted]" },
        ipAddress: clientIp(req)
      });

      return res.json({
        ok: true,
        packageId,
        uploaded: {
          originalFilename: record.original_filename,
          byteSize: record.byte_size,
          uploadedAt: record.uploaded_at,
          hasSource: true
        }
      });
    } catch (err) {
      console.error("[admin upload]", err);
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: `ZIP exceeds ${config.maxUploadMb}MB limit` });
      }
      return res.status(500).json({ error: "Upload failed" });
    }
  }
);

adminUploadsRouter.get("/:packageId/source-zip", requireAdmin, async (req, res) => {
  const packageId = String(req.params.packageId || "").trim();
  const row = await getPackageSourceFile(packageId);
  if (!row) {
    return res.json({ hasSource: false });
  }
  return res.json({
    hasSource: true,
    originalFilename: row.original_filename,
    byteSize: row.byte_size,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by
  });
});
