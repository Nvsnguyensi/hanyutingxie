export interface Sentence {
  id: string;
  chinese: string;
  pinyin: string;
  translation: string;
  explanation: string;
  audioUrl?: string; // Optional if TTS is generated, otherwise falls back to browser voice or inline audio
}

export interface Lesson {
  id: string;
  title: string;
  level: string; // HSK1, HSK2, etc.
  topic: string;
  sentences: Sentence[];
  createdAt: string;
}

export interface SRSState {
  repetitions: number;
  interval: number; // in days
  easeFactor: number;
  nextReviewDate: string; // ISO string date
}

export interface VocabularyWord {
  id: string;
  chinese: string;
  pinyin: string;
  translation: string;
  sourceSentence?: string;
  createdAt: string;
  srs: SRSState;
}

export interface RevisionItem {
  id: string;
  type: 'sentence' | 'word';
  targetId: string; // sentence ID or vocab ID
  chinese: string;
  pinyin: string;
  translation: string;
  audioUrl?: string; // For sentences
  explanation?: string; // For vocabulary explanations
  srs: SRSState;
}

export interface UserStats {
  totalLessons: number;
  totalCorrect: number;
  totalWrong: number;
  totalXp: number;
  vocabCount: number;
  dueCount: number;
  streak: number;
  lastPracticeDate?: string;
  dailyProgress: { [date: string]: number }; // date -> XP gained
  isPremium?: boolean;
}

export interface SystemSettings {
  groqApiKey: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  useGoogleTts?: boolean;
  defaultPlaybackSpeed?: number;
  voiceGender?: "female" | "male";
  xpSettings?: {
    wrongXp: number;
    levels: {
      [level: string]: {
        noHint: number;
        hint1: number;
        hint2: number;
        hint3: number;
      };
    };
  };
  menuLabels?: {
    dashboard?: string;
    practice?: string;
    revision?: string;
    wordbook?: string;
    admin?: string;
  };
}

export interface DatabaseState {
  lessons: Lesson[];
  vocabulary: VocabularyWord[];
  revisionItems: RevisionItem[];
  stats: UserStats;
  settings: SystemSettings;
}

export interface ClientUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  phone?: string | null;
  birthday?: string | null;
  getIdToken?: () => Promise<string>;
}

