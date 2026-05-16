import { query } from "../db.js";
import { getStorage } from "../storage/index.js";

export async function getPackageSourceFile(packageId) {
  const result = await query(
    `SELECT package_id, storage_key, original_filename, byte_size, uploaded_by, uploaded_at
     FROM package_source_files WHERE package_id = $1`,
    [packageId]
  );
  return result.rows[0] || null;
}

export async function upsertPackageSourceFile({
  packageId,
  storageKey,
  originalFilename,
  byteSize,
  uploadedBy
}) {
  const existing = await getPackageSourceFile(packageId);
  if (existing?.storage_key && existing.storage_key !== storageKey) {
    try {
      await getStorage().delete(existing.storage_key);
    } catch {
      /* ignore cleanup errors */
    }
  }

  await query(
    `INSERT INTO package_source_files (package_id, storage_key, original_filename, byte_size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (package_id) DO UPDATE
     SET storage_key = EXCLUDED.storage_key,
         original_filename = EXCLUDED.original_filename,
         byte_size = EXCLUDED.byte_size,
         uploaded_by = EXCLUDED.uploaded_by,
         uploaded_at = NOW()`,
    [packageId, storageKey, originalFilename || null, byteSize, uploadedBy || null]
  );

  return getPackageSourceFile(packageId);
}

export async function deletePackageSourceFile(packageId) {
  const row = await getPackageSourceFile(packageId);
  if (!row) {
    return false;
  }
  await getStorage().delete(row.storage_key);
  await query(`DELETE FROM package_source_files WHERE package_id = $1`, [packageId]);
  return true;
}

export async function readPackageSourceBuffer(packageId) {
  const row = await getPackageSourceFile(packageId);
  if (!row) {
    return null;
  }
  return getStorage().readBuffer(row.storage_key);
}
