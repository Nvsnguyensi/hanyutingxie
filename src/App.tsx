import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import Practice from "./components/Practice";
import Revision from "./components/Revision";
import Wordbook from "./components/Wordbook";
import Admin from "./components/Admin";
import DictionaryDrawer from "./components/DictionaryDrawer";
import Login from "./components/Login";
import ResetPassword from "./components/ResetPassword";
import UserProfileModal from "./components/UserProfileModal";
import { 
  auth as firebaseAuth, 
  logoutUser as firebaseLogoutUser, 
  isFirebaseEnabled, 
  mapFirebaseUser 
} from "./firebase";
import { 
  auth as supabaseAuth, 
  logoutUser as supabaseLogoutUser, 
  isSupabaseEnabled, 
  mapSupabaseUser 
} from "./supabase";
import { UserStats, Lesson, VocabularyWord, SystemSettings, ClientUser } from "./types";
import { Loader2, BookOpen } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [user, setUser] = useState<ClientUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isResettingPassword, setIsResettingPassword] = useState<boolean>(false);
  const [stats, setStats] = useState<UserStats>({
    totalLessons: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalXp: 0,
    vocabCount: 0,
    dueCount: 0,
    streak: 0,
    dailyProgress: {}
  });
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyWord[]>([]);
  const [dueVocab, setDueVocab] = useState<any[]>([]);
  const [dueSentences, setDueSentences] = useState<any[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Instant Contextual Dictionary states
  const [dictQuery, setDictQuery] = useState<string>("");
  const [isDictOpen, setIsDictOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);

  const handleLookupWord = (word: string) => {
    setDictQuery(word);
    setIsDictOpen(true);
  };

  // Initialize and load all system statistics and databases with retry mechanism
  const loadAppData = async (retries = 4, delay = 1000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const [statsRes, lessonsRes, vocabRes, reviewsRes, settingsRes, profileRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/lessons"),
          fetch("/api/vocabulary"),
          fetch("/api/reviews"),
          fetch("/api/settings"),
          fetch("/api/user/profile")
        ]);

        // Check if any HTTP request failed
        const failedRes = [statsRes, lessonsRes, vocabRes, reviewsRes, settingsRes, profileRes].find(r => !r.ok);
        if (failedRes) {
          throw new Error(`HTTP error! status: ${failedRes.status}`);
        }

        // Verify that all responses are JSON before attempting to parse them
        const nonJsonRes = [statsRes, lessonsRes, vocabRes, reviewsRes, settingsRes, profileRes].find(
          r => !r.headers.get("content-type")?.includes("application/json")
        );
        if (nonJsonRes) {
          throw new Error("Received non-JSON response from server (server may be starting up)");
        }

        const [statsData, lessonsData, vocabData, reviewsData, settingsData, profileData] = await Promise.all([
          statsRes.json(),
          lessonsRes.json(),
          vocabRes.json(),
          reviewsRes.json(),
          settingsRes.json(),
          profileRes.json()
        ]);

        if (
          statsData.status === "success" &&
          lessonsData.status === "success" &&
          vocabData.status === "success" &&
          settingsData.status === "success" &&
          reviewsData.status === "success" &&
          profileData.status === "success"
        ) {
          setStats(statsData.stats);
          setLessons(lessonsData.lessons);
          setVocabulary(vocabData.vocabulary);
          setSettings(settingsData.settings);
          setDueVocab(reviewsData.dueVocab || []);
          setDueSentences(reviewsData.dueSentences || []);
          
          if (profileData.user) {
            setUser({
              uid: profileData.user.uid,
              email: profileData.user.email || "",
              displayName: profileData.user.displayName || "Học viên",
              photoURL: profileData.user.photoUrl || `https://api.dicebear.com/7.x/lorelei/svg?seed=${profileData.user.email}`,
              phone: profileData.user.phone || null,
              birthday: profileData.user.birthday || null,
            });
          }

          setStats(prev => ({
            ...prev,
            dueCount: (reviewsData.dueVocab?.length || 0) + (reviewsData.dueSentences?.length || 0)
          }));
          
          setIsLoading(false);
          return; // Success! Exit function
        } else {
          throw new Error("Invalid response format from server");
        }
      } catch (err: any) {
        if (attempt === retries) {
          console.warn("Lỗi đồng bộ hóa dữ liệu (không thể kết nối sau nhiều lần thử):", err.message || err);
          setIsLoading(false);
          break;
        }
        // Wait and retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  };

  // Maintain a ref of the current mapped user so fetch interceptor always gets latest getIdToken
  const userRef = React.useRef<ClientUser | null>(null);
  const lastLoadedUserIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Centralized window.fetch interceptor to automatically attach authorization token
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlString = typeof input === "string" ? input : (input instanceof URL ? input.toString() : (input as Request).url || "");
      if (urlString.startsWith("/api/")) {
        const currentUser = userRef.current;
        if (currentUser && currentUser.getIdToken) {
          try {
            const token = await currentUser.getIdToken();
            if (token) {
              const headers = new Headers(init?.headers);
              headers.set("Authorization", `Bearer ${token}`);
              init = {
                ...init,
                headers
              };
            }
          } catch (e) {
            console.error("Lỗi khi lấy ID/Access token:", e);
          }
        }
      }
      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Admin Theme Effect
  useEffect(() => {
    if (user && user.email === "nvsnguyensi@gmail.com") {
      document.documentElement.classList.add("admin-theme");
    } else {
      document.documentElement.classList.remove("admin-theme");
    }
  }, [user]);

  // Auth State Listener
  useEffect(() => {
    if (isSupabaseEnabled) {
      const unsubscribe = supabaseAuth.onAuthStateChanged(async (sbUser) => {
        if (sbUser) {
          const isSameUser = lastLoadedUserIdRef.current === sbUser.uid;
          setUser(sbUser);
          setIsAuthLoading(false);
          if (!isSameUser) {
            lastLoadedUserIdRef.current = sbUser.uid;
            setIsLoading(true);
            await loadAppData();
            if (sbUser.uid === "b9c5d331-26ff-4f1b-909f-38728ecde8fb" || sbUser.uid === "d8b2806e-77e7-4852-89d6-fb9b33222d63" || sbUser.uid === "Wx15T6MdBpes6hUznG3P4NDqjH13" || sbUser.email === "nvsnguyensi@gmail.com") {
              setActiveTab("admin");
            }
            if (window.location.pathname === "/login") {
              window.history.pushState(null, "", "/");
            }
          }
        } else {
          lastLoadedUserIdRef.current = null;
          setUser(null);
          setIsAuthLoading(false);
          setIsLoading(false);
        }
      });
      return () => {
        unsubscribe();
      };
    }

    if (isFirebaseEnabled) {
      // Listen for auth state changes using Firebase
      const unsubscribe = firebaseAuth.onAuthStateChanged(async (fbUser) => {
        if (fbUser) {
          const mapped = mapFirebaseUser(fbUser);
          const isSameUser = lastLoadedUserIdRef.current === mapped.uid;
          setUser(mapped);
          setIsAuthLoading(false);
          if (!isSameUser) {
            lastLoadedUserIdRef.current = mapped.uid;
            setIsLoading(true);
            await loadAppData();
            if (mapped.uid === "b9c5d331-26ff-4f1b-909f-38728ecde8fb" || mapped.uid === "d8b2806e-77e7-4852-89d6-fb9b33222d63" || mapped.uid === "Wx15T6MdBpes6hUznG3P4NDqjH13" || mapped.email === "nvsnguyensi@gmail.com") {
              setActiveTab("admin");
            }
            if (window.location.pathname === "/login") {
              window.history.pushState(null, "", "/");
            }
          }
        } else {
          lastLoadedUserIdRef.current = null;
          setUser(null);
          setIsAuthLoading(false);
          setIsLoading(false);
        }
      });

      return () => {
        unsubscribe();
      };
    }

    // Graceful local demo mode
    setUser({
      uid: "local_dev",
      email: "nvsnguyensi@gmail.com", // Allow access to Admin panel in local mode
      displayName: "Người dùng (Local Demo)",
      photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150",
    });
    setIsAuthLoading(false);
    setIsLoading(true);
    loadAppData();
  }, []);

  // XP addition proxy
  const handleAddXp = async (xp: number, isCorrect: boolean, wrongWord?: any, wrongSentence?: any, lessonCompleted?: boolean) => {
    try {
      const res = await fetch("/api/stats/add-xp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xp, isCorrect, wrongWord, wrongSentence, lessonCompleted })
      });
      const data = await res.json();
      if (data.status === "success") {
        setStats(data.stats);
        loadAppData(); // reload vocabulary & reviews as well
      }
    } catch (err) {
      console.error("Lỗi cộng điểm XP:", err);
    }
  };

  // Delete lesson
  const handleDeleteLesson = async (id: string) => {
    try {
      const res = await fetch(`/api/lessons/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.status === "success") {
        setLessons(prev => prev.filter(l => l.id !== id));
        await loadAppData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete word from Wordbook
  const handleDeleteWord = async (id: string) => {
    try {
      const res = await fetch(`/api/vocabulary/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.status === "success") {
        setVocabulary(prev => prev.filter(v => v.id !== id));
        loadAppData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      if (isSupabaseEnabled) {
        await supabaseLogoutUser();
      } else if (isFirebaseEnabled) {
        await firebaseLogoutUser();
      }
      setUser(null);
      setActiveTab("dashboard");
    } catch (err) {
      console.error("Lỗi đăng xuất:", err);
    }
  };

  if (isResettingPassword) {
    return <ResetPassword onComplete={() => setIsResettingPassword(false)} />;
  }

  // Render Loading spinner during app loading / initializing
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
          <h2 className="text-white font-sans text-base font-semibold tracking-wide">Đang xác thực...</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
          <h2 className="text-white font-sans text-base font-semibold tracking-wide">Đang tải dữ liệu...</h2>
          <p className="text-slate-400 font-sans text-xs">Vui lòng chờ trong giây lát</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white pb-12">
      {/* Sleek header bar */}
      <Header 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        stats={stats}
        user={user}
        onLogout={handleLogout}
        onEditProfile={() => setIsProfileOpen(true)}
        settings={settings}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {activeTab === "dashboard" && (
          <Dashboard 
            stats={stats}
            onStartPractice={() => setActiveTab("practice")}
            onStartRevision={() => setActiveTab("revision")}
            onRefreshStats={() => { loadAppData(); }}
          />
        )}

        {activeTab === "practice" && (
          <Practice 
            lessons={lessons}
            stats={stats}
            onAddXp={handleAddXp}
            onRefreshStats={() => { loadAppData(); }}
            onBackToDashboard={() => setActiveTab("dashboard")}
            settings={settings}
            onLookupWord={handleLookupWord}
          />
        )}

        {activeTab === "revision" && (
          <Revision 
            dueVocab={dueVocab}
            dueSentences={dueSentences}
            onRefreshStats={() => { loadAppData(); }}
            onBackToDashboard={() => setActiveTab("dashboard")}
            onLookupWord={handleLookupWord}
            settings={settings}
          />
        )}

        {activeTab === "wordbook" && (
          <Wordbook 
            vocabulary={vocabulary}
            onDeleteWord={handleDeleteWord}
            onRefreshStats={() => { loadAppData(); }}
            onLookupWord={handleLookupWord}
          />
        )}

        {activeTab === "admin" && (user?.uid === "b9c5d331-26ff-4f1b-909f-38728ecde8fb" || user?.uid === "d8b2806e-77e7-4852-89d6-fb9b33222d63" || user?.uid === "local_dev" || user?.uid === "Wx15T6MdBpes6hUznG3P4NDqjH13" || user?.email === "nvsnguyensi@gmail.com") && (
          <Admin 
            lessons={lessons}
            onAddLesson={() => { loadAppData(); }}
            onEditLesson={() => { loadAppData(); }}
            onDeleteLesson={handleDeleteLesson}
            onRefreshLessons={() => { loadAppData(); }}
          />
        )}
      </main>

      {/* Persistent Floating Dictionary Button */}
      <button
        onClick={() => {
          setDictQuery("");
          setIsDictOpen(true);
        }}
        className="fixed bottom-6 right-6 p-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all z-40 flex items-center justify-center cursor-pointer group border-0 outline-none"
        title="Mở Từ điển Hán-Việt"
      >
        <BookOpen className="w-6 h-6 group-hover:rotate-12 transition-transform duration-300" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs group-hover:ml-2 transition-all duration-300 text-xs font-bold whitespace-nowrap">
          Từ điển
        </span>
      </button>

      {/* Dictionary Drawer Overlay */}
      <DictionaryDrawer
        isOpen={isDictOpen}
        onClose={() => setIsDictOpen(false)}
        initialQuery={dictQuery}
        vocabulary={vocabulary}
        onRefreshStats={() => { loadAppData(); }}
      />

      {/* User Profile Customization Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        onProfileUpdated={() => { loadAppData(); }}
      />
    </div>
  );
}
