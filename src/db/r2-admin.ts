import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Read environment variables
export const r2AccountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
export const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID || "";
export const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
export const r2BucketName = process.env.R2_BUCKET_NAME || "hanyubucket";
export const r2PublicUrl = process.env.R2_PUBLIC_URL || "";

export const isR2Enabled = !!(r2AccountId && r2AccessKeyId && r2SecretAccessKey);

let s3ClientInstance: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!isR2Enabled) {
    throw new Error("Cloudflare R2 is not configured. Please set CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.");
  }
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
      region: "auto",
    });
  }
  return s3ClientInstance;
}

/**
 * Uploads a buffer to Cloudflare R2 storage
 */
export async function uploadToR2(buffer: Buffer, mimeType: string, storagePath: string): Promise<string> {
  const client = getR2Client();
  const cleanPath = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;

  await client.send(
    new PutObjectCommand({
      Bucket: r2BucketName,
      Key: cleanPath,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return cleanPath;
}

/**
 * Deletes a file from Cloudflare R2 storage
 */
export async function deleteFromR2(storagePath: string): Promise<void> {
  if (!isR2Enabled) return;
  try {
    const client = getR2Client();
    const cleanPath = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
    await client.send(
      new DeleteObjectCommand({
        Bucket: r2BucketName,
        Key: cleanPath,
      })
    );
  } catch (err: any) {
    console.error("Error deleting file from Cloudflare R2:", err.message || err);
  }
}

/**
 * Downloads a file from Cloudflare R2 as a Uint8Array or stream
 */
export async function getR2FileStream(storagePath: string) {
  const client = getR2Client();
  const cleanPath = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
  const response = await client.send(
    new GetObjectCommand({
      Bucket: r2BucketName,
      Key: cleanPath,
    })
  );
  return response;
}

/**
 * Generates an access URL for an R2 file
 */
export async function getR2FileUrl(storagePath: string): Promise<string> {
  if (!storagePath) return "";
  
  // If it's already a full URL, return it
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return storagePath;
  }

  const cleanPath = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;

  if (r2PublicUrl) {
    // Ensure r2PublicUrl doesn't end with slash and cleanPath doesn't start with slash
    const baseUrl = r2PublicUrl.endsWith("/") ? r2PublicUrl.slice(0, -1) : r2PublicUrl;
    return `${baseUrl}/${cleanPath}`;
  }

  // Fallback to proxy route
  return `/api/r2-file?path=${encodeURIComponent(cleanPath)}`;
}
