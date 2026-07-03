// Firebase Admin is disabled. All server-side operations use Supabase.
// This file is kept as a stub for compatibility with server.ts imports.

export const isFirebaseEnabled = false;
export const storageAdmin = null;
export const dbAdmin = null;
export const authAdmin = null;

export const extractStoragePath = (_urlOrPath: string): string | null => null;
export const signUrlIfNeeded = async (urlOrPath: string): Promise<string> => urlOrPath;
export const uploadToStorage = async (_file: Buffer | Uint8Array, _path: string, _mimeType: string): Promise<string> => {
  throw new Error("Firebase storage is disabled. Use Supabase storage instead.");
};
export const deleteStorageFileIfNeeded = async (_urlOrPath: string): Promise<void> => {};
