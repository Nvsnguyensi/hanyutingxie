import { createClient } from "@supabase/supabase-js";

const getEnvVar = (key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string => {
  if (typeof window !== "undefined" && (window as any).__ENV__ && (window as any).__ENV__[key]) {
    return (window as any).__ENV__[key];
  }
  let envVal = "";
  if (key === "VITE_SUPABASE_URL") {
    // @ts-ignore
    envVal = (import.meta.env.VITE_SUPABASE_URL as string) || "";
  }
  if (key === "VITE_SUPABASE_ANON_KEY") {
    // @ts-ignore
    envVal = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";
  }

  if (!envVal && typeof window !== "undefined") {
    try {
      const localKey = key === "VITE_SUPABASE_URL" ? "supabase_url_custom" : "supabase_anon_key_custom";
      envVal = localStorage.getItem(localKey) || "";
    } catch (e) {
      console.error("Error reading custom Supabase config:", e);
    }
  }
  return envVal;
};

export const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
export const supabaseAnonKey = getEnvVar("VITE_SUPABASE_ANON_KEY");
export const isSupabaseEnabled = !!(supabaseUrl && supabaseAnonKey);

export function setCustomSupabaseConfig(url: string, anonKey: string) {
  if (typeof window !== "undefined") {
    try {
      if (url && anonKey) {
        localStorage.setItem("supabase_url_custom", url.trim());
        localStorage.setItem("supabase_anon_key_custom", anonKey.trim());
      } else {
        localStorage.removeItem("supabase_url_custom");
        localStorage.removeItem("supabase_anon_key_custom");
      }
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
  }
}

export function clearCustomSupabaseConfig() {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem("supabase_url_custom");
      localStorage.removeItem("supabase_anon_key_custom");
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
  }
}

export const supabase = isSupabaseEnabled
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Map standard Supabase User to the specific structure the application expects
export const mapSupabaseUser = (sbUser: any, session?: any) => {
  if (!sbUser) return null;
  const email = sbUser.email || "";
  const displayName = sbUser.user_metadata?.display_name || sbUser.user_metadata?.full_name || email.split("@")[0] || "Học viên";
  const photoURL = sbUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/lorelei/svg?seed=${email || sbUser.id}`;
  
  return {
    uid: sbUser.id,
    email,
    displayName,
    photoURL,
    getIdToken: async () => {
      try {
        if (session?.access_token) return session.access_token;
        if (!supabase) return "";
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token || "";
      } catch (err) {
        console.error("Lỗi lấy Supabase Access Token:", err);
        return "";
      }
    }
  };
};

export const auth = {
  get currentUser() {
    if (!supabase) return null;
    // Note: getSession or getUser can be used, but since currentUser is synchronous in this getter:
    return null;
  },
  onAuthStateChanged: (callback: (user: any) => void) => {
    if (!supabase) {
      return () => {};
    }
    
    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        callback(mapSupabaseUser(data.session.user, data.session));
      } else {
        callback(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        callback(mapSupabaseUser(session.user, session));
      } else {
        callback(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  },
  signOut: async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  }
};

export async function signInWithEmailAndPassword(email: string, password: string) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return { user: mapSupabaseUser(data.user, data.session) };
}

export async function signInWithFacebook() {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "facebook",
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

export async function createUserWithEmailAndPassword(email: string, password: string, fullName?: string) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: fullName,
        full_name: fullName,
      }
    }
  });
  if (error) throw error;
  return { user: mapSupabaseUser(data.user, data.session) };
}

export async function updateProfile(profileUpdates: { displayName?: string; photoURL?: string }) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data, error } = await supabase.auth.updateUser({
    data: {
      display_name: profileUpdates.displayName,
      avatar_url: profileUpdates.photoURL
    }
  });
  if (error) throw error;
  return mapSupabaseUser(data.user);
}

export async function sendPasswordResetEmail(email: string) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/#recovery`
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data, error } = await supabase.auth.updateUser({
    password
  });
  if (error) throw error;
  return mapSupabaseUser(data.user);
}

export async function logoutUser() {
  await auth.signOut();
}

export async function uploadFileToSupabaseStorage(file: File | Blob, folder: string, fileName: string): Promise<string> {
  if (!supabase) {
    throw new Error("Supabase is not initialized");
  }
  const cleanName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const filePath = `${folder}/${Date.now()}_${cleanName}`;
  const bucket = "app-files"; // Default bucket

  const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
    cacheControl: "3600",
    upsert: true
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}
