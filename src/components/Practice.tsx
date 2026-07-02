import React, { useState, useEffect, useRef } from "react";
import { 
  Play, RotateCcw, CheckCircle2, ChevronRight, HelpCircle, 
  BookOpen, Volume2, Info, AlertCircle, Award, Sparkles, Sliders, ChevronLeft, Pause
} from "lucide-react";
import { Lesson, Sentence, SystemSettings, UserStats } from "../types";
import ClickableChinese from "./ClickableChinese";
import { playSuccessChime } from "../lib/audio";

import confetti from "canvas-confetti";

interface PracticeProps {
  lessons: Lesson[];
  stats: UserStats | null;
  onAddXp: (xp: number, isCorrect: boolean, wrongWord?: any, wrongSentence?: any, lessonCompleted?: boolean) => void;
  onRefreshStats: () => void;
  onBackToDashboard: () => void;
  settings: SystemSettings | null;
  onLookupWord: (word: string) => void;
}

export default function Practice({ lessons, stats, onAddXp, onRefreshStats, onBackToDashboard, settings, onLookupWord }: PracticeProps) {
  // Navigation & selection
  const [selectedLevel, setSelectedLevel] = useState<string>("HSK1");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [availableLessons, setAvailableLessons] = useState<Lesson[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  
  // Pending resume session progress
  const [pendingResume, setPendingResume] = useState<{
    lesson: Lesson;
    idx: number;
    ans: string;
  } | null>(null);

  // Lesson-specific progress map: { [lessonId]: nextSentenceIdx }
  const [lessonsProgress, setLessonsProgress] = useState<{[lessonId: string]: number}>(() => {
    try {
      const saved = localStorage.getItem("chinese_dictation_lessons_progress");
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error("Lỗi đọc tiến trình bài học:", e);
      return {};
    }
  });

  // Practice session state
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState<number>(0);
  const [userAnswer, setUserAnswer] = useState<string>("");
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => {
    return settings?.defaultPlaybackSpeed || 1.0;
  });
  const [listenCount, setListenCount] = useState<number>(0);
  const [audioLoading, setAudioLoading] = useState<boolean>(false);
  
  // Hint system
  const [hintLevel, setHintLevel] = useState<number>(0); // 0: no hint, 1: translation, 2: pinyin, 3: full chinese characters
  const [xpEarned, setXpEarned] = useState<number>(0);
  
  // Audio state
  const [isElevenLabsActive, setIsElevenLabsActive] = useState<boolean>(false);
  
  // Audio progress and playback states
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);

  // Stop and clean up any playing audio
  const stopCurrentAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (e) {
        console.error(e);
      }
      audioRef.current.onplay = null;
      audioRef.current.onpause = null;
      audioRef.current.onended = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.ondurationchange = null;
      audioRef.current.onloadedmetadata = null;
      audioRef.current = null;
    }
    setIsAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const setupAudioListeners = (audio: HTMLAudioElement) => {
    audioRef.current = audio;
    
    audio.onplay = () => {
      setIsAudioPlaying(true);
    };

    audio.onpause = () => {
      setIsAudioPlaying(false);
    };

    audio.onended = () => {
      setIsAudioPlaying(false);
      setAudioCurrentTime(audio.duration || 0);
    };

    audio.ontimeupdate = () => {
      setAudioCurrentTime(audio.currentTime);
    };

    audio.ondurationchange = () => {
      setAudioDuration(audio.duration || 0);
    };

    audio.onloadedmetadata = () => {
      setAudioDuration(audio.duration || 0);
    };
  };

  const playAndTrackAudio = (audio: HTMLAudioElement) => {
    stopCurrentAudio();
    audio.playbackRate = playbackSpeed;
    setupAudioListeners(audio);
    setIsAudioPlaying(true);
    
    return audio.play()
      .then(() => {
        setListenCount(prev => prev + 1);
      });
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs)) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, []);

  // Synchronize default playback speed from settings
  useEffect(() => {
    if (settings?.defaultPlaybackSpeed) {
      setPlaybackSpeed(settings.defaultPlaybackSpeed);
    }
  }, [settings]);
  
  const levels = ["HSK1", "HSK2", "HSK3", "HSK4", "HSK5", "HSK6", "Nâng cao"];
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);

  // Dynamically extract and consolidate topics from default list + custom database lessons
  useEffect(() => {
    const baseTopics = [
      { id: "all", name: "Tất cả chủ đề" },
      { id: "giao tiếp", name: "Giao tiếp" },
      { id: "đời sống", name: "Đời sống" },
      { id: "công việc", name: "Công việc" },
      { id: "thương mại", name: "Thương mại" },
      { id: "nhà máy", name: "Nhà máy" },
      { id: "mua hàng", name: "Mua hàng" },
      { id: "du lịch", name: "Du lịch" },
      { id: "công nghệ", name: "Công nghệ" },
      { id: "văn hóa", name: "Văn hóa" },
      { id: "giáo dục", name: "Giáo dục" },
    ];

    const customTopicsSet = new Set<string>();
    lessons.forEach((l) => {
      if (l.topic) {
        const t = l.topic.trim().toLowerCase();
        if (t && !baseTopics.some((bt) => bt.id === t)) {
          customTopicsSet.add(t);
        }
      }
    });

    const customTopics = Array.from(customTopicsSet).map((t) => ({
      id: t,
      name: t.charAt(0).toUpperCase() + t.slice(1),
    }));

    setTopics([...baseTopics, ...customTopics]);
  }, [lessons]);

  // Filter lessons based on level and topic
  useEffect(() => {
    const filtered = lessons.filter(
      (l) => {
        const levelMatch = l.level.toUpperCase().trim() === selectedLevel.toUpperCase().trim();
        const topicMatch = selectedTopic === "all" || l.topic.toLowerCase().trim() === selectedTopic.toLowerCase().trim();
        return levelMatch && topicMatch;
      }
    );
    setAvailableLessons(filtered);
  }, [selectedLevel, selectedTopic, lessons]);

  // Load saved progress from localStorage on lessons load
  useEffect(() => {
    if (!lessons || lessons.length === 0) return;
    const saved = localStorage.getItem("chinese_dictation_practice_progress");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.selectedLevel) setSelectedLevel(parsed.selectedLevel);
        if (parsed.selectedTopic) setSelectedTopic(parsed.selectedTopic);
        
        if (parsed.activeLessonId) {
          const foundLesson = lessons.find(l => l.id === parsed.activeLessonId);
          if (foundLesson) {
            setPendingResume({
              lesson: foundLesson,
              idx: parsed.currentSentenceIdx || 0,
              ans: parsed.userAnswer || ""
            });
          }
        }
      } catch (e) {
        console.error("Lỗi phục hồi tiến trình:", e);
      }
    }
  }, [lessons]);

  // Save current progress to localStorage automatically as the user types/advances
  useEffect(() => {
    if (activeLesson) {
      localStorage.setItem("chinese_dictation_practice_progress", JSON.stringify({
        selectedLevel,
        selectedTopic,
        activeLessonId: activeLesson.id,
        currentSentenceIdx,
        userAnswer
      }));

      // Automatically save/update the current sentence index for this specific lesson
      setLessonsProgress(prev => {
        const nextProgress = {
          ...prev,
          [activeLesson.id]: currentSentenceIdx
        };
        localStorage.setItem("chinese_dictation_lessons_progress", JSON.stringify(nextProgress));
        return nextProgress;
      });
    } else {
      localStorage.setItem("chinese_dictation_practice_progress", JSON.stringify({
        selectedLevel,
        selectedTopic,
        activeLessonId: null,
        currentSentenceIdx: 0,
        userAnswer: ""
      }));
    }
  }, [activeLesson, currentSentenceIdx, userAnswer, selectedLevel, selectedTopic]);

  const startLesson = (lesson: Lesson) => {
    stopCurrentAudio();
    setActiveLesson(lesson);
    
    // Retrieve progress specifically for this lesson
    const savedIdx = lessonsProgress[lesson.id] || 0;
    // If they already finished the lesson (savedIdx === sentences.length), start over from 0
    let targetIdx = (savedIdx >= 0 && savedIdx < (lesson.sentences?.length || 0)) ? savedIdx : 0;

    setCurrentSentenceIdx(targetIdx);
    setUserAnswer("");
    setIsSubmitted(false);
    setHintLevel(0);
    setXpEarned(0);
    setListenCount(0);
    setPendingResume(null); // Clear any pending general resume
    
    // Trigger initial audio play
    setTimeout(() => {
      playSentenceAudio(lesson.sentences[targetIdx]);
    }, 500);
  };

  const activeSentence: Sentence | null = activeLesson 
    ? activeLesson.sentences[currentSentenceIdx] 
    : null;

  // Browser TTS (SpeechSynthesis) TTS engine with custom speed
  const playBrowserTTS = (text: string) => {
    try {
      const gTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(text)}`;
      const audio = new Audio(gTtsUrl);
      playAndTrackAudio(audio)
        .catch(() => {
          // If browser blocks audio autoplay or fails, fall back to Web Speech synthesis
          playSpeechSynthesisFallback(text);
        });
    } catch (e) {
      playSpeechSynthesisFallback(text);
    }
  };

  const playSpeechSynthesisFallback = (text: string) => {
    if (!window.speechSynthesis) {
      alert("Trình duyệt của bạn không hỗ trợ công cụ đọc giọng nói Web Speech.");
      return;
    }
    window.speechSynthesis.cancel(); // Stop active voices
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = playbackSpeed; // 0.5 to 1.25
    
    // Attempt to set a high-quality Chinese voice based on gender settings
    const voices = window.speechSynthesis.getVoices();
    const zhVoices = voices.filter(v => v.lang.includes("zh-CN") || v.lang.includes("ZH-CN") || v.lang.includes("CHN"));
    
    let selectedVoice = zhVoices[0];
    if (settings?.voiceGender) {
      const isMalePreferred = settings.voiceGender === "male";
      const maleKeywords = ["male", "yunxi", "kangkang", "yunjian", "yunxia", "hanhan", "man", "nam"];
      const femaleKeywords = ["female", "xiaoxiao", "huihui", "yaoyao", "xiaoyi", "woman", "nữ"];
      const targetKeywords = isMalePreferred ? maleKeywords : femaleKeywords;
      
      const matched = zhVoices.find(v => {
        const nameLower = v.name.toLowerCase();
        return targetKeywords.some(keyword => nameLower.includes(keyword));
      });
      if (matched) {
        selectedVoice = matched;
      }
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    window.speechSynthesis.speak(utterance);
    setListenCount(prev => prev + 1);
  };

  const playSentenceAudio = async (sentence: Sentence) => {
    if (!sentence) return;

    // If the sentence has a generated/cached audio file, play it
    if (sentence.audioUrl) {
      setAudioLoading(true);
      try {
        const audio = new Audio(sentence.audioUrl);
        setAudioLoading(false);
        playAndTrackAudio(audio)
          .catch((playErr) => {
            console.error("Failed to play custom audioUrl, falling back to Google voice:", playErr);
            setAudioLoading(false);
            setIsElevenLabsActive(false);
            playBrowserTTS(sentence.chinese);
          });
        setIsElevenLabsActive(true);
      } catch (err) {
        setAudioLoading(false);
        setIsElevenLabsActive(false);
        playBrowserTTS(sentence.chinese);
      }
    } else {
      // Dynamic TTS generation if no audioUrl exists yet!
      setAudioLoading(true);
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sentence.chinese, sentenceId: sentence.id })
        });
        const data = await res.json();
        if (data.status === "success" && data.audioUrl) {
          // Save and cache the audioUrl on the client sentence object
          sentence.audioUrl = data.audioUrl;
          
          const audio = new Audio(data.audioUrl);
          setAudioLoading(false);
          playAndTrackAudio(audio)
            .catch(() => {
              setAudioLoading(false);
            });
          setIsElevenLabsActive(true);
        } else {
          // Fallback to browser SpeechSynthesis if generation wasn't fully successful
          setAudioLoading(false);
          setIsElevenLabsActive(false);
          playBrowserTTS(sentence.chinese);
        }
      } catch (err) {
        setAudioLoading(false);
        setIsElevenLabsActive(false);
        playBrowserTTS(sentence.chinese);
      }
    }
  };

  // Listen for Space key to replay audio
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeLesson || !activeSentence) return;

      const isInputFocused = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";
      
      if (event.key === " " || event.key === "Spacebar") {
        if (!isInputFocused) {
          event.preventDefault();
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          } else {
            playSentenceAudio(activeSentence);
          }
        } else if (event.ctrlKey || event.shiftKey) {
          event.preventDefault();
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          } else {
            playSentenceAudio(activeSentence);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeLesson, activeSentence, playbackSpeed]);

  // Helper to strip punctuation for comparison
  const cleanChineseString = (str: string): string => {
    return str.replace(/[，。？！；：、“”‘’（）()\[\]{} \.,\/#!$%\^&\*;:{}=\-_`~"']/g, "").trim();
  };

  // Scoring and character comparison (word-level comparison as requested)
  // Green: correct, Red: wrong, Yellow: missing
  interface CharacterDiff {
    char: string;
    status: "correct" | "wrong" | "missing";
    pinyinChar?: string;
  }

  const getCharacterDiff = (expected: string, provided: string): CharacterDiff[] => {
    const cleanExpected = cleanChineseString(expected);
    const cleanProvided = cleanChineseString(provided);
    
    const result: CharacterDiff[] = [];
    
    for (let i = 0; i < cleanExpected.length; i++) {
      const expChar = cleanExpected[i];
      const provChar = cleanProvided[i];
      
      if (!provChar) {
        result.push({ char: expChar, status: "missing" });
      } else if (provChar === expChar) {
        result.push({ char: expChar, status: "correct" });
      } else {
        result.push({ char: provChar, status: "wrong" }); // display what user typed wrong, or show target char as red
      }
    }
    return result;
  };

  const handleSubmit = () => {
    if (!activeSentence) return;
    
    const cleanExpected = cleanChineseString(activeSentence.chinese);
    const cleanUser = cleanChineseString(userAnswer);
    
    const isPerfect = cleanExpected === cleanUser;
    setIsSubmitted(true);
    
    if (isPerfect) {
      playSuccessChime();
    }
    
    // Generate score & award XP
    let xpAwarded = 0;
    const activeLevel = activeLesson?.level || "HSK1";
    const xpSettings = settings?.xpSettings;
    
    if (isPerfect) {
      if (xpSettings && xpSettings.levels && xpSettings.levels[activeLevel]) {
        const levelConfig = xpSettings.levels[activeLevel];
        if (hintLevel === 0) xpAwarded = levelConfig.noHint;
        else if (hintLevel === 1) xpAwarded = levelConfig.hint1;
        else if (hintLevel === 2) xpAwarded = levelConfig.hint2;
        else xpAwarded = levelConfig.hint3;
      } else {
        // Fallback defaults
        if (hintLevel === 0) xpAwarded = 10;
        else if (hintLevel === 1) xpAwarded = 8;
        else if (hintLevel === 2) xpAwarded = 5;
        else xpAwarded = 2;
      }
    } else {
      xpAwarded = xpSettings && typeof xpSettings.wrongXp === "number" ? xpSettings.wrongXp : 1;
    }
    setXpEarned(xpAwarded);

    // Prepare auto save of wrong item details
    const isCorrect = isPerfect;
    let wrongWord: any = null;
    let wrongSentence: any = null;

    if (!isCorrect) {
      // Save entire sentence as a revision item
      wrongSentence = {
        id: activeSentence.id,
        chinese: activeSentence.chinese,
        pinyin: activeSentence.pinyin,
        translation: activeSentence.translation,
        explanation: activeSentence.explanation,
        audioUrl: activeSentence.audioUrl || ""
      };

      // Try to parse some individual words that might have been typed wrong
      // We can grab the first word from explanation or default vocabulary
      const diffs = getCharacterDiff(activeSentence.chinese, userAnswer);
      const wrongChars = diffs.filter(d => d.status === "wrong" || d.status === "missing").map(d => d.char);
      if (wrongChars.length > 0) {
        wrongWord = {
          chinese: wrongChars.slice(0, 3).join(""), // Capture up to 3 wrong characters together
          pinyin: "",
          translation: `Ôn tập từ trong câu: "${activeSentence.chinese}"`,
          sourceSentence: activeSentence.chinese
        };
      }
    }

    // Call callback to save progress & add XP. Mark as completed if this is the last sentence.
    const isLastSentence = currentSentenceIdx + 1 === activeLesson.sentences.length;
    onAddXp(xpAwarded, isCorrect, wrongWord, wrongSentence, isLastSentence);
    onRefreshStats();
  };

  const handleNext = () => {
    if (!activeLesson) return;
    
    stopCurrentAudio();
    
    if (currentSentenceIdx + 1 < activeLesson.sentences.length) {
      const nextIdx = currentSentenceIdx + 1;
      setCurrentSentenceIdx(nextIdx);
      setUserAnswer("");
      setIsSubmitted(false);
      setHintLevel(0);
      setXpEarned(0);
      setListenCount(0);
      
      // Save progress to lessons map
      setLessonsProgress(prev => {
        const nextProgress = {
          ...prev,
          [activeLesson.id]: nextIdx
        };
        localStorage.setItem("chinese_dictation_lessons_progress", JSON.stringify(nextProgress));
        return nextProgress;
      });

      // Auto play next sentence
      setTimeout(() => {
        playSentenceAudio(activeLesson.sentences[nextIdx]);
      }, 500);
    } else {
      // Lesson fully completed
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
      });
      alert(`Chúc mừng! Bạn đã hoàn thành bài học "${activeLesson.title}" và tích lũy thêm điểm kinh nghiệm XP!`);
      
      // Save that this lesson is completed (set index to length)
      setLessonsProgress(prev => {
        const nextProgress = {
          ...prev,
          [activeLesson.id]: activeLesson.sentences.length
        };
        localStorage.setItem("chinese_dictation_lessons_progress", JSON.stringify(nextProgress));
        return nextProgress;
      });

      setActiveLesson(null);
      // Clear current active progress state
      localStorage.removeItem("chinese_dictation_practice_progress");
      onRefreshStats();
    }
  };

  // Stage Hints logic
  const triggerHint = () => {
    setHintLevel(prev => Math.min(3, prev + 1));
  };

  const getClozeHint = (sentence: string, user: string): string => {
    const cleanExpected = cleanChineseString(sentence);
    const cleanUser = cleanChineseString(user);
    let hintStr = "";
    
    for (let i = 0; i < cleanExpected.length; i++) {
      const char = cleanExpected[i];
      if (cleanUser[i] === char) {
        hintStr += char;
      } else {
        hintStr += "__ ";
      }
    }
    return hintStr || sentence.replace(/./g, "__ ");
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      
      {/* State 1: Choose Lesson or Generation criteria */}
      {!activeLesson ? (
        <div className="space-y-6">
          {pendingResume && (
            <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-scale-up shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-inner">
                  <RotateCcw className="w-5 h-5 animate-spin-slow" />
                </div>
                <div className="space-y-0.5 text-left">
                  <h5 className="text-xs font-bold text-slate-800">Khôi phục tiến trình học tập</h5>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                    Bạn đang học dở bài học <strong className="text-indigo-600">"{pendingResume.lesson.title}"</strong> ({pendingResume.lesson.level}) ở câu số <strong>{pendingResume.idx + 1}</strong>. Bạn có muốn tiếp tục học tiếp không?
                  </p>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto shrink-0">
                <button
                  onClick={() => {
                    setPendingResume(null);
                    localStorage.removeItem("chinese_dictation_practice_progress");
                  }}
                  className="flex-1 sm:flex-none px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Bỏ qua
                </button>
                <button
                  onClick={() => {
                    const { lesson, idx, ans } = pendingResume;
                    setActiveLesson(lesson);
                    setCurrentSentenceIdx(idx);
                    setUserAnswer(ans);
                    setIsSubmitted(false);
                    setHintLevel(0);
                    setXpEarned(0);
                    setListenCount(0);
                    setPendingResume(null);
                    
                    // Trigger audio play
                    setTimeout(() => {
                      playSentenceAudio(lesson.sentences[idx]);
                    }, 500);
                  }}
                  className="flex-1 sm:flex-none px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-100 cursor-pointer flex items-center justify-center gap-1"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> Tiếp tục học
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="font-sans font-bold text-base text-slate-800 tracking-tight">Lựa chọn bài học luyện nghe chép</h3>
            <button 
              onClick={onBackToDashboard}
              className="text-xs text-slate-600 hover:text-slate-950 flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm cursor-pointer font-semibold transition-all"
            >
              <ChevronLeft className="w-4 h-4" /> Trở về Bảng điều khiển
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Filter Panel */}
            <div className="md:col-span-1 bg-white border border-slate-200 p-5 rounded-xl space-y-6 shadow-sm">
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Trình độ HSK</label>
                <div className="grid grid-cols-2 gap-2">
                  {levels.map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setSelectedLevel(lvl)}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg text-left transition-all border cursor-pointer ${selectedLevel === lvl ? "bg-indigo-600 border-indigo-600 text-white font-bold" : "bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-100"}`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Chủ đề học tập</label>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                  {topics.map((tp) => (
                    <button
                      key={tp.id}
                      onClick={() => setSelectedTopic(tp.id)}
                      className={`w-full px-3 py-2.5 text-xs text-left rounded-lg transition-all border cursor-pointer flex items-center justify-between ${selectedTopic === tp.id ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-bold" : "bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-800"}`}
                    >
                      <span>{tp.name}</span>
                      {selectedTopic === tp.id && <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Available Lessons Panel */}
            <div className="md:col-span-2 bg-white border border-slate-200 p-5 rounded-xl space-y-4 shadow-sm flex flex-col justify-between min-h-[350px]">
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-700">Danh sách bài học ({availableLessons.length})</h4>
                
                {availableLessons.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-8 border border-slate-200 text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs text-slate-500 font-medium">
                      Chưa có sẵn bài học thủ công cho Trình độ <strong>{selectedLevel}</strong> và Chủ đề <strong>{selectedTopic}</strong>.
                    </p>
                    <div className="text-slate-400 text-[11px] max-w-sm mx-auto">
                      Hãy chuyển sang trang <strong>Cấu hình hệ thống</strong> để yêu cầu AI tạo tự động bài học mới đúng chủ đề này trong 5 giây!
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
                    {availableLessons.map((lesson) => {
                      const savedIdx = lessonsProgress[lesson.id] || 0;
                      const totalCount = lesson.sentences?.length || 0;
                      const progressPercent = totalCount > 0 ? Math.min(100, Math.round((savedIdx / totalCount) * 100)) : 0;
                      const isCompleted = savedIdx >= totalCount && totalCount > 0;
                      
                      return (
                        <div 
                          key={lesson.id} 
                          className={`bg-white p-4 rounded-xl border hover:shadow-sm transition-all flex flex-col justify-between gap-3 group ${
                            isCompleted 
                              ? 'border-emerald-200 bg-emerald-50/5' 
                              : savedIdx > 0 
                                ? 'border-amber-200 bg-amber-50/5' 
                                : 'border-slate-200 hover:border-indigo-500'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded border border-indigo-100">
                                {lesson.level}
                              </span>
                              {isCompleted ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-extrabold rounded border border-emerald-100">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Hoàn thành
                                </span>
                              ) : savedIdx > 0 ? (
                                <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-bold rounded border border-amber-100">
                                  Đang học • {savedIdx}/{totalCount} câu
                                </span>
                              ) : null}
                            </div>
                            <h5 className="font-sans font-semibold text-xs text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-1">
                              {lesson.title}
                            </h5>
                            <span className="text-[10px] text-slate-400 block">Số câu: {totalCount} câu</span>
                            
                            {/* Visual Progress Bar */}
                            {totalCount > 0 && savedIdx > 0 && (
                              <div className="space-y-1 pt-1.5">
                                <div className="flex justify-between text-[9px] text-slate-400 font-semibold">
                                  <span>Tiến trình</span>
                                  <span>{progressPercent}%</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-300 ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                    style={{ width: `${progressPercent}%` }}
                                  ></div>
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex gap-2">
                            <button
                              onClick={() => startLesson(lesson)}
                              className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border ${
                                isCompleted 
                                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white' 
                                  : savedIdx > 0 
                                    ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-500' 
                                    : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white'
                              }`}
                            >
                              <Play className="w-3 h-3 fill-current" /> 
                              {isCompleted ? "Học lại từ đầu" : savedIdx > 0 ? `Tiếp tục (Câu ${savedIdx + 1})` : "Bắt đầu học"}
                            </button>
                            
                            {/* Start over button to reset progress */}
                            {savedIdx > 0 && !isCompleted && (
                              <button
                                title="Học lại từ đầu"
                                onClick={() => {
                                  if (window.confirm(`Xóa tiến trình bài "${lesson.title}" và học lại từ đầu?`)) {
                                    setLessonsProgress(prev => {
                                      const nextProgress = {
                                        ...prev,
                                        [lesson.id]: 0
                                      };
                                      localStorage.setItem("chinese_dictation_lessons_progress", JSON.stringify(nextProgress));
                                      return nextProgress;
                                    });
                                  }
                                }}
                                className="px-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-lg border border-slate-200 transition-all flex items-center justify-center cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-lg flex items-start gap-3 mt-4">
                <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="text-xs font-bold text-indigo-700">Mẹo thông minh:</span>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Bạn luôn có thể tự chỉnh sửa tiêu đề, nội dung tiếng Trung, nghĩa tiếng Việt hay giải thích ngữ pháp của bài học bất cứ lúc nào trong bảng điều khiển <strong>Cấu hình hệ thống</strong>.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : (
        /* State 2: Active Practice Session screen */
        <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-md space-y-6 animate-scale-up">
          
          {/* Practice Header with Progress bar */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider block">Đang luyện tập • {activeLesson.level}</span>
              <h3 className="font-sans font-bold text-base text-slate-800">{activeLesson.title}</h3>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-slate-500 block">Câu {currentSentenceIdx + 1} / {activeLesson.sentences.length}</span>
              <button 
                onClick={() => {
                  if (window.confirm("Bạn có chắc chắn muốn dừng buổi học này?")) {
                    stopCurrentAudio();
                    setActiveLesson(null);
                  }
                }}
                className="text-[11px] text-red-500 hover:underline mt-0.5 cursor-pointer font-semibold"
              >
                Hủy buổi học
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/60">
            <div 
              className="bg-indigo-600 h-full transition-all duration-300"
              style={{ width: `${((currentSentenceIdx + 1) / activeLesson.sentences.length) * 100}%` }}
            ></div>
          </div>

          {/* Interactive Audio player and Controls */}
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 text-center space-y-4 shadow-inner">
            <div className="flex items-center justify-center gap-4">
              {/* Play/Pause Toggle */}
              <button
                onClick={() => {
                  if (isAudioPlaying) {
                    audioRef.current?.pause();
                  } else if (audioRef.current) {
                    audioRef.current.play().catch(() => {});
                  } else {
                    playSentenceAudio(activeSentence!);
                  }
                }}
                disabled={audioLoading}
                className="p-4 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-slate-200 text-white rounded-full shadow-md shadow-indigo-100 transition-all cursor-pointer flex items-center justify-center w-14 h-14"
                title={isAudioPlaying ? "Tạm dừng" : "Phát giọng đọc tiếng Trung"}
              >
                {isAudioPlaying ? <Pause className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
              </button>

              {/* Replay Button */}
              {(audioDuration > 0 || audioRef.current) && (
                <button
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.currentTime = 0;
                      audioRef.current.play().catch(() => {});
                    } else {
                      playSentenceAudio(activeSentence!);
                    }
                  }}
                  disabled={audioLoading}
                  className="p-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-full shadow-sm transition-all cursor-pointer flex items-center justify-center w-11 h-11"
                  title="Phát lại từ đầu"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            <span className="text-[10px] text-slate-400 block font-semibold">
              {audioLoading ? "Đang tải âm thanh ElevenLabs..." : `Số lần đã nghe câu này: ${listenCount} lần`}
            </span>

            <span className="text-[10px] text-slate-500 font-semibold max-w-sm mx-auto block bg-slate-50/80 py-1.5 px-3 rounded-lg border border-slate-200">
              💡 Phím tắt: Ấn <span className="bg-white border border-slate-300 text-slate-700 px-1 py-0.5 rounded font-mono shadow-sm">Space</span> khi không gõ, hoặc <span className="bg-white border border-slate-300 text-slate-700 px-1 py-0.5 rounded font-mono shadow-sm">Ctrl + Space</span> khi đang nhập để phát lại nhanh!
            </span>

            {/* Audio Time Progress Slider */}
            {audioDuration > 0 && (
              <div className="max-w-md mx-auto bg-white border border-slate-200/60 rounded-xl p-3.5 space-y-2 shadow-sm animate-scale-up">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 font-bold px-1">
                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{formatTime(audioCurrentTime)}</span>
                  <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">{formatTime(audioDuration)}</span>
                </div>
                
                {/* Custom Seekable Range Bar */}
                <div className="relative group flex items-center h-4">
                  <input
                    type="range"
                    min="0"
                    max={audioDuration || 100}
                    step="0.01"
                    value={audioCurrentTime}
                    onChange={(e) => {
                      const newTime = parseFloat(e.target.value);
                      if (audioRef.current) {
                        audioRef.current.currentTime = newTime;
                        setAudioCurrentTime(newTime);
                      }
                    }}
                    className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none z-10"
                  />
                  {/* Highlighted active fill layer */}
                  <div 
                    className="absolute left-0 h-1.5 bg-indigo-600 rounded-l-lg pointer-events-none transition-all"
                    style={{ width: `${(audioCurrentTime / (audioDuration || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Speed controller */}
            <div className="max-w-xs mx-auto space-y-2 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1 font-semibold"><Sliders className="w-3.5 h-3.5 text-slate-400" /> Tốc độ đọc:</span>
                <span className="font-mono text-indigo-600 font-bold">{playbackSpeed}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.25"
                step="0.25"
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[9px] text-slate-400 font-semibold px-0.5">
                <span>0.5x (Chậm)</span>
                <span>1.0x (Chuẩn)</span>
                <span>1.25x (Nhanh)</span>
              </div>
            </div>
          </div>

          {/* Sentence Input Area */}
          <div className="space-y-3">
            <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Hãy nghe và gõ lại bằng chữ Hán giản thể:</label>
            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              disabled={isSubmitted}
              rows={2}
              placeholder="Nhập chữ Hán tại đây... (Ví dụ: 我想去中国)"
              className="w-full p-4 bg-white border border-slate-200 rounded-xl text-lg font-sans text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
            />
          </div>

          {/* Submit / Grading controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div>
              {!isSubmitted && (
                <button
                  onClick={triggerHint}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4 text-amber-500" /> Nhận gợi ý (Cấp {hintLevel + 1})
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {!isSubmitted ? (
                <button
                  onClick={handleSubmit}
                  disabled={!userAnswer.trim()}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 cursor-pointer"
                >
                  Kiểm tra & Chấm điểm
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-md cursor-pointer"
                >
                  Tiếp tục câu sau <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Interactive Hint Stage Panel */}
          {hintLevel > 0 && !isSubmitted && (
            <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-xl space-y-3 animate-fade-in text-xs text-slate-800 shadow-sm">
              <div className="flex items-center justify-between border-b border-amber-200/50 pb-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <Info className="w-4 h-4 text-amber-600" />
                  <span>Danh sách gợi ý đã mở (Cấp độ {hintLevel}/3):</span>
                </div>
                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                  -{hintLevel < 3 ? "5" : "10"} XP tích lũy
                </span>
              </div>

              {/* Level 1: Bản dịch */}
              {hintLevel >= 1 && (
                <div className="space-y-1 bg-white p-3 rounded-lg border border-amber-200/60 shadow-sm">
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">Cấp 1: Bản dịch tiếng Việt</span>
                  <p className="text-slate-800 font-sans text-sm font-semibold pt-1 leading-relaxed">
                    {activeSentence!.translation}
                  </p>
                </div>
              )}

              {/* Level 2: Pinyin */}
              {hintLevel >= 2 && (
                <div className="space-y-1 bg-white p-3 rounded-lg border border-amber-200/60 shadow-sm animate-scale-up">
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">Cấp 2: Phiên âm Pinyin</span>
                  <p className="font-mono text-sm text-amber-900 tracking-wider pt-1 font-semibold">
                    {activeSentence!.pinyin}
                  </p>
                </div>
              )}

              {/* Level 3: Chữ Hán */}
              {hintLevel >= 3 && (
                <div className="space-y-2 bg-white p-3 rounded-lg border border-amber-200/60 shadow-sm animate-scale-up">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">Cấp 3: Đáp án Chữ Hán</span>
                    <span className="text-[10px] text-slate-400 font-medium">Nhấp vào từng chữ để tra nghĩa Hán Việt</span>
                  </div>
                  <div className="space-y-2 pt-1">
                    <div className="font-sans text-lg text-emerald-700 tracking-widest font-bold bg-emerald-50/30 p-2 rounded border border-emerald-100">
                      <ClickableChinese text={activeSentence!.chinese} onLookup={onLookupWord} />
                    </div>
                    <div className="space-y-1 border-t border-slate-100 pt-1.5">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Khớp ký tự bạn đã nhập:</p>
                      <p className="font-sans text-sm font-semibold text-slate-600 tracking-widest bg-slate-50 p-2 rounded border border-slate-100 font-mono">
                        {getClozeHint(activeSentence!.chinese, userAnswer)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Grading Result Feedback Panel */}
          {isSubmitted && (
            <div className="space-y-4 border-t border-slate-100 pt-4 animate-scale-up text-xs text-slate-800">
              
              {/* Diff view */}
              <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">So sánh chính tả & Nhấp để tra nghĩa từ:</span>
                
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {getCharacterDiff(activeSentence!.chinese, userAnswer).map((item, idx) => (
                    <div 
                      key={idx}
                      onClick={() => onLookupWord(item.char)}
                      className={`
                        min-w-[36px] min-h-[36px] flex items-center justify-center font-sans text-lg font-bold rounded-lg border shadow-sm cursor-pointer hover:scale-105 active:scale-95 transition-all
                        ${item.status === "correct" 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                          : item.status === "wrong"
                            ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                        }
                      `}
                      title={(item.status === "correct" ? "Đúng" : item.status === "wrong" ? "Sai" : "Thiếu") + " - Nhấp để tra nghĩa Hán Việt"}
                    >
                      {item.char}
                    </div>
                  ))}
                </div>

                <div className="flex gap-4 pt-2 text-[10px] text-slate-400 font-semibold">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-50 border border-emerald-200 rounded"></span>Đúng</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-50 border border-red-200 rounded"></span>Sai / Thừa</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-amber-50 border border-amber-200 rounded"></span>Thiếu</span>
                </div>
              </div>

              {/* Translation & Explanation block */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Vietnamese meaning */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Nghĩa tiếng Việt:</span>
                  <p className="text-slate-800 font-sans text-xs font-semibold leading-relaxed">{activeSentence!.translation}</p>
                </div>

                {/* Vocabulary Grammar Explanation */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Giải thích từ vựng & Ngữ pháp:</span>
                  <p className="text-slate-600 font-sans text-xs leading-relaxed whitespace-pre-line">{activeSentence!.explanation || "Không có giải thích chi tiết."}</p>
                </div>

              </div>

              {/* XP Award feedback */}
              <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-emerald-800 font-bold">
                  <Award className="w-4 h-4 text-amber-500" /> Tiến trình học tập được ghi nhận cục bộ!
                </span>
                <span className="font-mono text-emerald-700 font-black">
                  +{xpEarned} XP tích lũy
                </span>
              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
}
