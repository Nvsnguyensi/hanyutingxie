import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_DATABASE_URL || "";
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
export const isSupabaseEnabled = !!(supabaseUrl && supabaseServiceKey);

export const supabaseAdmin = isSupabaseEnabled
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export function extractSupabaseStoragePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  try {
    if (urlOrPath.includes("/storage/v1/object/public/")) {
      const parts = urlOrPath.split("/storage/v1/object/public/");
      if (parts.length > 1) {
        return parts[1];
      }
    }
  } catch (err) {
    console.error("Lỗi trích xuất đường dẫn lưu trữ Supabase:", err);
  }
  return null;
}

export async function deleteSupabaseStorageFileIfNeeded(urlOrPath: string | null | undefined): Promise<void> {
  if (!isSupabaseEnabled || !supabaseAdmin || !urlOrPath) return;
  const path = extractSupabaseStoragePath(urlOrPath);
  if (!path) return;

  try {
    const parts = path.split("/");
    if (parts.length > 1) {
      const bucket = parts[0];
      const fileKey = parts.slice(1).join("/");
      await supabaseAdmin.storage.from(bucket).remove([fileKey]);
    }
  } catch (err) {
    console.error("Lỗi khi xóa file trên Supabase Storage:", err);
  }
}

export async function uploadToSupabaseStorage(buffer: Buffer, mimeType: string, storagePath: string): Promise<string> {
  if (!isSupabaseEnabled || !supabaseAdmin) {
    throw new Error("Supabase chưa được cấu hình.");
  }

  const parts = storagePath.split("/");
  const bucket = parts[0] || "audio";
  const fileKey = parts.slice(1).join("/") || `${Date.now()}.mp3`;

  const { data, error } = await supabaseAdmin.storage.from(bucket).upload(fileKey, buffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Lỗi tải lên Supabase Storage: ${error.message}`);
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(fileKey);
  return publicUrlData.publicUrl;
}
