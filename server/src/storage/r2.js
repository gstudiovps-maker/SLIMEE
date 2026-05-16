import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertValidStorageKey } from "./keys.js";

const DEFAULT_SIGNED_URL_TTL_SECONDS = 600;

function isNotFoundError(err) {
  const code = err?.name || err?.Code;
  const status = err?.$metadata?.httpStatusCode;
  return code === "NoSuchKey" || code === "NotFound" || status === 404;
}

export class R2StorageProvider {
  constructor({ bucket, endpoint, accessKeyId, secretAccessKey, signedUrlTtlSeconds }) {
    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "R2 storage requires R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY"
      );
    }

    this.bucket = bucket;
    this.signedUrlTtlSeconds = signedUrlTtlSeconds || DEFAULT_SIGNED_URL_TTL_SECONDS;
    this.client = new S3Client({
      region: "auto",
      endpoint: endpoint.replace(/\/$/, ""),
      credentials: {
        accessKeyId,
        secretAccessKey
      },
      forcePathStyle: true
    });
  }

  async uploadBuffer(storageKey, buffer, options = {}) {
    const key = assertValidStorageKey(storageKey);
    const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType || "application/octet-stream"
      })
    );

    return { storageKey: key, byteSize: body.length };
  }

  async getObject(storageKey) {
    const key = assertValidStorageKey(storageKey);

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key
        })
      );
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  async deleteObject(storageKey) {
    const key = assertValidStorageKey(storageKey);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    );
  }

  async exists(storageKey) {
    const key = assertValidStorageKey(storageKey);
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key
        })
      );
      return true;
    } catch (err) {
      if (isNotFoundError(err)) return false;
      throw err;
    }
  }

  /**
   * Presigned GET URL — time-limited; does not expose a public bucket URL.
   */
  async createSignedDownloadUrl(storageKey, options = {}) {
    const key = assertValidStorageKey(storageKey);
    const expiresIn = Math.min(
      Math.max(Number(options.expiresInSeconds) || this.signedUrlTtlSeconds, 60),
      3600
    );

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: options.downloadFilename
        ? `attachment; filename="${String(options.downloadFilename).replace(/"/g, "")}"`
        : undefined
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async saveFromBuffer(storageKey, buffer, options) {
    return this.uploadBuffer(storageKey, buffer, options);
  }

  async readBuffer(storageKey) {
    return this.getObject(storageKey);
  }

  async delete(storageKey) {
    return this.deleteObject(storageKey);
  }
}
