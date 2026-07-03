import { auth, isFirebaseEnabled } from "../firebase";
import { isSupabaseEnabled } from "../supabase";

const originalFetch = window.fetch;

// Helper to get item from localStorage with a fallback
const getLocal = (key: string, fallback: any) => {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch (e) {
    console.error(`Error reading ${key} from localStorage:`, e);
    return fallback;
  }
};

// Helper to save item to localStorage
const setLocal = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error writing ${key} to localStorage:`, e);
  }
};

// Default system settings
const DEFAULT_SETTINGS = {
  groqApiKey: "",
  elevenLabsApiKey: "",
  elevenLabsVoiceId: "",
  useGoogleTts: true,
  defaultPlaybackSpeed: 1.0,
  voiceGender: "female",
  xpSettings: {
    wrongXp: 1,
    levels: {
      easy: { noHint: 10, hint1: 8, hint2: 5, hint3: 2 },
      medium: { noHint: 15, hint1: 12, hint2: 8, hint3: 4 },
      hard: { noHint: 20, hint1: 15, hint2: 10, hint3: 5 }
    }
  },
  menuLabels: {
    dashboard: "Bảng điều khiển",
    practice: "Luyện chép câu",
    revision: "Ôn tập thông minh",
    wordbook: "Sổ từ vựng",
    admin: "Cấu hình hệ thống"
  }
};

// Default seeded lessons
const DEFAULT_LESSONS = [
  {
    id: "lesson_hsk1_basics",
    title: "Giao tiếp cơ bản hằng ngày",
    level: "HSK1",
    topic: "giao tiếp",
    sentences: [
      {
        id: "sent_hsk1_1",
        chinese: "你好，你叫什么名字？",
        pinyin: "Nǐ hǎo, nǐ jiào shénme míngzi?",
        translation: "Xin chào, bạn tên là gì?",
        explanation: "1. 你 (nǐ): bạn, anh, chị.\n2. 好 (hǎo): tốt, khỏe (你好: Xin chào).\n3. 叫 (jiào): gọi, tên là.\n4. 什么 (shénme): cái gì.\n5. 名字 (míngzi): tên."
      },
      {
        id: "sent_hsk1_2",
        chinese: "我很喜欢吃中国菜。",
        pinyin: "Wǒ hěn xǐhuan chī Zhōngguó cài.",
        translation: "Tôi rất thích ăn món ăn Trung Quốc.",
        explanation: "1. 我 (wǒ): tôi, tớ.\n2. 很 (hěn): rất.\n3. 喜欢 (xǐhuan): thích.\n4. 吃 (chī): ăn.\n5. 中国菜 (Zhōngguó cài): món ăn Trung Quốc (菜: món ăn, rau)."
      },
      {
        id: "sent_hsk1_3",
        chinese: "明天星期几？",
        pinyin: "Míngtiān xīngqījǐ?",
        translation: "Ngày mai là thứ mấy?",
        explanation: "1. 明天 (míngtiān): ngày mai.\n2. 星期几 (xīngqījǐ): thứ mấy (星期: tuần, thứ; 几: mấy)."
      }
    ]
  },
  {
    id: "lesson_hsk2_shopping",
    title: "Mua sắm và mặc cả",
    level: "HSK2",
    topic: "mua sắm",
    sentences: [
      {
        id: "sent_hsk2_1",
        chinese: "这个苹果多少钱一斤？",
        pinyin: "Zhège píngguǒ duōshao qián yī jīn?",
        translation: "Quả táo này bao nhiêu tiền một cân (nửa kg)?",
        explanation: "1. 这个 (zhège): cái này.\n2. 苹果 (píngguǒ): quả táo.\n3. 多少钱 (duōshao qián): bao nhiêu tiền.\n4. 一斤 (yī jīn): một cân Trung Quốc (bằng 500g)."
      },
      {
        id: "sent_hsk2_2",
        chinese: "太贵了，便宜一点吧。",
        pinyin: "Tài guì le, piányi yīdiǎn ba.",
        translation: "Đắt quá, rẻ hơn một chút đi.",
        explanation: "1. 太...了 (tài...le): quá, lắm.\n2. 贵 (guì): đắt.\n3. 便宜 (piányi): rẻ.\n4. 一点 (yīdiǎn): một chút.\n5. 吧 (ba): nhé, đi (trợ từ ngữ khí cầu khiến)."
      }
    ]
  }
];

// Emulator Router
const emulateApi = async (urlStr: string, method: string, bodyText: string): Promise<Response> => {
  console.log(`[Offline API Emulator] Intercepted ${method} ${urlStr}`);

  // Parse Body if present
  let body: any = {};
  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      // Ignored
    }
  }

  // Helper to respond with JSON
  const jsonResponse = (data: any, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  };

  // 1. STATS
  if (urlStr.includes("/api/stats/add-xp")) {
    const stats = getLocal("local_stats", {
      totalLessons: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalXp: 0,
      vocabCount: 0,
      dueCount: 0,
      streak: 1,
      dailyProgress: {}
    });

    const xp = Number(body.xp || 0);
    const isCorrect = !!body.isCorrect;

    stats.totalXp = (stats.totalXp || 0) + xp;
    if (isCorrect) {
      stats.totalCorrect = (stats.totalCorrect || 0) + 1;
    } else {
      stats.totalWrong = (stats.totalWrong || 0) + 1;
    }

    if (body.lessonCompleted) {
      stats.totalLessons = (stats.totalLessons || 0) + 1;
    }

    // Update daily progress
    const todayStr = new Date().toISOString().split("T")[0];
    if (!stats.dailyProgress) stats.dailyProgress = {};
    stats.dailyProgress[todayStr] = (stats.dailyProgress[todayStr] || 0) + xp;

    // Handle wrong word adding to vocabulary
    if (body.wrongWord) {
      const vocab = getLocal("local_vocabulary", []);
      const exists = vocab.find((v: any) => v.chinese === body.wrongWord.chinese);
      if (!exists) {
        vocab.push({
          id: "vocab_" + Date.now() + Math.random().toString(36).substr(2, 4),
          chinese: body.wrongWord.chinese,
          pinyin: body.wrongWord.pinyin,
          translation: body.wrongWord.translation,
          lessonId: body.wrongWord.lessonId || "custom",
          nextReview: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          box: 1,
          addedAt: new Date().toISOString()
        });
        setLocal("local_vocabulary", vocab);
        stats.vocabCount = vocab.length;
      }
    }

    setLocal("local_stats", stats);
    return jsonResponse({ status: "success", stats });
  }

  if (urlStr.includes("/api/stats")) {
    const stats = getLocal("local_stats", {
      totalLessons: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalXp: 0,
      vocabCount: 0,
      dueCount: 0,
      streak: 1,
      dailyProgress: {}
    });
    const vocab = getLocal("local_vocabulary", []);
    stats.vocabCount = vocab.length;
    return jsonResponse({ status: "success", stats });
  }

  // 2. LESSONS
  if (urlStr.includes("/api/lessons/")) {
    // Delete or Edit specific lesson
    const id = urlStr.split("/api/lessons/")[1]?.split(/[?#]/)[0];
    let lessons = getLocal("local_lessons", DEFAULT_LESSONS);
    
    if (method === "DELETE") {
      lessons = lessons.filter((l: any) => l.id !== id);
      setLocal("local_lessons", lessons);
      return jsonResponse({ status: "success" });
    }
  }

  if (urlStr.includes("/api/lessons")) {
    if (method === "POST") {
      const lessons = getLocal("local_lessons", DEFAULT_LESSONS);
      const newLesson = {
        id: body.id || "lesson_" + Date.now(),
        title: body.title || "Bài học mới",
        level: body.level || "HSK1",
        topic: body.topic || "chung",
        sentences: body.sentences || []
      };
      
      const index = lessons.findIndex((l: any) => l.id === newLesson.id);
      if (index >= 0) {
        lessons[index] = newLesson;
      } else {
        lessons.push(newLesson);
      }
      setLocal("local_lessons", lessons);
      return jsonResponse({ status: "success", lesson: newLesson });
    } else {
      const lessons = getLocal("local_lessons", DEFAULT_LESSONS);
      return jsonResponse({ status: "success", lessons });
    }
  }

  // 3. VOCABULARY
  if (urlStr.includes("/api/vocabulary/")) {
    const id = urlStr.split("/api/vocabulary/")[1]?.split(/[?#]/)[0];
    let vocab = getLocal("local_vocabulary", []);
    
    if (method === "DELETE") {
      vocab = vocab.filter((v: any) => v.id !== id);
      setLocal("local_vocabulary", vocab);
      return jsonResponse({ status: "success" });
    }
  }

  if (urlStr.includes("/api/vocabulary")) {
    if (method === "POST") {
      const vocab = getLocal("local_vocabulary", []);
      const newWord = {
        id: body.id || "vocab_" + Date.now(),
        chinese: body.chinese,
        pinyin: body.pinyin,
        translation: body.translation,
        lessonId: body.lessonId || "custom",
        nextReview: body.nextReview || new Date().toISOString(),
        box: body.box || 1,
        addedAt: body.addedAt || new Date().toISOString()
      };
      const index = vocab.findIndex((v: any) => v.chinese === newWord.chinese);
      if (index >= 0) {
        vocab[index] = { ...vocab[index], ...newWord };
      } else {
        vocab.push(newWord);
      }
      setLocal("local_vocabulary", vocab);
      return jsonResponse({ status: "success", vocabulary: vocab });
    } else {
      const vocab = getLocal("local_vocabulary", []);
      return jsonResponse({ status: "success", vocabulary: vocab });
    }
  }

  // 4. REVIEWS
  if (urlStr.includes("/api/reviews")) {
    const vocab = getLocal("local_vocabulary", []);
    const now = new Date();
    const dueVocab = vocab.filter((v: any) => !v.nextReview || new Date(v.nextReview) <= now);
    return jsonResponse({ status: "success", dueVocab, dueSentences: [] });
  }

  // 5. SETTINGS
  if (urlStr.includes("/api/settings")) {
    if (method === "POST") {
      const current = getLocal("local_settings", DEFAULT_SETTINGS);
      const updated = { ...current, ...body };
      setLocal("local_settings", updated);
      return jsonResponse({ status: "success", settings: updated });
    } else {
      const settings = getLocal("local_settings", DEFAULT_SETTINGS);
      return jsonResponse({ status: "success", settings });
    }
  }

  // 6. USER PROFILE
  if (urlStr.includes("/api/user/profile")) {
    if (method === "POST") {
      const currentProfile = getLocal("local_user_profile", {
        uid: "local_dev",
        email: "nvsnguyensi@gmail.com",
        displayName: "Học viên (Offline Mode)",
        photoUrl: "",
        phone: "",
        birthday: ""
      });
      const updated = { ...currentProfile, ...body };
      setLocal("local_user_profile", updated);
      return jsonResponse({ status: "success", user: updated });
    } else {
      const profile = getLocal("local_user_profile", {
        uid: "local_dev",
        email: "nvsnguyensi@gmail.com",
        displayName: "Học viên (Offline Mode)",
        photoUrl: "",
        phone: "",
        birthday: ""
      });
      return jsonResponse({ status: "success", user: profile });
    }
  }

  // 6b. CUSTOM AVATARS (Admin Preset Avatars)
  if (urlStr.includes("/api/custom-avatars")) {
    const list = getLocal("local_custom_avatars", [
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=256",
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=256",
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=256"
    ]);
    return jsonResponse({ status: "success", avatars: list });
  }

  if (urlStr.includes("/api/admin/upload-custom-avatar")) {
    const list = getLocal("local_custom_avatars", [
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=256",
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=256",
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=256"
    ]);
    const newAvatarUrl = body.base64Data || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=256";
    const updatedList = [...list, newAvatarUrl];
    setLocal("local_custom_avatars", updatedList);
    return jsonResponse({ status: "success", avatars: updatedList, url: newAvatarUrl });
  }

  if (urlStr.includes("/api/admin/delete-custom-avatar")) {
    const list = getLocal("local_custom_avatars", [
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=256",
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=256",
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=256"
    ]);
    const urlToDelete = body.url;
    const updatedList = list.filter((u: string) => u !== urlToDelete);
    setLocal("local_custom_avatars", updatedList);
    return jsonResponse({ status: "success", avatars: updatedList });
  }

  // 7. DB CLEAR / RESET
  if (urlStr.includes("/api/db/clear")) {
    setLocal("local_stats", {
      totalLessons: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalXp: 0,
      vocabCount: 0,
      dueCount: 0,
      streak: 1,
      dailyProgress: {}
    });
    setLocal("local_vocabulary", []);
    return jsonResponse({ status: "success", message: "Đã xóa toàn bộ tiến trình học của bạn!" });
  }

  if (urlStr.includes("/api/db/reset")) {
    setLocal("local_lessons", DEFAULT_LESSONS);
    return jsonResponse({ status: "success", message: "Khôi phục dữ liệu mặc định thành công!" });
  }

  // 8. TEST FIREBASE (Fallback when running on serverless/static hosts like Netlify)
  if (urlStr.includes("/api/admin/test-firebase")) {
    return jsonResponse({
      status: "success",
      envChecks: {
        firebaseConfigured: false,
        urlUsed: "Đang chạy trên Tĩnh / Netlify"
      },
      serverClientSuccess: false,
      serverClientMessage: "Bạn đang chạy ứng dụng trên Netlify (hoặc một dịch vụ lưu trữ tĩnh). Netlify KHÔNG thể chạy máy chủ Node.js Express (server.ts), do đó không có backend để kết nối Admin SDK bảo mật với Firebase.",
      authTestSuccess: false,
      authTestMessage: "Máy chủ Node.js không khả dụng trên hosting tĩnh. Vui lòng triển khai lên Render, Railway hoặc VPS để chạy full-stack.",
      dbTestSuccess: false,
      dbTestMessage: "Bạn vẫn có thể học ngoại tuyến bằng LocalStorage của trình duyệt."
    });
  }

  // Fallback default response
  return jsonResponse({ status: "success", data: [] });
};

const customFetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof input === "string" ? input : (input instanceof URL ? input.toString() : input.url);

  if (urlStr.includes("/api/")) {
    const newInit = init ? { ...init } : {};
    const headers = new Headers(newInit.headers || {});
    
    if (isFirebaseEnabled && auth) {
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const token = await currentUser.getIdToken();
          headers.set("Authorization", `Bearer ${token}`);
        }
      } catch (err) {
        console.error("Lỗi đính kèm token Firebase trong fetchProxy:", err);
      }
    }
    
    newInit.headers = headers;

    // TRY THE LIVE NETWORK REQUEST
    try {
      const res = await originalFetch(input, newInit);
      
      // If the response is successful and is JSON, return it
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        return res;
      }
      
      // If the response is HTML (static hosting returning index.html for unknown /api/* paths)
      // or error status, ALWAYS fall back to localStorage emulator.
      // This handles Cloudflare Workers static-only deployments where there is no Express backend.
      if (contentType.includes("text/html") || res.status === 404 || res.status === 405 || res.status === 500) {
        return await emulateApi(urlStr, newInit.method || "GET", String(newInit.body || ""));
      }
      
      return res;
    } catch (netErr) {
      // Server is offline or blocked (connection refused / DNS lookup failed) - fallback to emulator
      return await emulateApi(urlStr, newInit.method || "GET", String(newInit.body || ""));
    }
  }

  return originalFetch(input, init);
};

try {
  Object.defineProperty(window, "fetch", {
    value: customFetch,
    writable: true,
    configurable: true,
  });
} catch (e) {
  console.warn("Failed to define window.fetch via Object.defineProperty:", e);
  try {
    (window as any).fetch = customFetch;
  } catch (err) {
    console.error("Critical: Could not patch window.fetch", err);
  }
}

export {};
