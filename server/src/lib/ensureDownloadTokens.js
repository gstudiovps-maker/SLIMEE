import { query } from "../db.js";
import { logDownload } from "./downloadLog.js";

export async function ensureDownloadTokensTable() {
  try {
    await query(`SELECT 1 FROM download_tokens LIMIT 1`);
    logDownload("token_table_ok", { storage: "postgresql:download_tokens" });
    return true;
  } catch (err) {
    if (err.code === "42P01") {
      logDownload("token_table_missing", {
        error: "download_tokens table does not exist",
        fix: "Run: npm run db:migrate"
      });
      return false;
    }
    logDownload("token_table_check_error", { error: err.message, code: err.code });
    return false;
  }
}
