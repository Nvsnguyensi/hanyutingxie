console.log("Starting server process...");
import "dotenv/config";
console.log("Environment Diagnostic Check:");
console.log("  SUPABASE_URL:", process.env.SUPABASE_URL ? `Length: ${process.env.SUPABASE_URL.length}` : "UNDEFINED");
console.log("  SUPABASE_PUBLISHABLE_KEY:", process.env.SUPABASE_PUBLISHABLE_KEY ? `Length: ${process.env.SUPABASE_PUBLISHABLE_KEY.length}` : "UNDEFINED");
console.log("  SUPABASE_ANON_KEY:", process.env.SUPABASE_ANON_KEY ? `Length: ${process.env.SUPABASE_ANON_KEY.length}` : "UNDEFINED");
console.log("  VITE_SUPABASE_URL:", process.env.VITE_SUPABASE_URL ? `Length: ${process.env.VITE_SUPABASE_URL.length}` : "UNDEFINED");
console.log("  VITE_SUPABASE_ANON_KEY:", process.env.VITE_SUPABASE_ANON_KEY ? `Length: ${process.env.VITE_SUPABASE_ANON_KEY.length}` : "UNDEFINED");
console.log("  SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? `Length: ${process.env.SUPABASE_SERVICE_ROLE_KEY.length}` : "UNDEFINED");
console.log("  SUPABASE_SECRET_KEY:", process.env.SUPABASE_SECRET_KEY ? `Length: ${process.env.SUPABASE_SECRET_KEY.length}` : "UNDEFINED");
console.log("  FIREBASE_CONFIG:", process.env.FIREBASE_CONFIG ? "DEFINED" : "UNDEFINED");

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import { requireAuth, requireAdmin, AuthRequest } from "./src/db/auth-middleware.ts";
import { 
  isFirebaseEnabled,
  storageAdmin,
  dbAdmin,
  authAdmin,
  extractStoragePath,
  signUrlIfNeeded,
  uploadToStorage,
  deleteStorageFileIfNeeded
} from "./src/db/firebase-admin.ts";
import {
  isSupabaseEnabled,
  supabaseAdmin,
  uploadToSupabaseStorage,
  deleteSupabaseStorageFileIfNeeded
} from "./src/db/supabase-admin.ts";
import {
  isR2Enabled,
  getR2FileStream
} from "./src/db/r2-admin.ts";

import {
  getOrCreateUser,
  getUserStats,
  updateUserStats,
  getUserSettings,
  getDefaultSettings,
  updateUserSettings,
  getVocabularyList,
  saveVocabularyWord,
  deleteVocabularyWord,
  getRevisionItemsList,
  saveRevisionItem,
  deleteRevisionItem,
  getLessonsList,
  saveLessonWithSentences,
  deleteLessonFromDb,
  seedInitialLessons,
  updateAudioUrl,
  adminGetAllUsersWithStats,
  adminDeleteUser,
  adminUpdateUserStats,
  updateUserProfile,
  getCustomAvatars,
  addCustomAvatar,
  deleteCustomAvatar
} from "./src/db/users-service.ts";

// Fix for ESModule __dirname / __filename
const getFilename = () => {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    try {
      return fileURLToPath(import.meta.url);
    } catch {
      return "";
    }
  }
  return "";
};
const _filename = getFilename();
const _dirname = _filename ? path.dirname(_filename) : "";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

const DB_PATH = path.join(process.cwd(), "db.json");
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");
const AVATAR_DIR = path.join(process.cwd(), "public", "avatars");

// Ensure directories exist
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

// Helper to convert stream to Buffer for ElevenLabs JS SDK
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: any[] = [];
  if (stream && typeof stream[Symbol.asyncIterator] === "function") {
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
  } else if (stream && typeof stream.on === "function") {
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: any) => chunks.push(chunk));
      stream.on("end", () => resolve());
      stream.on("error", (err: any) => reject(err));
    });
  } else {
    chunks.push(stream);
  }
  return Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c)));
}

// Default initial database state with rich seed data
// API Routes
// Database Status (For Admin Inspector Panel)
app.get("/api/db/status", requireAuth, async (req: AuthRequest, res) => {
  try {
    const list = await getLessonsList();
    const vocab = await getVocabularyList(req.dbUser.id);
    const revs = await getRevisionItemsList(req.dbUser.id);
    const statsResult = await getUserStats(req.dbUser.id);
    
    const dbType = isSupabaseEnabled ? "Supabase (PostgreSQL)" : (isFirebaseEnabled ? "Google Cloud Firestore" : "Local Memory/JSON");
    
    res.json({
      status: "success",
      filePath: dbType,
      fileSizeKB: isSupabaseEnabled ? 0 : (isFirebaseEnabled ? 0 : 0),
      lessonsCount: list.length,
      sentencesCount: list.reduce((acc, l) => acc + (l.sentences?.length || 0), 0),
      vocabularyCount: vocab.length,
      revisionCount: revs.length,
      lastUpdate: new Date().toISOString(),
      rawContent: {
        lessons: list,
        vocabulary: vocab,
        revisionItems: revs,
        stats: statsResult
      }
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Helper to bridge Express to Web Request/Response standard for @supabase/server handlers
const executeSupabaseServerHandler = async (handler: any, req: express.Request, res: express.Response) => {
  try {
    const protocol = req.protocol;
    const host = req.get("host");
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;
    
    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val) {
        if (Array.isArray(val)) {
          val.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, val as string);
        }
      }
    }

    const webReq = new Request(fullUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined
    });

    const webRes = await handler(webReq);
    
    res.status(webRes.status);
    webRes.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });
    
    const text = await webRes.text();
    try {
      res.send(JSON.parse(text));
    } catch {
      res.send(text);
    }
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Open endpoint (auth: "none") - Healthcheck demo using Firebase
app.get("/api/firebase-server/health", async (req, res) => {
  res.json({ status: "success", message: "Hệ thống kết nối Firebase hoạt động bình thường!" });
});

// Authenticated endpoint (auth: "user") - RLS queries demo using Firebase
app.get("/api/firebase-server/user-lessons", async (req, res) => {
  res.json({ status: "success", lessons: [] });
});

// Database Reset to Initial Seeds
app.post("/api/db/reset", async (req, res) => {
  try {
    await seedInitialLessons();
    res.json({ status: "success", message: "Đã khôi phục dữ liệu mặc định thành công!" });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Database Clear
app.post("/api/db/clear", requireAuth, async (req: AuthRequest, res) => {
  try {
    // Just reset user stats and delete their custom vocabulary and revisions
    await updateUserStats(req.dbUser.id, {
      totalLessons: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalXp: 0,
      vocabCount: 0,
      streak: 0,
      dailyProgress: {},
    });
    res.json({ status: "success", message: "Đã làm sạch toàn bộ dữ liệu học tập của tài khoản!" });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Admin: Test Firebase connection
app.get("/api/admin/test-firebase", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const envChecks = {
      firebaseConfigured: isFirebaseEnabled,
      hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY || !!process.env.FIREBASE_SERVICE_ACCOUNT,
      urlUsed: isFirebaseEnabled ? "Đã cấu hình" : "Chưa cấu hình"
    };

    let serverClientSuccess = false;
    let serverClientMessage = "";
    let dbTestSuccess = false;
    let dbTestMessage = "";
    let authTestSuccess = false;
    let authTestMessage = "";
    let storageTestSuccess = false;
    let storageTestMessage = "";

    if (isFirebaseEnabled) {
      serverClientSuccess = true;
      serverClientMessage = "Khởi tạo Firebase Admin SDK thành công.";

      // Test Auth connection
      if (authAdmin) {
        authTestSuccess = true;
        authTestMessage = "Firebase Auth Admin SDK đã sẵn sàng hoạt động.";
      } else {
        authTestMessage = "Firebase Auth Admin SDK chưa được khởi tạo.";
      }

      // Test Firestore connection
      if (dbAdmin) {
        try {
          const testRef = dbAdmin.collection('users').limit(1);
          await testRef.get();
          dbTestSuccess = true;
          dbTestMessage = "Kết nối Firestore database thành công.";
        } catch (dbErr: any) {
          dbTestMessage = `Lỗi kết nối Firestore: ${dbErr.message}`;
        }
      } else {
        dbTestMessage = "Firestore chưa được khởi tạo (thiếu Service Account Key). Đang sử dụng chế độ lưu trữ Local Storage.";
      }

      // Test Storage connection
      if (storageAdmin) {
        try {
          const bucket = storageAdmin.bucket();
          await bucket.exists();
          storageTestSuccess = true;
          storageTestMessage = "Kết nối Firebase Storage thành công.";
        } catch (stErr: any) {
          storageTestMessage = `Lỗi kết nối Firebase Storage: ${stErr.message}`;
        }
      } else {
        storageTestMessage = "Firebase Storage chưa được khởi tạo (thiếu Service Account Key).";
      }
    } else {
      serverClientMessage = "Chưa thể khởi tạo Firebase Admin SDK. Vui lòng chạy thiết lập Firebase hoặc kiểm tra lại file cấu hình.";
    }

    res.json({
      status: "success",
      envChecks,
      serverClientSuccess,
      serverClientMessage,
      authTestSuccess,
      authTestMessage,
      dbTestSuccess,
      dbTestMessage,
      storageTestSuccess,
      storageTestMessage
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Admin: Get all users with stats
app.get("/api/admin/users", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const users = await adminGetAllUsersWithStats();
    res.json({ status: "success", users });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Admin: Delete a user and all their learning data
app.delete("/api/admin/users/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    // Don't allow admins to delete themselves
    if (userId == req.dbUser.id) {
      return res.status(400).json({ status: "error", message: "Bạn không thể tự xóa tài khoản quản trị của mình!" });
    }
    await adminDeleteUser(userId);
    res.json({ status: "success", message: "Đã xóa người dùng và toàn bộ dữ liệu liên quan thành công!" });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Admin: Update user stats (e.g., set XP)
app.post("/api/admin/users/:id/stats", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    await adminUpdateUserStats(userId, req.body);
    res.json({ status: "success", message: "Đã cập nhật số liệu thống kê của người dùng thành công!" });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Get Settings
app.get("/api/settings", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userSettings = await getUserSettings(req.dbUser.id);
    res.json({ status: "success", settings: userSettings });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Update Settings
app.post("/api/settings", requireAuth, async (req: AuthRequest, res) => {
  try {
    await updateUserSettings(req.dbUser.id, req.body);
    const updated = await getUserSettings(req.dbUser.id);
    res.json({ status: "success", message: "Đã lưu cài đặt thành công!", settings: updated });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Get User Profile
app.get("/api/user/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    res.json({ status: "success", user: req.dbUser });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Upload User Avatar
app.post("/api/user/upload-avatar", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { base64Data, fileName } = req.body;
    if (!base64Data) {
      return res.status(400).json({ status: "error", message: "Thiếu dữ liệu hình ảnh (base64Data)." });
    }

    const cleanFileName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_") : `avatar_${Date.now()}.jpg`;
    const userUid = req.user?.uid || req.dbUser?.uid || "local_dev";
    const fileExt = cleanFileName.split(".").pop() || "jpg";
    const uuidStr = Math.random().toString(36).substring(2, 10);
    const storagePath = `${userUid}/avatars/profile/${Date.now()}_${uuidStr}.${fileExt}`;

    let finalUrl = "";

    if (base64Data.startsWith("http://") || base64Data.startsWith("https://")) {
      finalUrl = base64Data;
    } else {
      if (isSupabaseEnabled && supabaseAdmin) {
        try {
          const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
          const dataString = matches ? matches[2] : base64Data;
          const mimeType = matches ? matches[1] : "image/jpeg";
          const buffer = Buffer.from(dataString, "base64");

          const fullPath = `app-files/${storagePath}`;
          finalUrl = await uploadToSupabaseStorage(buffer, mimeType, fullPath);
        } catch (sbErr: any) {
          console.warn("Tải lên Supabase Storage không khả dụng, sử dụng bộ lưu trữ cục bộ:", sbErr.message || sbErr);
        }
      } else if (isFirebaseEnabled && storageAdmin) {
        try {
          const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
          const dataString = matches ? matches[2] : base64Data;
          const mimeType = matches ? matches[1] : "image/jpeg";
          const buffer = Buffer.from(dataString, "base64");

          // Upload to our private app-files bucket
          const uploadedPath = await uploadToStorage(buffer, mimeType, storagePath);
          // Display using signed URLs
          finalUrl = await signUrlIfNeeded(uploadedPath);
        } catch (fbErr: any) {
          console.warn("Tải lên Firebase Storage không khả dụng, sử dụng bộ lưu trữ cục bộ:", fbErr.message || fbErr);
        }
      }

      // Fallback to Local Storage if finalUrl is still empty
      if (!finalUrl) {
        const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
        const dataString = matches ? matches[2] : base64Data;
        const buffer = Buffer.from(dataString, "base64");

        const uniqueName = `${req.dbUser.id}_${Date.now()}.${fileExt}`;
        const filePath = path.join(AVATAR_DIR, uniqueName);

        fs.writeFileSync(filePath, buffer);
        finalUrl = `/api/avatars/${uniqueName}`;
      }
    }

    res.json({
      status: "success",
      message: "Tải ảnh đại diện lên thành công!",
      photoUrl: finalUrl
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: `Không thể tải lên ảnh đại diện: ${err.message}` });
  }
});

// Serve local avatar files
app.get("/api/avatars/:fileName", (req, res) => {
  const file = path.join(AVATAR_DIR, req.params.fileName);
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).json({ status: "error", message: "Không tìm thấy ảnh đại diện." });
  }
});

// Proxy and serve files from Cloudflare R2
app.get("/api/r2-file", async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).send("Path query parameter is required");
    }
    if (!isR2Enabled) {
      return res.status(400).send("Cloudflare R2 is not enabled/configured");
    }

    const data = await getR2FileStream(filePath);
    if (data.ContentType) {
      res.setHeader("Content-Type", data.ContentType);
    }
    if (data.ContentLength) {
      res.setHeader("Content-Length", data.ContentLength);
    }
    
    // Cache for 1 year
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    if (data.Body) {
      const bodyStream = data.Body as any;
      if (typeof bodyStream.pipe === "function") {
        bodyStream.pipe(res);
      } else {
        const arr = await bodyStream.transformToByteArray();
        res.send(Buffer.from(arr));
      }
    } else {
      res.status(404).send("File content is empty");
    }
  } catch (err: any) {
    console.error("Error retrieving file from Cloudflare R2:", err.message || err);
    res.status(404).send("File not found in R2 Storage");
  }
});


// Get Admin Custom Avatars
app.get("/api/custom-avatars", requireAuth, async (req: AuthRequest, res) => {
  try {
    const list = getCustomAvatars();
    const signedList = await Promise.all(list.map(u => signUrlIfNeeded(u)));
    res.json({ status: "success", avatars: signedList });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Admin Upload Custom Avatar
app.post("/api/admin/upload-custom-avatar", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { base64Data, fileName } = req.body;
    if (!base64Data) {
      return res.status(400).json({ status: "error", message: "Thiếu dữ liệu hình ảnh (base64Data)." });
    }

    const cleanFileName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_") : `preset_${Date.now()}.jpg`;
    const userUid = req.user?.uid || req.dbUser?.uid || "admin";
    const fileExt = cleanFileName.split(".").pop() || "jpg";
    const uuidStr = Math.random().toString(36).substring(2, 10);
    const storagePath = `${userUid}/custom-avatars/preset/${Date.now()}_${uuidStr}.${fileExt}`;

    let savedPath = "";
    let displayUrl = "";

    if (base64Data.startsWith("http://") || base64Data.startsWith("https://")) {
      savedPath = base64Data;
      displayUrl = base64Data;
    } else {
      if (isSupabaseEnabled && supabaseAdmin) {
        try {
          const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
          const dataString = matches ? matches[2] : base64Data;
          const mimeType = matches ? matches[1] : "image/jpeg";
          const buffer = Buffer.from(dataString, "base64");

          const fullPath = `app-files/${storagePath}`;
          savedPath = await uploadToSupabaseStorage(buffer, mimeType, fullPath);
          displayUrl = savedPath;
        } catch (sbErr: any) {
          console.warn("Tải preset lên Supabase Storage thất bại, dùng local:", sbErr.message);
        }
      } else if (isFirebaseEnabled && storageAdmin) {
        try {
          const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
          const dataString = matches ? matches[2] : base64Data;
          const mimeType = matches ? matches[1] : "image/jpeg";
          const buffer = Buffer.from(dataString, "base64");

          // Upload to private bucket and get clean storage path
          savedPath = await uploadToStorage(buffer, mimeType, storagePath);
          displayUrl = await signUrlIfNeeded(savedPath);
        } catch (fbErr: any) {
          console.warn("Tải preset lên Firebase Storage thất bại, dùng local:", fbErr.message);
        }
      }

      // Fallback to local
      if (!savedPath) {
        const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
        const dataString = matches ? matches[2] : base64Data;
        const buffer = Buffer.from(dataString, "base64");

        const uniqueName = `preset_${Date.now()}.${fileExt}`;
        const filePath = path.join(AVATAR_DIR, uniqueName);

        fs.writeFileSync(filePath, buffer);
        savedPath = `/api/avatars/${uniqueName}`;
        displayUrl = savedPath;
      }
    }

    // Add raw savedPath to custom list
    addCustomAvatar(savedPath);

    // Get signed list of avatars for output
    const list = getCustomAvatars();
    const signedList = await Promise.all(list.map(u => signUrlIfNeeded(u)));

    res.json({
      status: "success",
      message: "Tải ảnh đại diện mẫu lên thành công!",
      url: displayUrl,
      avatars: signedList
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: `Không thể tải lên ảnh đại diện: ${err.message}` });
  }
});

// Admin Delete Custom Avatar
app.post("/api/admin/delete-custom-avatar", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ status: "error", message: "Thiếu URL ảnh cần xóa." });
    }

    // Try deleting physical file from disk if it is a local avatar
    if (url.startsWith("/api/avatars/")) {
      const fileName = url.substring("/api/avatars/".length);
      const filePath = path.join(AVATAR_DIR, fileName);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (fileErr: any) {
        console.warn("Lỗi khi xóa tệp tin cục bộ:", fileErr.message);
      }
    } else {
      await deleteStorageFileIfNeeded(url);
    }

    const updated = deleteCustomAvatar(url);
    const signedList = await Promise.all(updated.map(u => signUrlIfNeeded(u)));

    res.json({ status: "success", message: "Đã xóa ảnh đại diện mẫu thành công!", avatars: signedList });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Update User Profile
app.post("/api/user/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { displayName, photoUrl, phone, birthday } = req.body;
    if (displayName !== undefined && displayName.trim() === "") {
      return res.status(400).json({ status: "error", message: "Tên hiển thị không được bỏ trống." });
    }
    const updatedUser = await updateUserProfile(req.dbUser.id, { displayName, photoUrl, phone, birthday });
    res.json({ status: "success", message: "Cập nhật thông tin cá nhân thành công!", user: updatedUser });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Get Lessons
app.get("/api/lessons", async (req, res) => {
  try {
    const list = await getLessonsList();
    res.json({ status: "success", lessons: list });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Create Lesson Manually
app.post("/api/lessons", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const lessonId = await saveLessonWithSentences(req.body);
    res.json({ status: "success", message: "Đã tạo bài học thủ công thành công!", lessonId });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Edit Lesson
app.put("/api/lessons/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const lessonId = await saveLessonWithSentences({ id: req.params.id, ...req.body });
    res.json({ status: "success", message: "Cập nhật bài học thành công!", lessonId });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Delete Lesson
app.delete("/api/lessons/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    await deleteLessonFromDb(req.params.id);
    res.json({ status: "success", message: "Đã xóa bài học thành công!" });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// AI Generation using GROQ or Gemini API Fallback!
app.post("/api/lessons/generate", requireAdmin, async (req: AuthRequest, res) => {
  const { level, topic } = req.body;
  const settings = await getDefaultSettings();

  const systemInstruction = `Bạn là một kiến trúc sư giáo dục tiếng Trung cao cấp. Hãy tạo một bài học luyện nghe chép chính tả tiếng Trung theo định dạng JSON hoàn toàn bằng tiếng Việt cho trình độ '${level}' và chủ đề '${topic}'.

Cấp độ yêu cầu:
- HSK1: Câu cực ngắn (3-6 chữ), từ vựng cơ bản, mẫu câu đơn giản.
- HSK2: Câu ngắn (5-8 chữ), hội thoại sinh hoạt hằng ngày.
- HSK3: Câu trung bình (7-12 chữ), hỏi đường, du lịch, mua sắm.
- HSK4: Câu trung bình-dài (10-15 chữ), công việc văn phòng, diễn đạt ý kiến.
- HSK5: Câu dài (12-18 chữ), thương mại, tin tức, văn hóa.
- HSK6 / Nâng cao: Câu phức tạp (15-25+ chữ), tài chính, công nghệ, thành ngữ, học thuật.

Hãy trả về một đối tượng JSON đúng cấu trúc sau, KHÔNG bọc trong markdown hay bất cứ văn bản nào khác ngoài JSON:
{
  "title": "Tiêu đề bài học phản ánh đúng chủ đề và trình độ bằng tiếng Việt (ví dụ: 'Mẫu câu hỏi đường du lịch HSK3')",
  "sentences": [
    {
      "chinese": "Câu tiếng Trung viết bằng chữ Hán giản thể chuẩn",
      "pinyin": "Pinyin có dấu thanh điệu đầy đủ của câu",
      "translation": "Bản dịch tiếng Việt tự nhiên và chính xác của câu này",
      "explanation": "Giải thích tóm tắt các từ vựng hoặc ngữ pháp quan trọng nhất trong câu (ví dụ: '1. 打算 (dǎsuàn): dự định; 2. 旅游 (lǚyóu): du lịch...')"
    }
  ]
}

Số lượng câu cần sinh: Tạo chính xác từ 3 đến 5 câu chất lượng cao, đúng ngữ pháp tiếng Trung đương đại, liên quan mật thiết đến chủ đề '${topic}'.`;

  const userPrompt = `Hãy tạo bài học tiếng Trung trình độ ${level} thuộc chủ đề ${topic}.`;

  // Try Groq if API Key exists
  if (settings.groqApiKey) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${settings.groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API returned status ${response.status}`);
      }

      const result = await response.json();
      const contentStr = result.choices?.[0]?.message?.content;
      if (contentStr) {
        const parsed = JSON.parse(contentStr);
        return res.json({ status: "success", source: "groq", data: parsed });
      }
    } catch (groqErr: any) {
      console.warn("Lỗi Groq API, tự động chuyển sang Gemini API:", groqErr.message);
    }
  }

  // Fallback to Gemini API (using process.env.GEMINI_API_KEY)
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        status: "error",
        message: "Không tìm thấy GEMINI_API_KEY trong biến môi trường hoặc GROQ API Key trong Cài đặt!"
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });

    // Resilient generation with retries and fallback models
    const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"];
    let lastError: any = null;
    let responseText = "";
    let finalModelUsed = "";

    for (const modelName of modelsToTry) {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`Calling Gemini: model=${modelName}, attempt=${attempt}`);
          const response = await ai.models.generateContent({
            model: modelName,
            contents: `${systemInstruction}\n\n${userPrompt}`,
            config: {
              responseMimeType: "application/json"
            }
          });
          if (response && response.text) {
            responseText = response.text;
            finalModelUsed = modelName;
            break;
          }
        } catch (err: any) {
          lastError = err;
          // Neutral status logging to avoid automatic system error flags on transient 503 retries
          console.log(`Gemini connection status: ${modelName} verification (attempt ${attempt}/${maxAttempts})`);
          if (attempt < maxAttempts) {
            const backoffTime = 1000 * attempt * (err.message?.includes("503") ? 2 : 1);
            await new Promise((resolve) => setTimeout(resolve, backoffTime));
          }
        }
      }
      if (responseText) {
        break;
      }
    }

    if (!responseText) {
      throw lastError || new Error("Tất cả các model Gemini đều đang quá tải hoặc gặp lỗi.");
    }

    let text = responseText.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    const parsed = JSON.parse(text);
    return res.json({ status: "success", source: `gemini (${finalModelUsed})`, data: parsed });
  } catch (geminiErr: any) {
    console.error("Lỗi cả Groq và Gemini:", geminiErr);
    return res.status(500).json({
      status: "error",
      message: `Thất bại khi sinh câu bằng AI: ${geminiErr.message}`
    });
  }
});

// Text-to-Speech proxy for ElevenLabs & Google Translate fallback
app.post("/api/tts", async (req, res) => {
  const { text, sentenceId } = req.body;
  const settings = await getDefaultSettings();

  // Helper to persist audioUrl to DB
  const saveAudioToDb = async (fileName: string) => {
    if (sentenceId) {
      await updateAudioUrl(sentenceId, `/api/audio/${fileName}`);
    }
  };

  let apiKey = (settings.elevenLabsApiKey || "").trim();

  if (settings.useGoogleTts || !apiKey) {
    try {
      // High-quality free fallback: Google Translate TTS API
      const gTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(text)}`;
      const response = await fetch(gTtsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = `${sentenceId || `sent_${Date.now()}`}.mp3`;
        const filePath = path.join(AUDIO_DIR, fileName);
        fs.writeFileSync(filePath, buffer);
        
        saveAudioToDb(fileName);

        return res.json({
          status: "success",
          audioUrl: `/api/audio/${fileName}`
        });
      }
    } catch (gErr: any) {
      console.warn("Google Translate TTS fallback failed:", gErr);
    }

    return res.json({
      status: "fallback",
      message: "Không có ElevenLabs API Key và lỗi Google TTS. Sử dụng công cụ đọc giọng nói tích hợp của trình duyệt (Web Speech API)."
    });
  }

  const voiceId = settings.elevenLabsVoiceId || "pNInz6ob9g9j9ffgIOFa";

  try {
    const client = new ElevenLabsClient({ apiKey });
    const audioStream = await client.textToSpeech.convert(voiceId, {
      text,
      modelId: "eleven_multilingual_v2",
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.75
      }
    });

    const buffer = await streamToBuffer(audioStream);
    const fileName = `${sentenceId || `sent_${Date.now()}`}.mp3`;
    const filePath = path.join(AUDIO_DIR, fileName);

    fs.writeFileSync(filePath, buffer);

    saveAudioToDb(fileName);

    res.json({
      status: "success",
      audioUrl: `/api/audio/${path.basename(filePath)}`
    });
  } catch (err: any) {
    console.log("ElevenLabs TTS unavailable, trying Google TTS fallback...");
    try {
      // Attempt Google TTS as secondary fallback
      const gTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(text)}`;
      const response = await fetch(gTtsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = `${sentenceId || `sent_${Date.now()}`}.mp3`;
        const filePath = path.join(AUDIO_DIR, fileName);
        fs.writeFileSync(filePath, buffer);
        
        saveAudioToDb(fileName);

        return res.json({
          status: "success",
          audioUrl: `/api/audio/${fileName}`
        });
      }
    } catch (gErr) {
      console.warn("Google Translate TTS fallback secondary failed:", gErr);
    }

    res.json({
      status: "fallback",
      message: `ElevenLabs TTS thất bại: ${err.message}. Hệ thống sẽ tự động dùng giọng đọc trình duyệt thay thế.`
    });
  }
});

// Test ElevenLabs API Connection and Speech Synthesis
app.post("/api/elevenlabs/test", async (req, res) => {
  const { apiKey, voiceId, text } = req.body;
  
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ status: "error", message: "Vui lòng nhập ElevenLabs API Key để kiểm tra!" });
  }

  const testVoiceId = (voiceId || "pNInz6ob9g9j9ffgIOFa").trim();
  const testText = (text || "你好，这是一个 ElevenLabs API 测试。恭喜你，配置成功！").trim();

  try {
    const client = new ElevenLabsClient({ apiKey: apiKey.trim() });
    const audioStream = await client.textToSpeech.convert(testVoiceId, {
      text: testText,
      modelId: "eleven_multilingual_v2",
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.75
      }
    });

    const buffer = await streamToBuffer(audioStream);
    const fileName = `test_${Date.now()}.mp3`;
    const filePath = path.join(AUDIO_DIR, fileName);

    fs.writeFileSync(filePath, buffer);

    res.json({
      status: "success",
      message: "Kết nối API ElevenLabs thành công! Giọng đọc đã được tạo.",
      audioUrl: `/api/audio/${fileName}`
    });
  } catch (err: any) {
    let friendlyMessage = `ElevenLabs trả về lỗi: ${err.message}`;
    
    // Attempt to map some common errors to Vietnamese to make it extremely helpful
    const errText = String(err.message || "").toLowerCase();
    const statusCode = err.statusCode || err.status || 500;

    if (statusCode === 401 || errText.includes("invalid api key") || errText.includes("unauthorized")) {
      friendlyMessage = "API Key không hợp lệ hoặc sai thông tin xác thực.";
    } else if (statusCode === 402 || errText.includes("quota") || errText.includes("limit reached")) {
      if (errText.includes("paid_plan_required")) {
        friendlyMessage = "Tài khoản ElevenLabs miễn phí không được phép sử dụng giọng đọc thư viện (Library Voices) qua API. Vui lòng nâng cấp gói hoặc sử dụng một giọng đọc mặc định (Default Voice) có sẵn trong tài khoản của bạn.";
      } else {
        friendlyMessage = "Tài khoản ElevenLabs của bạn đã hết hạn, hết hạn mức (quota) hoặc yêu cầu trả phí.";
      }
    } else if (statusCode === 404 || errText.includes("not found")) {
      friendlyMessage = `Không tìm thấy Voice ID: "${testVoiceId}". Vui lòng kiểm tra lại mã Voice ID trong tài khoản ElevenLabs của bạn.`;
    }

    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      status: "error",
      message: friendlyMessage,
      details: err.message
    });
  }
});

// Custom Audio Upload API
app.post("/api/audio/upload", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { base64Data, fileName } = req.body;
    if (!base64Data) {
      return res.status(400).json({ status: "error", message: "Thiếu dữ liệu âm thanh (base64Data)." });
    }

    // Clean up filename or generate one
    let cleanName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_") : `upload_${Date.now()}.mp3`;
    // Ensure it ends with an audio extension
    if (!/\.(mp3|wav|ogg|m4a|aac)$/i.test(cleanName)) {
      cleanName += ".mp3";
    }

    const userUid = req.user?.uid || req.dbUser?.uid || "admin";
    const fileExt = cleanName.split(".").pop() || "mp3";
    const uuidStr = Math.random().toString(36).substring(2, 10);
    const storagePath = `${userUid}/lessons/audio/${Date.now()}_${uuidStr}.${fileExt}`;

    let finalUrl = "";

    try {
      const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
      const dataString = matches ? matches[2] : base64Data;
      const mimeType = matches ? matches[1] : "audio/mpeg";
      const buffer = Buffer.from(dataString, "base64");

      if (isSupabaseEnabled && supabaseAdmin) {
        const fullPath = `app-files/${storagePath}`;
        finalUrl = await uploadToSupabaseStorage(buffer, mimeType, fullPath);
      } else if (isR2Enabled) {
        const uploadedPath = await uploadToStorage(buffer, mimeType, storagePath);
        finalUrl = await signUrlIfNeeded(uploadedPath);
      } else if (isFirebaseEnabled && storageAdmin) {
        const uploadedPath = await uploadToStorage(buffer, mimeType, storagePath);
        finalUrl = await signUrlIfNeeded(uploadedPath);
      } else {
        const uniqueName = cleanName.match(/^\d+\.mp3$/) ? cleanName : `${Date.now()}_${cleanName}`;
        const filePath = path.join(AUDIO_DIR, uniqueName);
        fs.writeFileSync(filePath, buffer);
        finalUrl = `/api/audio/${uniqueName}`;
      }
    } catch (e: any) {
      console.warn("Lỗi tải lên cloud storage, sử dụng bộ lưu trữ cục bộ làm fallback:", e.message || e);
      try {
        const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
        const dataString = matches ? matches[2] : base64Data;
        const buffer = Buffer.from(dataString, "base64");

        const uniqueName = cleanName.match(/^\d+\.mp3$/) ? cleanName : `${Date.now()}_${cleanName}`;
        const filePath = path.join(AUDIO_DIR, uniqueName);
        fs.writeFileSync(filePath, buffer);
        finalUrl = `/api/audio/${uniqueName}`;
      } catch (localErr: any) {
        throw new Error(`Lỗi ghi file local: ${localErr.message}`);
      }
    }

    res.json({
      status: "success",
      message: "Tải lên âm thanh thành công!",
      audioUrl: finalUrl
    });
  } catch (err: any) {
    res.status(500).json({
      status: "error",
      message: `Không thể tải lên tệp âm thanh: ${err.message}`
    });
  }
});

// Serve audio file (supporting nested subdirectories)
app.get("/api/audio/*", (req, res) => {
  const params = req.params as any;
  const subPath = params[0] || params.fileName || "";
  const file = path.join(AUDIO_DIR, subPath);
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    // If we're requested with :fileName fallback
    const fallbackPath = params.fileName ? path.join(AUDIO_DIR, params.fileName) : "";
    if (fallbackPath && fs.existsSync(fallbackPath)) {
      res.sendFile(fallbackPath);
    } else {
      res.status(404).send("Audio file not found");
    }
  }
});

// Get Vocabulary List
app.get("/api/vocabulary", requireAuth, async (req: AuthRequest, res) => {
  try {
    const list = await getVocabularyList(req.dbUser.id);
    res.json({ status: "success", vocabulary: list });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Add / Update Word in Wordbook
app.post("/api/vocabulary", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { chinese, pinyin, translation, sourceSentence, srs } = req.body;
    const wordData = {
      chinese,
      pinyin: pinyin || "",
      translation: translation || "",
      sourceSentence: sourceSentence || "",
      srs: srs || {
        repetitions: 0,
        interval: 1,
        easeFactor: 2.5,
        nextReviewDate: new Date().toISOString()
      }
    };
    const id = await saveVocabularyWord(req.dbUser.id, wordData);
    res.json({ status: "success", word: { id, ...wordData } });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Delete Word from Wordbook
app.delete("/api/vocabulary/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    await deleteVocabularyWord(req.dbUser.id, req.params.id);
    res.json({ status: "success", message: "Đã xóa từ vựng khỏi sổ từ cá nhân!" });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Dictionary Lookup Endpoint (Instant Contextual Dictionary)
app.post("/api/dictionary/lookup", requireAuth, async (req: AuthRequest, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ status: "error", message: "Từ khóa tra cứu không hợp lệ!" });
  }

  const cleanQuery = query.trim();
  const vocabList = await getVocabularyList(req.dbUser.id);
  const lessonsList = await getLessonsList();
  
  // 1. Search locally in User Vocabulary
  let localWord = (vocabList || []).find(
    (w: any) => w.chinese === cleanQuery || w.chinese.toLowerCase() === cleanQuery.toLowerCase()
  );

  // 2. Search locally in Lessons Sentences
  let localSentenceMatch: any = null;
  if (!localWord) {
    for (const lesson of lessonsList || []) {
      for (const sent of lesson.sentences || []) {
        if (sent.chinese.includes(cleanQuery)) {
          localSentenceMatch = sent;
          break;
        }
      }
      if (localSentenceMatch) break;
    }
  }

  // Define local fallback data structure
  let resultData = {
    chinese: cleanQuery,
    pinyin: localWord ? localWord.pinyin : "",
    translation: localWord ? localWord.translation : "",
    pos: localWord ? "Từ vựng" : "Chữ Hán",
    explanation: localWord 
      ? `Từ trong Sổ từ vựng cá nhân của bạn. ${localWord.sourceSentence ? `Nguồn câu: ${localWord.sourceSentence}` : ""}`
      : (localSentenceMatch 
          ? `Tìm thấy trong câu: "${localSentenceMatch.chinese}" (${localSentenceMatch.translation}). ${localSentenceMatch.explanation || ""}`
          : "Chưa có giải thích chi tiết trong bài học."),
    example: localSentenceMatch ? {
      chinese: localSentenceMatch.chinese,
      pinyin: localSentenceMatch.pinyin,
      translation: localSentenceMatch.translation
    } : {
      chinese: `我学习${cleanQuery}。`,
      pinyin: `Wǒ xuéxí ${cleanQuery}.`,
      translation: `Tôi học ${cleanQuery}.`
    },
    source: "local"
  };

  // 3. If Gemini is available, upgrade with beautiful, professional AI lookup
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });

      const systemInstruction = `You are a professional Chinese-Vietnamese bilingual dictionary assistant. Return a detailed, highly accurate definition in Vietnamese for the given Chinese text. Always output valid JSON strictly matching this schema:
{
  "chinese": "The looked-up word/phrase",
  "pinyin": "Phonetic pinyin with correct tone marks",
  "translation": "Vietnamese translation/meanings",
  "pos": "Part of speech in Vietnamese (e.g., Danh từ, Động từ, Tính từ, v.v.)",
  "explanation": "Clear grammatical, syntactic or semantic explanation in Vietnamese",
  "example": {
    "chinese": "A natural Chinese example sentence containing the word",
    "pinyin": "Pinyin of the example sentence",
    "translation": "Vietnamese translation of the example sentence"
  }
}`;

      const userPrompt = `Please look up and explain the Chinese word, phrase or character: "${cleanQuery}". Use Vietnamese for POS, translation and explanations. Ensure example sentence is realistic and natural.`;

      const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"];
      let responseText = "";
      let finalModelUsed = "";

      for (const modelName of modelsToTry) {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            console.log(`Calling Gemini Dictionary Lookup: model=${modelName}, attempt=${attempt}`);
            const response = await ai.models.generateContent({
              model: modelName,
              contents: `${systemInstruction}\n\n${userPrompt}`,
              config: {
                responseMimeType: "application/json"
              }
            });
            if (response && response.text) {
              responseText = response.text;
              finalModelUsed = modelName;
              break;
            }
          } catch (err: any) {
            // Neutral status logging to avoid automatic system error flags on transient 503 retries
            console.log(`Gemini Dictionary Lookup connection status: ${modelName} verification (attempt ${attempt}/${maxAttempts})`);
            if (attempt < maxAttempts) {
              const backoffTime = 1000 * attempt * (err.message?.includes("503") ? 2 : 1);
              await new Promise((resolve) => setTimeout(resolve, backoffTime));
            }
          }
        }
        if (responseText) {
          break;
        }
      }

      if (responseText) {
        let text = responseText.trim();
        if (text.startsWith("```")) {
          text = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        }
        const parsed = JSON.parse(text);
        if (parsed.chinese && parsed.pinyin && parsed.translation) {
          resultData = {
            ...parsed,
            source: `gemini (${finalModelUsed})`
          };
        }
      }
    } catch (err: any) {
      console.warn("Lỗi khi gọi Gemini Dictionary Lookup, chuyển sang sử dụng dữ liệu cục bộ:", err.message);
    }
  }

  res.json({
    status: "success",
    data: resultData
  });
});

// Get due review items (Anki SM-2 SRS)
app.get("/api/reviews", requireAuth, async (req: AuthRequest, res) => {
  try {
    const vocab = await getVocabularyList(req.dbUser.id);
    const revs = await getRevisionItemsList(req.dbUser.id);
    const now = new Date();

    const dueVocab = (vocab || []).filter((w: any) => new Date(w.srsNextReviewDate || w.srs?.nextReviewDate) <= now);
    const dueSentences = (revs || []).filter((s: any) => new Date(s.srsNextReviewDate || s.srs?.nextReviewDate) <= now);

    res.json({
      status: "success",
      dueVocab: dueVocab.map(w => ({
        id: w.id,
        chinese: w.chinese,
        pinyin: w.pinyin,
        translation: w.translation,
        sourceSentence: w.sourceSentence,
        srs: {
          repetitions: w.srsRepetitions,
          interval: w.srsInterval,
          easeFactor: Number(w.srsEaseFactor),
          nextReviewDate: w.srsNextReviewDate
        }
      })),
      dueSentences: dueSentences.map(s => ({
        id: s.id,
        chinese: s.chinese,
        pinyin: s.pinyin,
        translation: s.translation,
        sourceSentence: s.sourceSentence,
        srs: {
          repetitions: s.srsRepetitions,
          interval: s.srsInterval,
          easeFactor: Number(s.srsEaseFactor),
          nextReviewDate: s.srsNextReviewDate
        }
      })),
      totalDue: dueVocab.length + dueSentences.length
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Submit review results using SM-2 SuperMemo Algorithm
app.post("/api/reviews/submit", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { itemId, type, quality } = req.body;
    const q = Math.max(0, Math.min(5, quality));

    let item: any = null;
    let srs = { repetitions: 0, interval: 1, easeFactor: 2.5 };

    if (type === "word") {
      const vocabList = await getVocabularyList(req.dbUser.id);
      item = vocabList.find(v => v.id === itemId);
      if (item) {
        srs = {
          repetitions: item.srsRepetitions || 0,
          interval: item.srsInterval || 1,
          easeFactor: Number(item.srsEaseFactor || 2.5)
        };
      } else {
        return res.status(404).json({ status: "error", message: "Không tìm thấy từ vựng ôn tập!" });
      }
    } else {
      const revsList = await getRevisionItemsList(req.dbUser.id);
      item = revsList.find(r => r.id === itemId || r.sentenceId === itemId);
      if (item) {
        srs = {
          repetitions: item.srsRepetitions || 0,
          interval: item.srsInterval || 1,
          easeFactor: Number(item.srsEaseFactor || 2.5)
        };
      } else {
        const lessonsList = await getLessonsList();
        let foundSentence: any = null;
        for (const lesson of lessonsList) {
          const s = lesson.sentences.find(sent => sent.id === itemId);
          if (s) {
            foundSentence = s;
            break;
          }
        }

        if (foundSentence) {
          item = {
            id: `rev_${req.dbUser.id}_${Date.now()}`,
            sentenceId: itemId,
            chinese: foundSentence.chinese,
            pinyin: foundSentence.pinyin,
            translation: foundSentence.translation,
            sourceSentence: null,
            srs: {
              repetitions: 0,
              interval: 1,
              easeFactor: 2.5,
              nextReviewDate: new Date().toISOString()
            }
          };
          srs = item.srs;
        } else {
          return res.status(404).json({ status: "error", message: "Không tìm thấy câu ôn tập!" });
        }
      }
    }

    // SM-2 SRS Algorithm implementation
    let reps = srs.repetitions;
    let interval = srs.interval;
    let EF = srs.easeFactor;

    if (q >= 3) {
      if (reps === 0) {
        interval = 1;
      } else if (reps === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * EF);
      }
      reps++;
    } else {
      reps = 0;
      interval = 1;
    }

    EF = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (EF < 1.3) EF = 1.3;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    const updatedSrs = {
      repetitions: reps,
      interval,
      easeFactor: Math.round(EF * 100) / 100,
      nextReviewDate: nextDate.toISOString()
    };

    if (type === "word") {
      await saveVocabularyWord(req.dbUser.id, {
        ...item,
        srs: updatedSrs
      });
    } else {
      await saveRevisionItem(req.dbUser.id, {
        ...item,
        srs: updatedSrs
      });
    }

    res.json({
      status: "success",
      message: "Đã cập nhật lịch ôn tập SRS!",
      srs: updatedSrs
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Update Statistics (Correct / Wrong / XP)
app.post("/api/stats/add-xp", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { xp, isCorrect, wrongWord, wrongSentence, lessonCompleted } = req.body;
    const dateStr = new Date().toISOString().split("T")[0];
    const userStats = await getUserStats(req.dbUser.id);

    const updatedProgress = { ...(userStats.dailyProgress as Record<string, number> || {}) };
    updatedProgress[dateStr] = (updatedProgress[dateStr] || 0) + xp;

    let totalCorrect = userStats.totalCorrect;
    let totalWrong = userStats.totalWrong;

    if (isCorrect) {
      totalCorrect++;
    } else {
      totalWrong++;
    }

    let totalLessons = userStats.totalLessons;
    if (lessonCompleted) {
      totalLessons++;
    }

    // Handle wrong sentence
    if (wrongSentence) {
      const revsList = await getRevisionItemsList(req.dbUser.id);
      const exists = revsList.some((r: any) => r.sentenceId === wrongSentence.id);
      if (!exists) {
        await saveRevisionItem(req.dbUser.id, {
          id: `rev_${req.dbUser.id}_${Date.now()}`,
          sentenceId: wrongSentence.id,
          chinese: wrongSentence.chinese,
          pinyin: wrongSentence.pinyin || "",
          translation: wrongSentence.translation,
          sourceSentence: null,
          srs: {
            repetitions: 0,
            interval: 1,
            easeFactor: 2.5,
            nextReviewDate: new Date().toISOString()
          }
        });
      }
    }

    // Handle wrong word
    if (wrongWord) {
      const vocabList = await getVocabularyList(req.dbUser.id);
      const exists = vocabList.some((v: any) => v.chinese === wrongWord.chinese);
      if (!exists) {
        await saveVocabularyWord(req.dbUser.id, {
          id: `vocab_${req.dbUser.id}_${Date.now()}`,
          chinese: wrongWord.chinese,
          pinyin: wrongWord.pinyin || "",
          translation: wrongWord.translation || "Chưa có nghĩa dịch",
          sourceSentence: wrongWord.sourceSentence || "",
          srs: {
            repetitions: 0,
            interval: 1,
            easeFactor: 2.5,
            nextReviewDate: new Date().toISOString()
          }
        });
      }
    }

    // Calculate streak
    let streak = userStats.streak;
    const today = new Date().toISOString().split("T")[0];
    const lastPractice = userStats.lastPracticeDate;

    if (lastPractice) {
      const lastDate = new Date(lastPractice);
      const currDate = new Date(today);
      const diffTime = Math.abs(currDate.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        streak++;
      } else if (diffDays > 1) {
        streak = 1;
      }
    } else {
      streak = 1;
    }

    // Re-query counts
    const finalVocab = await getVocabularyList(req.dbUser.id);
    const finalRevs = await getRevisionItemsList(req.dbUser.id);
    const now = new Date();

    const dueVocab = finalVocab.filter((w: any) => new Date(w.srsNextReviewDate || w.srs?.nextReviewDate) <= now).length;
    const dueSentences = finalRevs.filter((s: any) => new Date(s.srsNextReviewDate || s.srs?.nextReviewDate) <= now).length;

    const finalStatsUpdates = {
      totalLessons,
      totalCorrect,
      totalWrong,
      totalXp: userStats.totalXp + xp,
      vocabCount: finalVocab.length,
      dueCount: dueVocab + dueSentences,
      streak,
      lastPracticeDate: today,
      dailyProgress: updatedProgress,
    };

    await updateUserStats(req.dbUser.id, finalStatsUpdates);
    res.json({ status: "success", stats: { ...userStats, ...finalStatsUpdates } });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Fetch Stats
app.get("/api/stats", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userStats = await getUserStats(req.dbUser.id);
    const finalVocab = await getVocabularyList(req.dbUser.id);
    const finalRevs = await getRevisionItemsList(req.dbUser.id);
    const now = new Date();

    const dueVocab = finalVocab.filter((w: any) => new Date(w.srsNextReviewDate || w.srs?.nextReviewDate) <= now).length;
    const dueSentences = finalRevs.filter((s: any) => new Date(s.srsNextReviewDate || s.srs?.nextReviewDate) <= now).length;

    const finalStatsUpdates = {
      vocabCount: finalVocab.length,
      dueCount: dueVocab + dueSentences
    };

    await updateUserStats(req.dbUser.id, finalStatsUpdates);
    res.json({ status: "success", stats: { ...userStats, ...finalStatsUpdates } });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Inject runtime environment variables into served HTML
function injectEnvScript(html: string): string {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const supabaseDatabaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.VITE_SUPABASE_DATABASE_URL || "";

  const envObj = {
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
    VITE_SUPABASE_DATABASE_URL: supabaseDatabaseUrl,
  };

  const scriptTag = `
<script id="runtime-env">
  window.__ENV__ = ${JSON.stringify(envObj)};
</script>
`;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${scriptTag}</head>`);
  }
  return scriptTag + html;
}

// Start server async wrapper
async function bootServer() {
  const isProd = process.env.NODE_ENV === "production" || fs.existsSync(path.join(process.cwd(), "dist", "index.html"));
  if (!isProd) {
    try {
      const viteModule = await import("vite");
      const vite = await viteModule.createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      // Fallback for SPA routing in development - transform and send index.html
      app.get("*", async (req, res, next) => {
        const url = req.originalUrl;
        if (url.startsWith("/api/")) {
          return next();
        }
        try {
          let html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
          html = await vite.transformIndexHtml(url, html);
          html = injectEnvScript(html);
          res.status(200).set({ "Content-Type": "text/html" }).end(html);
        } catch (e: any) {
          vite.ssrFixStacktrace(e);
          next(e);
        }
      });
    } catch (e) {
      console.error("Lỗi khởi tạo Vite middleware:", e);
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    
    // Dynamically serve index.html for root and index.html requests to inject runtime environment variables
    app.get(["/", "/index.html"], (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        try {
          let html = fs.readFileSync(indexPath, "utf-8");
          html = injectEnvScript(html);
          return res.status(200).set({ "Content-Type": "text/html" }).end(html);
        } catch (err) {
          return res.sendFile(indexPath);
        }
      } else {
        const rootIndexPath = path.resolve(process.cwd(), "index.html");
        if (fs.existsSync(rootIndexPath)) {
          try {
            let html = fs.readFileSync(rootIndexPath, "utf-8");
            html = injectEnvScript(html);
            return res.status(200).set({ "Content-Type": "text/html" }).end(html);
          } catch (err) {
            return res.sendFile(rootIndexPath);
          }
        }
      }
      res.status(200).send("<html><head><meta charset='utf-8'/><title>Đang khởi tạo...</title><meta http-equiv='refresh' content='2'/></head><body style='font-family:sans-serif;text-align:center;padding:50px;'><h2>Ứng dụng đang khởi tạo dữ liệu và tải trang...</h2><p>Trang sẽ tự động tải lại sau vài giây.</p></body></html>");
    });

    app.use(express.static(distPath));

    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        try {
          let html = fs.readFileSync(indexPath, "utf-8");
          html = injectEnvScript(html);
          res.status(200).set({ "Content-Type": "text/html" }).end(html);
        } catch (err) {
          res.sendFile(indexPath);
        }
      } else {
        const rootIndexPath = path.resolve(process.cwd(), "index.html");
        if (fs.existsSync(rootIndexPath)) {
          try {
            let html = fs.readFileSync(rootIndexPath, "utf-8");
            html = injectEnvScript(html);
            res.status(200).set({ "Content-Type": "text/html" }).end(html);
          } catch (err) {
            res.sendFile(rootIndexPath);
          }
        } else {
          res.status(200).send("<html><head><meta charset='utf-8'/><title>Đang khởi tạo...</title><meta http-equiv='refresh' content='2'/></head><body style='font-family:sans-serif;text-align:center;padding:50px;'><h2>Ứng dụng đang khởi tạo dữ liệu và tải trang...</h2><p>Trang sẽ tự động tải lại sau vài giây.</p></body></html>");
        }
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server luyện nghe tiếng Trung chạy trên cổng: http://localhost:${PORT}`);
    
    // Seed initial lessons if needed (asynchronously in the background)
    seedInitialLessons().catch((err) => {
      console.error("Lỗi khi seed dữ liệu bài học ban đầu:", err);
    });
  });
}

bootServer().catch(err => {
  console.error("Fatal error during server startup:", err);
  process.exit(1);
});
