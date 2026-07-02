import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword as fbSignInWithEmailAndPassword, 
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPassword, 
  updateProfile as fbUpdateProfile, 
  sendPasswordResetEmail as fbSendPasswordResetEmail, 
  updatePassword as fbUpdatePassword, 
  signOut as fbSignOut,
  FacebookAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
const firebaseConfig: any = {};

export const isFirebaseEnabled = false;

const app = isFirebaseEnabled
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())
  : null;
const fbAuth = app ? getAuth(app) : null;

// Map standard Firebase User to the specific structure the application expects
export const mapFirebaseUser = (fbUser: any) => {
  if (!fbUser) return null;
  const email = fbUser.email || "";
  const displayName = fbUser.displayName || email.split("@")[0] || "Học viên";
  const photoURL = fbUser.photoURL || `https://api.dicebear.com/7.x/lorelei/svg?seed=${email || fbUser.uid}`;
  
  return {
    uid: fbUser.uid,
    email,
    displayName,
    photoURL,
    getIdToken: async () => {
      try {
        if (!fbUser.getIdToken) return "";
        return await fbUser.getIdToken();
      } catch (err) {
        console.error("Lỗi lấy IdToken:", err);
        return "";
      }
    }
  };
};

export const auth = {
  get currentUser() {
    return (fbAuth && fbAuth.currentUser) ? mapFirebaseUser(fbAuth.currentUser) : null;
  },
  onAuthStateChanged: (callback: (user: any) => void) => {
    if (!fbAuth) {
      return () => {};
    }
    return fbAuth.onAuthStateChanged((user) => {
      callback(user ? mapFirebaseUser(user) : null);
    });
  },
  signOut: async () => {
    if (fbAuth) {
      await fbSignOut(fbAuth);
    }
  }
};

export async function signInWithEmailAndPassword(authInstance: any, email: string, password: string) {
  if (!fbAuth) throw new Error("Firebase chưa được cấu hình.");
  const result = await fbSignInWithEmailAndPassword(fbAuth, email, password);
  return { user: mapFirebaseUser(result.user) };
}

export async function signInWithFacebook() {
  if (!fbAuth) throw new Error("Firebase chưa được cấu hình.");
  const provider = new FacebookAuthProvider();
  const result = await signInWithPopup(fbAuth, provider);
  return { user: mapFirebaseUser(result.user) };
}

export async function createUserWithEmailAndPassword(authInstance: any, email: string, password: string) {
  if (!fbAuth) throw new Error("Firebase chưa được cấu hình.");
  const result = await fbCreateUserWithEmailAndPassword(fbAuth, email, password);
  return { user: mapFirebaseUser(result.user) };
}

export async function updateProfile(userInstance: any, profileUpdates: { displayName?: string; photoURL?: string }) {
  if (!fbAuth || !fbAuth.currentUser) throw new Error("Chưa đăng nhập hoặc Firebase chưa kích hoạt");
  await fbUpdateProfile(fbAuth.currentUser, {
    displayName: profileUpdates.displayName,
    photoURL: profileUpdates.photoURL
  });
  return mapFirebaseUser(fbAuth.currentUser);
}

export async function sendPasswordResetEmail(authInstance: any, email: string) {
  if (!fbAuth) throw new Error("Firebase chưa được cấu hình.");
  await fbSendPasswordResetEmail(fbAuth, email, {
    url: `${window.location.origin}/#recovery`
  });
}

export async function updatePassword(userInstance: any, password: string) {
  if (!fbAuth || !fbAuth.currentUser) throw new Error("Chưa đăng nhập hoặc Firebase chưa kích hoạt");
  await fbUpdatePassword(fbAuth.currentUser, password);
  return mapFirebaseUser(fbAuth.currentUser);
}

export async function logoutUser() {
  await auth.signOut();
}

export async function signOut(authInstance?: any) {
  await auth.signOut();
}

// Map upload file to Firebase Storage
export async function uploadFileToSupabase(file: File | Blob, folder: string, fileName: string): Promise<string> {
  if (!isFirebaseEnabled || !app) {
    throw new Error("Firebase is not initialized");
  }
  const storage = getStorage(app);
  const cleanName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const filePath = `${folder}/${Date.now()}_${cleanName}`;
  const storageRef = ref(storage, filePath);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

export const getDriveAccessToken = async (): Promise<string | null> => {
  return null;
};
