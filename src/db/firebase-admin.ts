import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import fs from "fs";
import path from "path";
import { isR2Enabled, uploadToR2, deleteFromR2, getR2FileUrl } from "./r2-admin.js";

// Load config to get projectId and storageBucket
let firebaseConfig: any = {};
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
if (fs.existsSync(configPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

export const isFirebaseEnabled = false;

let appInstance: any = null;
let hasAdminPermissions = false;

if (isFirebaseEnabled && getApps().length === 0) {
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountKey) {
      let credentialObj;
      try {
        credentialObj = JSON.parse(serviceAccountKey);
        appInstance = initializeApp({
          credential: cert(credentialObj),
          projectId: firebaseConfig.projectId,
          storageBucket: firebaseConfig.storageBucket || `${firebaseConfig.projectId}.firebasestorage.app`,
        });
        hasAdminPermissions = true;
        console.log("Firebase Admin initialized with Service Account successfully!");
      } catch (e) {
        console.error("Lỗi parse FIREBASE_SERVICE_ACCOUNT_KEY. Vui lòng đảm bảo nó là chuỗi JSON hợp lệ.");
      }
    } else {
      console.warn("⚠️ KHÔNG TÌM THẤY FIREBASE_SERVICE_ACCOUNT_KEY trong môi trường (Secrets).");
      console.warn("⚠️ Firebase Admin SDK sẽ bị vô hiệu hóa. Ứng dụng sẽ chuyển về dùng Local Storage (db.json).");
      console.warn("⚠️ Để kết nối Backend với Firestore, vui lòng thêm FIREBASE_SERVICE_ACCOUNT_KEY vào Settings > Environment Variables.");
      
      // Khởi tạo không có credential chỉ để auth verifyToken hoạt động (không thể truy cập Firestore)
      appInstance = initializeApp({
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket || `${firebaseConfig.projectId}.firebasestorage.app`,
      });
    }
  } catch (err) {
    console.error("Error initializing Firebase Admin:", err);
  }
} else if (isFirebaseEnabled) {
  appInstance = getApps()[0];
  hasAdminPermissions = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY || !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

// Nếu không có quyền Admin, ta không export dbAdmin để Users Service tự động fallback về db.json
export const dbAdmin = (isFirebaseEnabled && hasAdminPermissions) ? getFirestore(appInstance, firebaseConfig.firestoreDatabaseId) : null;
export const authAdmin = isFirebaseEnabled ? getAuth(appInstance) : null;
export const storageAdmin = (isFirebaseEnabled && hasAdminPermissions) ? getStorage(appInstance) : null;

export function extractStoragePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    try {
      if (urlOrPath.includes("firebasestorage.googleapis.com")) {
        const url = new URL(urlOrPath);
        const parts = url.pathname.split("/o/");
        if (parts.length > 1) {
          const rawPath = parts[1];
          return decodeURIComponent(rawPath);
        }
      }
    } catch (e) {
      console.error("Error parsing URL in extractStoragePath:", e);
    }
  }
  return urlOrPath;
}

export async function signUrlIfNeeded(storagePath: string | null | undefined): Promise<string> {
  if (!storagePath) return "";
  if (
    storagePath.startsWith("http://") || 
    storagePath.startsWith("https://") || 
    storagePath.startsWith("/api/") || 
    storagePath.startsWith("data:")
  ) {
    return storagePath;
  }
  if (isR2Enabled) {
    return getR2FileUrl(storagePath);
  }
  if (!isFirebaseEnabled || !storageAdmin) {
    return storagePath;
  }
  try {
    const bucketName = firebaseConfig.storageBucket || `${firebaseConfig.projectId}.firebasestorage.app`;
    const encodedPath = encodeURIComponent(storagePath);
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`;
  } catch (err) {
    console.error("Error creating download URL:", err);
    return storagePath;
  }
}

export async function uploadToStorage(buffer: Buffer, mimeType: string, storagePath: string): Promise<string> {
  if (isR2Enabled) {
    return uploadToR2(buffer, mimeType, storagePath);
  }
  if (!isFirebaseEnabled || !storageAdmin) {
    throw new Error("Firebase Admin is not enabled");
  }
  const bucket = storageAdmin.bucket();
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
    },
    public: true,
  });
  return storagePath;
}

export async function deleteStorageFileIfNeeded(urlOrPath: string | null | undefined): Promise<void> {
  if (!urlOrPath) return;
  if (isR2Enabled) {
    const storagePath = extractStoragePath(urlOrPath) || urlOrPath;
    await deleteFromR2(storagePath);
    return;
  }
  const storagePath = extractStoragePath(urlOrPath);
  if (storagePath && isFirebaseEnabled && storageAdmin) {
    try {
      const bucket = storageAdmin.bucket();
      await bucket.file(storagePath).delete();
    } catch (err: any) {
      console.warn("Lỗi khi xóa file trên Firebase Storage:", err.message || err);
    }
  }
}
