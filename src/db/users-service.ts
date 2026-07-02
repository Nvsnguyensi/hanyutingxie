import fs from 'fs';
import path from 'path';
import { 
  isFirebaseEnabled,
  dbAdmin,
  extractStoragePath,
  signUrlIfNeeded,
  deleteStorageFileIfNeeded
} from './firebase-admin';
import {
  isSupabaseEnabled,
  supabaseAdmin,
  deleteSupabaseStorageFileIfNeeded
} from './supabase-admin';

async function checkSupabase(): Promise<boolean> {
  return isSupabaseEnabled && supabaseAdmin !== null;
}

export interface UserColumnMap {
  displayName: string | null;
  photoUrl: string | null;
  phone: string | null;
  birthday: string | null;
  createdAt: string | null;
}

let userColumnMap: UserColumnMap | null = null;

async function probeUserColumns(): Promise<UserColumnMap> {
  if (userColumnMap) return userColumnMap;

  const defaultMap: UserColumnMap = {
    displayName: 'displayName',
    photoUrl: 'photoUrl',
    phone: 'phone',
    birthday: 'birthday',
    createdAt: 'createdAt'
  };

  const useSupabase = await checkSupabase();
  if (!useSupabase || !supabaseAdmin) {
    userColumnMap = defaultMap;
    return defaultMap;
  }

  // Probe displayName
  for (const name of ['displayName', 'display_name', 'displayname']) {
    try {
      const { error } = await supabaseAdmin.from('users').select(name).limit(1);
      if (!error || (!error.message.includes('column') && error.code !== 'PGRST204')) {
        defaultMap.displayName = name;
        break;
      }
    } catch (e) {}
  }

  // Probe photoUrl
  for (const name of ['photoUrl', 'photo_url', 'photourl']) {
    try {
      const { error } = await supabaseAdmin.from('users').select(name).limit(1);
      if (!error || (!error.message.includes('column') && error.code !== 'PGRST204')) {
        defaultMap.photoUrl = name;
        break;
      }
    } catch (e) {}
  }

  // Probe phone
  try {
    const { error } = await supabaseAdmin.from('users').select('phone').limit(1);
    if (error && (error.message.includes('column') || error.code === 'PGRST204')) {
      defaultMap.phone = null;
    }
  } catch (e) {
    defaultMap.phone = null;
  }

  // Probe birthday
  try {
    const { error } = await supabaseAdmin.from('users').select('birthday').limit(1);
    if (error && (error.message.includes('column') || error.code === 'PGRST204')) {
      defaultMap.birthday = null;
    }
  } catch (e) {
    defaultMap.birthday = null;
  }

  // Probe createdAt
  for (const name of ['createdAt', 'created_at', 'createdat']) {
    try {
      const { error } = await supabaseAdmin.from('users').select(name).limit(1);
      if (!error || (!error.message.includes('column') && error.code !== 'PGRST204')) {
        defaultMap.createdAt = name;
        break;
      }
    } catch (e) {}
  }

  userColumnMap = defaultMap;
  return userColumnMap;
}

function mapDbUserToApp(dbUser: any, columns: UserColumnMap): DBUser {
  return {
    id: dbUser.id,
    uid: dbUser.uid,
    email: dbUser.email,
    displayName: columns.displayName ? (dbUser[columns.displayName] || null) : null,
    photoUrl: columns.photoUrl ? (dbUser[columns.photoUrl] || null) : null,
    phone: columns.phone ? (dbUser[columns.phone] || null) : null,
    birthday: columns.birthday ? (dbUser[columns.birthday] || null) : null,
    createdAt: columns.createdAt ? (dbUser[columns.createdAt] || new Date().toISOString()) : new Date().toISOString()
  };
}

async function resolveUrl(url: string | null | undefined): Promise<string> {
  if (!url) return "";
  const useSupabase = await checkSupabase();
  if (useSupabase) {
    return url;
  }
  return await signUrlIfNeeded(url);
}

async function deleteStorageFile(urlOrPath: string | null | undefined) {
  const useSupabase = await checkSupabase();
  if (useSupabase) {
    await deleteSupabaseStorageFileIfNeeded(urlOrPath);
  } else {
    await deleteStorageFileIfNeeded(urlOrPath);
  }
}

const DB_PATH = path.join(process.cwd(), 'db.json');

// Types
export interface DBUser {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  photoUrl: string | null;
  createdAt: string;
  phone?: string | null;
  birthday?: string | null;
}

// Default Data Structure
interface Database {
  users: DBUser[];
  stats: any[];
  settings: any[];
  vocabulary: any[];
  revisionItems: any[];
  lessons: any[];
  sentences: any[];
  customAvatars?: string[];
}

// Initialize memory DB
let memoryDb: Database = {
  users: [],
  stats: [],
  settings: [],
  vocabulary: [],
  revisionItems: [],
  lessons: [],
  sentences: [],
  customAvatars: []
};

// Load from file if exists
if (fs.existsSync(DB_PATH)) {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    memoryDb = { ...memoryDb, ...JSON.parse(data) };
  } catch (err) {
    console.error("Lỗi đọc db.json:", err);
  }
}

// Helper to save memory to file
function persist() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(memoryDb, null, 2), 'utf-8');
  } catch (err) {
    console.error("Lỗi ghi db.json:", err);
  }
}

async function checkFirebase(): Promise<boolean> {
  return isFirebaseEnabled && dbAdmin !== null;
}

export async function getOrCreateUser(uid: string, email: string, displayName?: string, photoUrl?: string): Promise<DBUser> {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { data: user, error: findError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('uid', uid)
        .maybeSingle();

      const columns = await probeUserColumns();

      let finalUser = user;

      if (!finalUser) {
        // Generate numericId by inserting first (postgres SERIAL)
        const newUserObj: any = {
          uid,
          email,
        };
        if (columns.displayName) {
          newUserObj[columns.displayName] = displayName || null;
        }
        if (columns.photoUrl) {
          newUserObj[columns.photoUrl] = photoUrl || null;
        }
        if (columns.phone) {
          newUserObj[columns.phone] = null;
        }
        if (columns.birthday) {
          newUserObj[columns.birthday] = null;
        }

        const { data: insertedUser, error: insertError } = await supabaseAdmin
          .from('users')
          .insert(newUserObj)
          .select()
          .maybeSingle();

        if (insertError) {
          const errMsg = insertError.message || "";
          const errCode = insertError.code || "";
          if (errCode === '23505' || errMsg.includes('duplicate key') || errMsg.includes('unique constraint') || errMsg.includes('violates unique constraint')) {
            // User was inserted concurrently or already exists. Fetch the existing user row.
            const { data: secondFetch, error: secondFetchError } = await supabaseAdmin
              .from('users')
              .select('*')
              .eq('uid', uid)
              .maybeSingle();
              
            if (secondFetch && !secondFetchError) {
              finalUser = secondFetch;
            } else {
              throw new Error(`Failed to fetch user after unique constraint violation: ${secondFetchError?.message || 'unknown error'}`);
            }
          } else {
            throw new Error(`Error inserting user to Supabase: ${errMsg}`);
          }
        } else {
          finalUser = insertedUser;
        }
      }

      if (!finalUser) {
        throw new Error("Unable to obtain or create a user row in Supabase");
      }

      const numericId = finalUser.id;

      // Defensive check-and-insert for stats
      try {
        const { data: hasStats, error: statsCheckError } = await supabaseAdmin
          .from('stats')
          .select('id')
          .eq('userId', numericId)
          .maybeSingle();

        if (!hasStats && !statsCheckError) {
          await supabaseAdmin.from('stats').insert({
            userId: numericId,
            totalLessons: 0,
            totalCorrect: 0,
            totalWrong: 0,
            totalXp: 0,
            vocabCount: 0,
            streak: 0,
            dailyProgress: {}
          });
        }
      } catch (statsErr) {
        console.warn("Defensive stats initialization warning:", statsErr);
      }

      // Defensive check-and-insert for settings
      try {
        const { data: hasSettings, error: settingsCheckError } = await supabaseAdmin
          .from('settings')
          .select('id')
          .eq('userId', numericId)
          .maybeSingle();

        if (!hasSettings && !settingsCheckError) {
          await supabaseAdmin.from('settings').insert({
            userId: numericId,
            groqApiKey: '',
            elevenLabsApiKey: '',
            elevenLabsVoiceId: 'pNInz6ob9g9j9ffgIOFa',
            useGoogleTts: true,
            xpSettings: {
              wrongXp: 1,
              levels: {
                "HSK1": { noHint: 10, hint1: 8, hint2: 5, hint3: 2 },
                "HSK2": { noHint: 12, hint1: 10, hint2: 6, hint3: 3 },
                "HSK3": { noHint: 15, hint1: 12, hint2: 8, hint3: 4 },
                "HSK4": { noHint: 18, hint1: 14, hint2: 9, hint3: 5 },
                "HSK5": { noHint: 20, hint1: 16, hint2: 10, hint3: 6 },
                "HSK6": { noHint: 25, hint1: 20, hint2: 12, hint3: 8 },
                "Nâng cao": { noHint: 30, hint1: 24, hint2: 15, hint3: 10 }
              }
            }
          });
        }
      } catch (settingsErr) {
        console.warn("Defensive settings initialization warning:", settingsErr);
      }

      return mapDbUserToApp(finalUser, columns);
    } catch (err) {
      console.error("Lỗi trong getOrCreateUser với Supabase, chuyển về local storage:", err);
    }
  }

  const useFirebase = await checkFirebase();
  
  if (useFirebase && dbAdmin) {
    try {
      const userRef = dbAdmin.collection('users').doc(uid);
      const doc = await userRef.get();

      if (doc.exists) {
        const data = doc.data()!;
        return {
          id: data.id,
          uid: data.uid,
          email: data.email,
          displayName: data.displayName,
          photoUrl: await signUrlIfNeeded(data.photoUrl),
          phone: data.phone || null,
          birthday: data.birthday || null,
          createdAt: data.createdAt
        };
      }

      // Create new user in Firestore
      const numericId = uid === "local_dev" ? 1 : Date.now();
      const newUser = {
        id: numericId,
        uid,
        email,
        displayName: displayName || null,
        photoUrl: photoUrl || null,
        phone: null,
        birthday: null,
        createdAt: new Date().toISOString()
      };

      await userRef.set(newUser);

      // Initialize user stats in Firestore
      await dbAdmin.collection('stats').doc(String(numericId)).set({
        userId: numericId,
        totalLessons: 0,
        totalCorrect: 0,
        totalWrong: 0,
        totalXp: 0,
        vocabCount: 0,
        streak: 0,
        dailyProgress: {}
      });

      // Initialize settings in Firestore
      await dbAdmin.collection('settings').doc(String(numericId)).set({
        userId: numericId,
        groqApiKey: '',
        elevenLabsApiKey: '',
        elevenLabsVoiceId: 'pNInz6ob9g9j9ffgIOFa',
        useGoogleTts: true,
        xpSettings: {
          wrongXp: 1,
          levels: {
            "HSK1": { noHint: 10, hint1: 8, hint2: 5, hint3: 2 },
            "HSK2": { noHint: 12, hint1: 10, hint2: 6, hint3: 3 },
            "HSK3": { noHint: 15, hint1: 12, hint2: 8, hint3: 4 },
            "HSK4": { noHint: 18, hint1: 14, hint2: 9, hint3: 5 },
            "HSK5": { noHint: 20, hint1: 16, hint2: 10, hint3: 6 },
            "HSK6": { noHint: 25, hint1: 20, hint2: 12, hint3: 8 },
            "Nâng cao": { noHint: 30, hint1: 24, hint2: 15, hint3: 10 }
          }
        }
      });

      return {
        ...newUser,
        photoUrl: await signUrlIfNeeded(newUser.photoUrl)
      };
    } catch (err) {
      console.error("Lỗi trong getOrCreateUser với Firestore, chuyển về local storage:", err);
    }
  }

  // Local storage fallback
  let user = memoryDb.users.find(u => u.uid === uid);
  
  if (!user) {
    user = {
      id: uid === "local_dev" ? 1 : Date.now(),
      uid,
      email,
      displayName: displayName || null,
      photoUrl: photoUrl || null,
      phone: null,
      birthday: null,
      createdAt: new Date().toISOString()
    };
    memoryDb.users.push(user);
    
    // Initialize stats & settings in memory DB
    if (!memoryDb.stats.some(s => s.userId === user!.id)) {
      memoryDb.stats.push({
        userId: user.id,
        totalLessons: 0,
        totalCorrect: 0,
        totalWrong: 0,
        totalXp: 0,
        vocabCount: 0,
        streak: 0,
        dailyProgress: {}
      });
    }

    if (!memoryDb.settings.some(s => s.userId === user!.id)) {
      memoryDb.settings.push({
        userId: user.id,
        groqApiKey: '',
        elevenLabsApiKey: '',
        elevenLabsVoiceId: 'pNInz6ob9g9j9ffgIOFa',
        useGoogleTts: true,
        xpSettings: {
          wrongXp: 1,
          levels: {
            "HSK1": { noHint: 10, hint1: 8, hint2: 5, hint3: 2 },
            "HSK2": { noHint: 12, hint1: 10, hint2: 6, hint3: 3 },
            "HSK3": { noHint: 15, hint1: 12, hint2: 8, hint3: 4 },
            "HSK4": { noHint: 18, hint1: 14, hint2: 9, hint3: 5 },
            "HSK5": { noHint: 20, hint1: 16, hint2: 10, hint3: 6 },
            "HSK6": { noHint: 25, hint1: 20, hint2: 12, hint3: 8 },
            "Nâng cao": { noHint: 30, hint1: 24, hint2: 15, hint3: 10 }
          }
        }
      });
    }

    persist();
  }

  return user;
}

export async function getUserStats(userId: number) {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.from('stats').select('*').eq('userId', userId).maybeSingle();
      if (data && !error) return data;
    } catch (err) {
      console.error("Lỗi getUserStats Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      const doc = await dbAdmin.collection('stats').doc(String(userId)).get();
      if (doc.exists) return doc.data();
    } catch (err) {
      console.error("Lỗi getUserStats Firestore:", err);
    }
  }

  let stat = memoryDb.stats.find(s => s.userId === userId);
  if (!stat) {
    stat = {
      userId,
      totalLessons: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalXp: 0,
      vocabCount: 0,
      streak: 0,
      dailyProgress: {}
    };
    memoryDb.stats.push(stat);
    persist();
  }
  return stat;
}

export async function updateUserStats(userId: number, updates: any) {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { id, userId: uid, ...pureUpdates } = updates;
      const { error } = await supabaseAdmin.from('stats').update(pureUpdates).eq('userId', userId);
      if (!error) return;
    } catch (err) {
      console.error("Lỗi updateUserStats Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      const { id, userId: uid, ...pureUpdates } = updates;
      await dbAdmin.collection('stats').doc(String(userId)).set(pureUpdates, { merge: true });
      return;
    } catch (err) {
      console.error("Lỗi updateUserStats Firestore:", err);
    }
  }

  const index = memoryDb.stats.findIndex(s => s.userId === userId);
  if (index !== -1) {
    memoryDb.stats[index] = { ...memoryDb.stats[index], ...updates };
  } else {
    memoryDb.stats.push({ userId, ...updates });
  }
  persist();
}

export async function getUserSettings(userId: number) {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.from('settings').select('*').eq('userId', userId).maybeSingle();
      if (data && !error) return data;
    } catch (err) {
      console.error("Lỗi getUserSettings Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      const doc = await dbAdmin.collection('settings').doc(String(userId)).get();
      if (doc.exists) return doc.data();
    } catch (err) {
      console.error("Lỗi getUserSettings Firestore:", err);
    }
  }

  let setting = memoryDb.settings.find(s => s.userId === userId);
  if (!setting) {
    setting = {
      userId,
      groqApiKey: '',
      elevenLabsApiKey: '',
      elevenLabsVoiceId: 'pNInz6ob9g9j9ffgIOFa',
      useGoogleTts: true,
      xpSettings: {
        wrongXp: 1,
        levels: {
          "HSK1": { noHint: 10, hint1: 8, hint2: 5, hint3: 2 },
          "HSK2": { noHint: 12, hint1: 10, hint2: 6, hint3: 3 },
          "HSK3": { noHint: 15, hint1: 12, hint2: 8, hint3: 4 },
          "HSK4": { noHint: 18, hint1: 14, hint2: 9, hint3: 5 },
          "HSK5": { noHint: 20, hint1: 16, hint2: 10, hint3: 6 },
          "HSK6": { noHint: 25, hint1: 20, hint2: 12, hint3: 8 },
          "Nâng cao": { noHint: 30, hint1: 24, hint2: 15, hint3: 10 }
        }
      }
    };
    memoryDb.settings.push(setting);
    persist();
  }
  return setting;
}

export async function getDefaultSettings() {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.from('settings').select('*').limit(1).maybeSingle();
      if (data && !error) return data;
    } catch (e) {}
  }
  if (memoryDb.settings.length > 0) return memoryDb.settings[0];
  return {
    groqApiKey: '',
    elevenLabsApiKey: '',
    elevenLabsVoiceId: 'pNInz6ob9g9j9ffgIOFa',
    useGoogleTts: false,
    xpSettings: {
      wrongXp: 1,
      levels: {
        "HSK1": { noHint: 10, hint1: 8, hint2: 5, hint3: 2 },
        "HSK2": { noHint: 12, hint1: 10, hint2: 6, hint3: 3 },
        "HSK3": { noHint: 15, hint1: 12, hint2: 8, hint3: 4 },
        "HSK4": { noHint: 18, hint1: 14, hint2: 9, hint3: 5 },
        "HSK5": { noHint: 20, hint1: 16, hint2: 10, hint3: 6 },
        "HSK6": { noHint: 25, hint1: 20, hint2: 12, hint3: 8 },
        "Nâng cao": { noHint: 30, hint1: 24, hint2: 15, hint3: 10 }
      }
    }
  };
}

export async function updateUserSettings(userId: number, updates: any) {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { id, userId: uid, ...pureUpdates } = updates;
      const { error } = await supabaseAdmin.from('settings').update(pureUpdates).eq('userId', userId);
      if (!error) return;
    } catch (err) {
      console.error("Lỗi updateUserSettings Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      const { id, userId: uid, ...pureUpdates } = updates;
      await dbAdmin.collection('settings').doc(String(userId)).set(pureUpdates, { merge: true });
      return;
    } catch (err) {
      console.error("Lỗi updateUserSettings Firestore:", err);
    }
  }

  const index = memoryDb.settings.findIndex(s => s.userId === userId);
  if (index !== -1) {
    memoryDb.settings[index] = { ...memoryDb.settings[index], ...updates };
  } else {
    memoryDb.settings.push({ userId, ...updates });
  }
  persist();
}

export async function getVocabularyList(userId: number) {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.from('vocabulary').select('*').eq('userId', userId);
      if (data && !error) {
        return data.map((v: any) => ({
          id: v.id,
          userId: v.userId,
          chinese: v.chinese,
          pinyin: v.pinyin,
          translation: v.translation,
          sourceSentence: v.sourceSentence,
          srs: {
            nextReviewDate: v.srsNextReviewDate,
            interval: v.srsInterval,
            easeFactor: v.srsEaseFactor,
            repetitions: v.srsRepetitions
          }
        }));
      }
    } catch (err) {
      console.error("Lỗi getVocabularyList Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      const snapshot = await dbAdmin.collection('vocabulary').where('userId', '==', userId).get();
      return snapshot.docs.map(doc => {
        const v = doc.data();
        return {
          id: v.id,
          userId: v.userId,
          chinese: v.chinese,
          pinyin: v.pinyin,
          translation: v.translation,
          sourceSentence: v.sourceSentence,
          srs: {
            nextReviewDate: v.srsNextReviewDate,
            interval: v.srsInterval,
            easeFactor: v.srsEaseFactor,
            repetitions: v.srsRepetitions
          }
        };
      });
    } catch (err) {
      console.error("Lỗi getVocabularyList Firestore:", err);
    }
  }
  return memoryDb.vocabulary.filter(v => v.userId === userId);
}

export async function saveVocabularyWord(userId: number, wordData: any) {
  const id = wordData.id || `vocab_${userId}_${Date.now()}`;
  
  const vocabEntry: any = {
    id,
    userId,
    chinese: wordData.chinese,
    pinyin: wordData.pinyin,
    translation: wordData.translation,
    sourceSentence: wordData.sourceSentence || null,
    srsNextReviewDate: wordData.srs?.nextReviewDate || new Date().toISOString(),
    srsInterval: wordData.srs?.interval || 1,
    srsEaseFactor: wordData.srs?.easeFactor || 2.5,
    srsRepetitions: wordData.srs?.repetitions || 0,
  };

  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from('vocabulary').upsert(vocabEntry);
      if (!error) return id;
    } catch (err) {
      console.error("Lỗi saveVocabularyWord Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      await dbAdmin.collection('vocabulary').doc(id).set(vocabEntry);
      return id;
    } catch (err) {
      console.error("Lỗi saveVocabularyWord Firestore:", err);
    }
  }

  const index = memoryDb.vocabulary.findIndex(v => v.id === id && v.userId === userId);
  if (index !== -1) {
    memoryDb.vocabulary[index] = { ...memoryDb.vocabulary[index], ...vocabEntry };
  } else {
    memoryDb.vocabulary.push(vocabEntry);
  }
  persist();
  return id;
}

export async function deleteVocabularyWord(userId: number, id: string) {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from('vocabulary').delete().eq('id', id).eq('userId', userId);
      if (!error) return;
    } catch (err) {
      console.error("Lỗi deleteVocabularyWord Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      await dbAdmin.collection('vocabulary').doc(id).delete();
      return;
    } catch (err) {
      console.error("Lỗi deleteVocabularyWord Firestore:", err);
    }
  }

  memoryDb.vocabulary = memoryDb.vocabulary.filter(v => !(v.id === id && v.userId === userId));
  persist();
}

export async function getRevisionItemsList(userId: number) {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.from('revisionItems').select('*').eq('userId', userId);
      if (data && !error) {
        return data.map((r: any) => ({
          id: r.id,
          userId: r.userId,
          sentenceId: r.sentenceId,
          chinese: r.chinese,
          pinyin: r.pinyin,
          translation: r.translation,
          sourceSentence: r.sourceSentence,
          srs: {
            nextReviewDate: r.srsNextReviewDate,
            interval: r.srsInterval,
            easeFactor: r.srsEaseFactor,
            repetitions: r.srsRepetitions
          }
        }));
      }
    } catch (err) {
      console.error("Lỗi getRevisionItemsList Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      const snapshot = await dbAdmin.collection('revisionItems').where('userId', '==', userId).get();
      return snapshot.docs.map(doc => {
        const r = doc.data();
        return {
          id: r.id,
          userId: r.userId,
          sentenceId: r.sentenceId,
          chinese: r.chinese,
          pinyin: r.pinyin,
          translation: r.translation,
          sourceSentence: r.sourceSentence,
          srs: {
            nextReviewDate: r.srsNextReviewDate,
            interval: r.srsInterval,
            easeFactor: r.srsEaseFactor,
            repetitions: r.srsRepetitions
          }
        };
      });
    } catch (err) {
      console.error("Lỗi getRevisionItemsList Firestore:", err);
    }
  }
  return memoryDb.revisionItems.filter(r => r.userId === userId);
}

export async function saveRevisionItem(userId: number, itemData: any) {
  const id = itemData.id || `rev_${userId}_${Date.now()}`;

  const revEntry: any = {
    id,
    userId,
    sentenceId: itemData.sentenceId || itemData.targetId || null,
    chinese: itemData.chinese,
    pinyin: itemData.pinyin,
    translation: itemData.translation,
    sourceSentence: itemData.sourceSentence || null,
    srsNextReviewDate: itemData.srs?.nextReviewDate || new Date().toISOString(),
    srsInterval: itemData.srs?.interval || 1,
    srsEaseFactor: itemData.srs?.easeFactor || 2.5,
    srsRepetitions: itemData.srs?.repetitions || 0,
  };

  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from('revisionItems').upsert(revEntry);
      if (!error) return id;
    } catch (err) {
      console.error("Lỗi saveRevisionItem Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      await dbAdmin.collection('revisionItems').doc(id).set(revEntry);
      return id;
    } catch (err) {
      console.error("Lỗi saveRevisionItem Firestore:", err);
    }
  }

  const index = memoryDb.revisionItems.findIndex(r => r.id === id && r.userId === userId);
  if (index !== -1) {
    memoryDb.revisionItems[index] = { ...memoryDb.revisionItems[index], ...revEntry };
  } else {
    memoryDb.revisionItems.push(revEntry);
  }
  persist();
  return id;
}

export async function deleteRevisionItem(userId: number, id: string) {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from('revisionItems').delete().eq('id', id).eq('userId', userId);
      if (!error) return;
    } catch (err) {
      console.error("Lỗi deleteRevisionItem Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      await dbAdmin.collection('revisionItems').doc(id).delete();
      return;
    } catch (err) {
      console.error("Lỗi deleteRevisionItem Firestore:", err);
    }
  }

  memoryDb.revisionItems = memoryDb.revisionItems.filter(r => !(r.id === id && r.userId === userId));
  persist();
}

export async function getLessonsList() {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { data: dbLessons, error: errL } = await supabaseAdmin.from('lessons').select('*');
      const { data: dbSentences, error: errS } = await supabaseAdmin.from('sentences').select('*');
      
      if (dbLessons && !errL) {
        const mappedLessons = await Promise.all(dbLessons.map(async (lesson: any) => {
          const lessonSentences = await Promise.all((dbSentences || [])
            .filter((s: any) => (s.lesson_id || s.lessonId) === lesson.id)
            .map(async (s: any) => ({
              id: s.id,
              chinese: s.chinese,
              pinyin: s.pinyin,
              translation: s.translation,
              explanation: s.explanation,
              audioUrl: await resolveUrl(s.audio_url || s.audioUrl || "")
            })));

          return {
            id: lesson.id,
            title: lesson.title,
            level: lesson.level,
            topic: lesson.topic,
            createdAt: lesson.created_at || lesson.createdAt || new Date().toISOString(),
            sentences: lessonSentences
          };
        }));
        return mappedLessons;
      }
    } catch (err) {
      console.error("Lỗi getLessonsList Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();

  if (useFirebase && dbAdmin) {
    try {
      const lessonsSnapshot = await dbAdmin.collection('lessons').get();
      const sentencesSnapshot = await dbAdmin.collection('sentences').get();
      
      const dbLessons = lessonsSnapshot.docs.map(doc => doc.data());
      const dbSentences = sentencesSnapshot.docs.map(doc => doc.data());
      
      if (dbLessons) {
        const mappedLessons = await Promise.all(dbLessons.map(async (lesson: any) => {
          const lessonSentences = await Promise.all((dbSentences || [])
            .filter((s: any) => s.lessonId === lesson.id)
            .map(async (s: any) => ({
              id: s.id,
              chinese: s.chinese,
              pinyin: s.pinyin,
              translation: s.translation,
              explanation: s.explanation,
              audioUrl: await resolveUrl(s.audioUrl || "")
            })));

          return {
            id: lesson.id,
            title: lesson.title,
            level: lesson.level,
            topic: lesson.topic,
            createdAt: lesson.createdAt || new Date().toISOString(),
            sentences: lessonSentences
          };
        }));
        return mappedLessons;
      }
    } catch (err) {
      console.error("Lỗi getLessonsList Firestore:", err);
    }
  }

  const mappedLessons = await Promise.all(memoryDb.lessons.map(async (lesson) => {
    const lessonSentences = await Promise.all(memoryDb.sentences
      .filter(s => s.lessonId === lesson.id)
      .map(async (s) => ({
        id: s.id,
        chinese: s.chinese,
        pinyin: s.pinyin,
        translation: s.translation,
        explanation: s.explanation,
        audioUrl: await resolveUrl(s.audioUrl || "")
      })));

    return {
      id: lesson.id,
      title: lesson.title,
      level: lesson.level,
      topic: lesson.topic,
      createdAt: lesson.createdAt || new Date().toISOString(),
      sentences: lessonSentences
    };
  }));
  return mappedLessons;
}

export async function saveLessonWithSentences(lessonData: any) {
  const lessonId = lessonData.id || `lesson_${Date.now()}`;
  const useSupabase = await checkSupabase();

  if (useSupabase && supabaseAdmin) {
    try {
      const lessonEntryDb = {
        id: lessonId,
        title: lessonData.title,
        level: lessonData.level,
        topic: lessonData.topic,
        created_at: lessonData.createdAt || lessonData.created_at || new Date().toISOString()
      };

      // Clean up old audio files
      const { data: oldSentences, error: errS } = await supabaseAdmin.from('sentences').select('audio_url').eq('lesson_id', lessonId);
      const oldUrls = (oldSentences || []).map((s: any) => s.audio_url || s.audioUrl).filter(Boolean);
      const newUrls = (lessonData.sentences || []).map((s: any) => extractStoragePath(s.audioUrl || s.audio_url)).filter(Boolean);

      for (const oldUrl of oldUrls) {
        const oldPath = extractStoragePath(oldUrl);
        if (oldPath && !newUrls.includes(oldPath)) {
          await deleteStorageFile(oldUrl);
        }
      }

      const { error: lessonErr } = await supabaseAdmin.from('lessons').upsert(lessonEntryDb);
      if (lessonErr) {
        throw new Error(`Failed to upsert lesson: ${lessonErr.message}`);
      }

      if (lessonData.sentences && Array.isArray(lessonData.sentences)) {
        const { error: deleteErr } = await supabaseAdmin.from('sentences').delete().eq('lesson_id', lessonId);
        if (deleteErr) {
          throw new Error(`Failed to delete old sentences: ${deleteErr.message}`);
        }
        
        for (let i = 0; i < lessonData.sentences.length; i++) {
          const s = lessonData.sentences[i];
          const sentId = s.id || `sent_${lessonId}_${i}_${Date.now()}`;
          const sentEntry = {
            id: sentId,
            lesson_id: lessonId,
            chinese: s.chinese,
            pinyin: s.pinyin || "",
            translation: s.translation,
            explanation: s.explanation || "",
            audio_url: extractStoragePath(s.audioUrl || s.audio_url || "")
          };
          const { error: insertErr } = await supabaseAdmin.from('sentences').insert(sentEntry);
          if (insertErr) {
            throw new Error(`Failed to insert sentence at index ${i}: ${insertErr.message}`);
          }
        }
      }
      return lessonId;
    } catch (err: any) {
      console.error("Lỗi khi lưu bài học vào Supabase:", err);
      throw new Error(`Supabase Error: ${err.message || err}`);
    }
  }

  const useFirebase = await checkFirebase();

  if (useFirebase && dbAdmin) {
    try {
      const lessonEntryDb = {
        id: lessonId,
        title: lessonData.title,
        level: lessonData.level,
        topic: lessonData.topic,
        createdAt: lessonData.createdAt || lessonData.created_at || new Date().toISOString()
      };

      // Clean up old audio files first if they are replaced/removed
      const oldSentencesSnapshot = await dbAdmin.collection('sentences').where('lessonId', '==', lessonId).get();
      const oldSentences = oldSentencesSnapshot.docs.map(doc => doc.data());

      const oldUrls = (oldSentences || []).map((s: any) => s.audioUrl || s.audio_url).filter(Boolean);
      const newUrls = (lessonData.sentences || []).map((s: any) => extractStoragePath(s.audioUrl || s.audio_url)).filter(Boolean);

      for (const oldUrl of oldUrls) {
        const oldPath = extractStoragePath(oldUrl);
        if (oldPath && !newUrls.includes(oldPath)) {
          await deleteStorageFile(oldUrl);
        }
      }

      await dbAdmin.collection('lessons').doc(lessonId).set(lessonEntryDb);

      if (lessonData.sentences && Array.isArray(lessonData.sentences)) {
        // Clear old sentences from Firestore
        const batch = dbAdmin.batch();
        oldSentencesSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        
        for (let i = 0; i < lessonData.sentences.length; i++) {
          const s = lessonData.sentences[i];
          const sentId = s.id || `sent_${lessonId}_${i}_${Date.now()}`;
          const sentEntry = {
            id: sentId,
            lessonId: lessonId,
            chinese: s.chinese,
            pinyin: s.pinyin || "",
            translation: s.translation,
            explanation: s.explanation || "",
            audioUrl: extractStoragePath(s.audioUrl || s.audio_url || "")
          };
          await dbAdmin.collection('sentences').doc(sentId).set(sentEntry);
        }
      }
      return lessonId;
    } catch (err: any) {
      console.error("Lỗi khi lưu bài học vào Firestore:", err);
      throw new Error(`Firestore Error: ${err.message || err}`);
    }
  }

  const lessonEntry = {
    id: lessonId,
    title: lessonData.title,
    level: lessonData.level,
    topic: lessonData.topic,
    createdAt: lessonData.createdAt || new Date().toISOString()
  };

  // Handle memory database old audio cleanup
  const oldSentences = memoryDb.sentences.filter(s => s.lessonId === lessonId);
  const oldUrls = oldSentences.map((s: any) => s.audioUrl).filter(Boolean);
  const newUrls = (lessonData.sentences || []).map((s: any) => extractStoragePath(s.audioUrl)).filter(Boolean);

  for (const oldUrl of oldUrls) {
    const oldPath = extractStoragePath(oldUrl);
    if (oldPath && !newUrls.includes(oldPath)) {
      await deleteStorageFile(oldUrl);
    }
  }

  const lessonIndex = memoryDb.lessons.findIndex(l => l.id === lessonId);
  if (lessonIndex !== -1) {
    memoryDb.lessons[lessonIndex] = { ...memoryDb.lessons[lessonIndex], ...lessonEntry };
  } else {
    memoryDb.lessons.push(lessonEntry);
  }

  if (lessonData.sentences && Array.isArray(lessonData.sentences)) {
    // Clear old sentences
    memoryDb.sentences = memoryDb.sentences.filter(s => s.lessonId !== lessonId);

    for (let i = 0; i < lessonData.sentences.length; i++) {
      const s = lessonData.sentences[i];
      const sentId = s.id || `sent_${lessonId}_${i}_${Date.now()}`;
      memoryDb.sentences.push({
        id: sentId,
        lessonId,
        chinese: s.chinese,
        pinyin: s.pinyin || "",
        translation: s.translation,
        explanation: s.explanation || "",
        audioUrl: extractStoragePath(s.audioUrl || ""),
      });
    }
  }
  
  persist();
  return lessonId;
}

export async function deleteLessonFromDb(id: string) {
  const useSupabase = await checkSupabase();
  const useFirebase = await checkFirebase();

  let sentencesToDelete: any[] = [];
  if (useSupabase && supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin.from('sentences').select('audio_url').eq('lesson_id', id);
      sentencesToDelete = (data || []).map((s: any) => ({ audioUrl: s.audio_url || s.audioUrl }));
    } catch (err) {
      console.error(err);
    }
  } else if (useFirebase && dbAdmin) {
    try {
      const sentencesSnapshot = await dbAdmin.collection('sentences').where('lessonId', '==', id).get();
      sentencesToDelete = sentencesSnapshot.docs.map(doc => doc.data());
    } catch (err) {
      console.error(err);
    }
  } else {
    sentencesToDelete = memoryDb.sentences.filter(s => s.lessonId === id);
  }

  for (const s of sentencesToDelete) {
    if (s.audioUrl) {
      await deleteStorageFile(s.audioUrl);
    }
  }

  if (useSupabase && supabaseAdmin) {
    try {
      const { error: deleteSentencesErr } = await supabaseAdmin.from('sentences').delete().eq('lesson_id', id);
      if (deleteSentencesErr) {
        throw new Error(`Failed to delete sentences: ${deleteSentencesErr.message}`);
      }
      const { error: deleteLessonErr } = await supabaseAdmin.from('lessons').delete().eq('id', id);
      if (deleteLessonErr) {
        throw new Error(`Failed to delete lesson: ${deleteLessonErr.message}`);
      }
      return;
    } catch (err: any) {
      console.error("Lỗi khi xóa bài học từ Supabase:", err);
      throw err;
    }
  }

  if (useFirebase && dbAdmin) {
    try {
      const sentencesSnapshot = await dbAdmin.collection('sentences').where('lessonId', '==', id).get();
      const batch = dbAdmin.batch();
      sentencesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      await dbAdmin.collection('lessons').doc(id).delete();
      return;
    } catch (err) {
      console.error(err);
    }
  }

  memoryDb.lessons = memoryDb.lessons.filter(l => l.id !== id);
  memoryDb.sentences = memoryDb.sentences.filter(s => s.lessonId !== id);
  persist();
}

export async function updateAudioUrl(sentenceId: string, url: string) {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      await supabaseAdmin.from('sentences').update({ audioUrl: url }).eq('id', sentenceId);
      return;
    } catch (err) {
      console.error(err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      await dbAdmin.collection('sentences').doc(sentenceId).set({ audioUrl: url }, { merge: true });
      return;
    } catch (err) {
      console.error(err);
    }
  }

  const sentence = memoryDb.sentences.find(s => s.id === sentenceId);
  if (sentence) {
    sentence.audioUrl = url;
    persist();
  }
}

export async function seedInitialLessons() {
  const lessonsCount = memoryDb.lessons.length;
  if (lessonsCount > 0) {
    return;
  }
  console.log("Seeding initial lessons...");
  
  const initialLessons = [
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
      title: "Mua sắm ở siêu thị tiện lợi",
      level: "HSK2",
      topic: "đời sống",
      sentences: [
        {
          id: "sent_hsk2_1",
          chinese: "这件衣服多少钱？",
          pinyin: "Zhè jiàn yīfu duōshao qián?",
          translation: "Bộ quần áo này bao nhiêu tiền?",
          explanation: "1. 这 (zhè): đây, này.\n2. 件 (jiàn): lượng từ cho quần áo, sự việc.\n3. 衣服 (yīfu): quần áo.\n4. 多少 (duōshao): bao nhiêu.\n5. 钱 (qián): tiền."
        },
        {
          id: "sent_hsk2_2",
          chinese: "这里可以刷卡吗？",
          pinyin: "Zhèlǐ kěyǐ shuākǎ ma?",
          translation: "Ở đây có thể quẹt thẻ không?",
          explanation: "1. 这里 (zhèlǐ): ở đây.\n2. 可以 (kěyǐ): có thể.\n3. 刷卡 (shuākǎ): quẹt thẻ, quẹt tín dụng.\n4. 吗 (ma): trợ từ nghi vấn."
        }
      ]
    }
  ];

  for (const l of initialLessons) {
    await saveLessonWithSentences(l);
  }
}

export function resetDatabase() {
  memoryDb = {
    users: [],
    stats: [],
    settings: [],
    vocabulary: [],
    revisionItems: [],
    lessons: [],
    sentences: []
  };
  persist();
}

export async function adminGetAllUsersWithStats(): Promise<any[]> {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const { data: users, error: errU } = await supabaseAdmin.from('users').select('*');
      const { data: stats, error: errS } = await supabaseAdmin.from('stats').select('*');
      
      if (users && !errU) {
        const columns = await probeUserColumns();
        let statsMap: Record<string, any> = {};
        (stats || []).forEach((s: any) => {
          statsMap[s.userId] = s;
        });

        return users.map((u: any) => {
          const mappedUser = mapDbUserToApp(u, columns);
          return {
            ...mappedUser,
            stats: statsMap[mappedUser.id] || {
              userId: mappedUser.id,
              totalLessons: 0,
              totalCorrect: 0,
              totalWrong: 0,
              totalXp: 0,
              vocabCount: 0,
              streak: 0,
              dailyProgress: {}
            }
          };
        });
      }
    } catch (err) {
      console.error("Lỗi khi admin lấy danh sách users từ Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      const usersSnapshot = await dbAdmin.collection('users').get();
      const statsSnapshot = await dbAdmin.collection('stats').get();
      
      const users = usersSnapshot.docs.map(doc => doc.data());
      const stats = statsSnapshot.docs.map(doc => doc.data());

      let statsMap: Record<string, any> = {};
      stats.forEach((s: any) => {
        statsMap[s.userId] = s;
      });

      return users.map((u: any) => ({
        ...u,
        stats: statsMap[u.id] || {
          userId: u.id,
          totalLessons: 0,
          totalCorrect: 0,
          totalWrong: 0,
          totalXp: 0,
          vocabCount: 0,
          streak: 0,
          dailyProgress: {}
        }
      }));
    } catch (err) {
      console.error("Lỗi khi admin lấy danh sách users từ Firestore:", err);
    }
  }

  // Fallback to local memoryDb
  return memoryDb.users.map((u: any) => {
    const s = memoryDb.stats.find(st => st.userId === u.id) || {
      userId: u.id,
      totalLessons: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalXp: 0,
      vocabCount: 0,
      streak: 0,
      dailyProgress: {}
    };
    return { ...u, stats: s };
  });
}

export async function adminDeleteUser(idToDelete: any): Promise<void> {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const numericId = Number(idToDelete);
      const tables = ['stats', 'settings', 'vocabulary', 'revisionItems'];
      for (const t of tables) {
        await supabaseAdmin.from(t).delete().eq('userId', numericId);
      }
      await supabaseAdmin.from('users').delete().eq('id', numericId);
      return;
    } catch (err) {
      console.error("Lỗi khi admin xóa user từ Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  
  if (useFirebase && dbAdmin) {
    try {
      const numericId = Number(idToDelete);
      const collections = ['stats', 'settings', 'vocabulary', 'revisionItems'];
      
      for (const col of collections) {
        const snapshot = await dbAdmin.collection(col).where('userId', '==', numericId).get();
        const batch = dbAdmin.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }

      const usersSnapshot = await dbAdmin.collection('users').where('id', '==', numericId).get();
      const userBatch = dbAdmin.batch();
      usersSnapshot.docs.forEach(doc => userBatch.delete(doc.ref));
      await userBatch.commit();
      return;
    } catch (err) {
      console.error("Lỗi khi admin xóa user từ Firestore:", err);
    }
  }

  // Fallback to memoryDb
  memoryDb.users = memoryDb.users.filter(u => u.id !== idToDelete && u.id != idToDelete);
  memoryDb.stats = memoryDb.stats.filter(s => s.userId !== idToDelete && s.userId != idToDelete);
  memoryDb.settings = memoryDb.settings.filter(s => s.userId !== idToDelete && s.userId != idToDelete);
  memoryDb.vocabulary = memoryDb.vocabulary.filter(v => v.userId !== idToDelete && v.userId != idToDelete);
  memoryDb.revisionItems = memoryDb.revisionItems.filter(r => r.userId !== idToDelete && r.userId != idToDelete);
  persist();
}

export async function adminUpdateUserStats(userId: any, statsUpdates: any): Promise<void> {
  const useSupabase = await checkSupabase();
  if (useSupabase && supabaseAdmin) {
    try {
      const numericId = Number(userId);
      const { id, userId: uid, ...pureUpdates } = statsUpdates;
      await supabaseAdmin.from('stats').update(pureUpdates).eq('userId', numericId);
      return;
    } catch (err) {
      console.error("Lỗi khi admin cập nhật stats trên Supabase:", err);
    }
  }

  const useFirebase = await checkFirebase();
  if (useFirebase && dbAdmin) {
    try {
      const numericId = Number(userId);
      const { id, userId: uid, ...pureUpdates } = statsUpdates;
      await dbAdmin.collection('stats').doc(String(numericId)).set(pureUpdates, { merge: true });
      return;
    } catch (err) {
      console.error("Lỗi khi admin cập nhật stats trên Firestore:", err);
    }
  }

  const stat = memoryDb.stats.find(s => s.userId === userId || s.userId == userId);
  if (stat) {
    Object.assign(stat, statsUpdates);
    persist();
  }
}

export async function updateUserProfile(userId: number, updates: { displayName?: string, photoUrl?: string, phone?: string | null, birthday?: string | null }): Promise<any> {
  const useSupabase = await checkSupabase();
  const useFirebase = await checkFirebase();
  const numericId = Number(userId);
  
  let oldPhotoUrl: string | null = null;
  const columns = await probeUserColumns();
  
  if (useSupabase && supabaseAdmin) {
    try {
      const selectCol = columns.photoUrl || 'photoUrl';
      const { data } = await supabaseAdmin.from('users').select(selectCol).eq('id', numericId).maybeSingle();
      if (data) oldPhotoUrl = data[selectCol];
    } catch (e) {}
  } else if (useFirebase && dbAdmin) {
    try {
      const userSnapshot = await dbAdmin.collection('users').where('id', '==', numericId).get();
      if (!userSnapshot.empty) {
        oldPhotoUrl = userSnapshot.docs[0].data().photoUrl;
      }
    } catch (e) {}
  } else {
    const user = memoryDb.users.find(u => u.id === userId || u.id == userId);
    if (user) oldPhotoUrl = user.photoUrl;
  }

  const newPhotoUrlClean = updates.photoUrl !== undefined ? extractStoragePath(updates.photoUrl) : undefined;

  if (newPhotoUrlClean !== undefined && oldPhotoUrl && extractStoragePath(oldPhotoUrl) !== newPhotoUrlClean) {
    await deleteStorageFile(oldPhotoUrl);
  }

  const cleanUpdates = {
    ...updates,
    ...(updates.photoUrl !== undefined ? { photoUrl: newPhotoUrlClean } : {})
  };

  if (useSupabase && supabaseAdmin) {
    try {
      const supabaseUpdates: any = {};
      if (columns.displayName && updates.displayName !== undefined) {
        supabaseUpdates[columns.displayName] = updates.displayName;
      }
      if (columns.photoUrl && updates.photoUrl !== undefined) {
        supabaseUpdates[columns.photoUrl] = newPhotoUrlClean;
      }
      if (columns.phone && updates.phone !== undefined) {
        supabaseUpdates[columns.phone] = updates.phone;
      }
      if (columns.birthday && updates.birthday !== undefined) {
        supabaseUpdates[columns.birthday] = updates.birthday;
      }

      const { data, error } = await supabaseAdmin.from('users').update(supabaseUpdates).eq('id', numericId).select().single();
      if (data && !error) {
        return mapDbUserToApp(data, columns);
      }
    } catch (err) {
      console.error("Lỗi khi cập nhật thông tin cá nhân trên Supabase:", err);
    }
  }

  if (useFirebase && dbAdmin) {
    try {
      const userSnapshot = await dbAdmin.collection('users').where('id', '==', numericId).get();
      if (!userSnapshot.empty) {
        const userDoc = userSnapshot.docs[0];
        await userDoc.ref.set(cleanUpdates, { merge: true });
        const updatedDoc = await userDoc.ref.get();
        const data = updatedDoc.data()!;
        return {
          ...data,
          photoUrl: await resolveUrl(data.photoUrl)
        };
      }
    } catch (err) {
      console.error("Lỗi khi cập nhật thông tin cá nhân trên Firestore:", err);
    }
  }

  const user = memoryDb.users.find(u => u.id === userId || u.id == userId);
  if (user) {
    if (updates.displayName !== undefined) user.displayName = updates.displayName;
    if (newPhotoUrlClean !== undefined) user.photoUrl = newPhotoUrlClean;
    if (updates.phone !== undefined) user.phone = updates.phone;
    if (updates.birthday !== undefined) user.birthday = updates.birthday;
    persist();
    return {
      ...user,
      photoUrl: await resolveUrl(user.photoUrl)
    };
  }
  return null;
}

export function getCustomAvatars(): string[] {
  return memoryDb.customAvatars || [];
}

export function addCustomAvatar(url: string): string[] {
  if (!memoryDb.customAvatars) {
    memoryDb.customAvatars = [];
  }
  if (!memoryDb.customAvatars.includes(url)) {
    memoryDb.customAvatars.push(url);
    persist();
  }
  return memoryDb.customAvatars;
}

export function deleteCustomAvatar(url: string): string[] {
  if (memoryDb.customAvatars) {
    memoryDb.customAvatars = memoryDb.customAvatars.filter(u => u !== url);
    persist();
  }
  return memoryDb.customAvatars || [];
}
