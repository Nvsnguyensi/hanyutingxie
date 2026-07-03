// Firebase is disabled. This file is kept as a stub for compatibility.
// All authentication is handled by Supabase (src/supabase.ts).

export const isFirebaseEnabled = false;

export const auth = {
  get currentUser() { return null; },
  onAuthStateChanged: (_callback: (user: any) => void) => () => {},
  signOut: async () => {},
};

export const mapFirebaseUser = (_user: any) => null;
export const logoutUser = async () => {};

export async function signInWithEmailAndPassword(_authInstance: any, _email: string, _password: string): Promise<any> {
  throw new Error("Firebase is disabled. Use Supabase instead.");
}

export async function signInWithFacebook(): Promise<any> {
  throw new Error("Firebase is disabled. Use Supabase instead.");
}

export async function createUserWithEmailAndPassword(_authInstance: any, _email: string, _password: string): Promise<any> {
  throw new Error("Firebase is disabled. Use Supabase instead.");
}

export async function updateProfile(_userInstance: any, _profileUpdates: { displayName?: string; photoURL?: string }): Promise<any> {
  throw new Error("Firebase is disabled. Use Supabase instead.");
}

export async function sendPasswordResetEmail(_authInstance: any, _email: string): Promise<void> {
  throw new Error("Firebase is disabled. Use Supabase instead.");
}

export async function updatePassword(_userInstance: any, _password: string): Promise<void> {
  throw new Error("Firebase is disabled. Use Supabase instead.");
}

export async function uploadFileToFirebaseStorage(_file: File | Blob, _folder: string, _fileName: string): Promise<string> {
  throw new Error("Firebase is disabled. Use Supabase instead.");
}

// These were referenced by Admin.tsx
export const getDriveAccessToken = async () => "";
export const uploadFileToSupabase = async (_file: File | Blob, _folder: string, _fileName: string): Promise<string> => {
  throw new Error("Use Supabase storage directly.");
};
