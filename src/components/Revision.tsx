import React, { useState, useEffect } from "react";
import { 
  RotateCw, Play, Volume2, Eye, EyeOff, CheckCircle, HelpCircle, 
  Sparkles, Award, FileText, ChevronRight, CheckCircle2, RefreshCw, Calendar
} from "lucide-react";
import { RevisionItem, SystemSettings } from "../types";
import ClickableChinese from "./ClickableChinese";
import { playSuccessChime } from "../lib/audio";
import confetti from "canvas-confetti";

interface RevisionProps {
  dueVocab: any[];
  dueSentences: any[];
  onRefreshStats: () => void;
  onBackToDashboard: () => void;
  onLookupWord: (word: string) => void;
  settings: SystemSettings | null;
}

export default function Revision({ dueVocab, dueSentences, onRefreshStats, onBackToDashboard, onLookupWord, settings }: RevisionProps) {
  const [sessionItems, setSessionItems] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [userTypedAnswer, setUserTypedAnswer] = useState<string>("");
  const [sentenceSubmitted, setSentenceSubmitted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Audio state
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => {
    return settings?.defaultPlaybackSpeed || 1.0;
  });

  // Synchronize default playback speed from settings
  useEffect(() => {
    if (settings?.defaultPlaybackSpeed) {
      setPlaybackSpeed(settings.defaultPlaybackSpeed);
    }
  }, [settings]);

  // Merge due items into active session list
  useEffect(() => {
    const formattedVocab = dueVocab.map(w => ({ ...w, sessionType: "word" }));
    const formattedSentences = dueSentences.map(s => ({ ...s, sessionType: "sentence" }));
    setSessionItems([...formattedVocab, ...formattedSentences]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setUserTypedAnswer("");
    setSentenceSubmitted(false);
  }, [dueVocab, dueSentences]);

  const activeItem = sessionItems[currentIndex];

  const playBrowserSpeech = (text: string) => {
    try {
      const gTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(text)}`;
      const audio = new Audio(gTtsUrl);
      audio.playbackRate = playbackSpeed;
      audio.play().catch(() => {
        playSpeechSynthesisFallback(text);
      });
    } catch (e) {
      playSpeechSynthesisFallback(text);
    }
  };

  const playSpeechSynthesisFallback = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = playbackSpeed;
    
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
  };

  const playItemAudio = async () => {
    if (!activeItem) return;
    if (activeItem.audioUrl) {
      try {
        const audio = new Audio(activeItem.audioUrl);
        audio.playbackRate = playbackSpeed;
        audio.play().catch((playErr) => {
          console.error("Failed to play custom audioUrl in Revision, falling back to Google voice:", playErr);
          playBrowserSpeech(activeItem.chinese);
        });
      } catch (err) {
        playBrowserSpeech(activeItem.chinese);
      }
    } else {
      // Dynamic TTS generation if no audioUrl exists yet!
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: activeItem.chinese, sentenceId: activeItem.id })
        });
        const data = await res.json();
        if (data.status === "success" && data.audioUrl) {
          // Cache locally
          activeItem.audioUrl = data.audioUrl;
          
          const audio = new Audio(data.audioUrl);
          audio.playbackRate = playbackSpeed;
          audio.play().catch(() => {});
        } else {
          playBrowserSpeech(activeItem.chinese);
        }
      } catch (err) {
        playBrowserSpeech(activeItem.chinese);
      }
    }
  };

  const cleanChineseString = (str: string) => {
    if (!str) return "";
    let result = str.toLowerCase().replace(/\s+/g, "");
    const charsToRemove = /[.,\/#!$%\^&\*;:{}=\-_`~()?"'，。！？；：、（）《》“”‘’.]/g;
    result = result.replace(charsToRemove, "");
    return result;
  };

  // Submit self-grade selection (SM-2 SRS parameters)
  const handleGrade = async (quality: number) => {
    if (!activeItem) return;
    setIsLoading(true);

    if (quality >= 4) {
      playSuccessChime();
    }

    try {
      const res = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: activeItem.id,
          type: activeItem.sessionType,
          quality // 0 to 5
        })
      });

      const data = await res.json();
      if (data.status === "success") {
        // Move to next card
        if (currentIndex + 1 < sessionItems.length) {
          setCurrentIndex(prev => prev + 1);
          setIsFlipped(false);
          setUserTypedAnswer("");
          setSentenceSubmitted(false);
        } else {
          // Finish session
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
          });
          alert("Tuyệt vời! Bạn đã hoàn thành toàn bộ thẻ ôn tập SRS đến hạn hôm nay.");
          onRefreshStats();
          onBackToDashboard();
        }
      }
    } catch (err) {
      console.error("Lỗi gửi chấm điểm SRS:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Automated scoring helper for sentence dictation in SRS
  const checkSentenceSelfGrade = () => {
    setSentenceSubmitted(true);
    setIsFlipped(true);
    
    if (activeItem) {
      const cleanExpected = cleanChineseString(activeItem.chinese);
      const cleanUser = cleanChineseString(userTypedAnswer);
      if (cleanExpected === cleanUser) {
        playSuccessChime();
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in text-xs text-slate-800">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-sans font-bold text-base text-slate-800 flex items-center gap-2 tracking-tight">
            <RotateCw className="w-5 h-5 text-indigo-600" /> Ôn tập thông minh Anki SRS
          </h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Thuật toán lặp lại ngắt quãng SuperMemo-2 giúp củng cố kiến thức tốt nhất.
          </p>
        </div>
        <button 
          onClick={onBackToDashboard}
          className="text-xs text-slate-600 hover:text-slate-950 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm cursor-pointer font-semibold transition-all"
        >
          Trở về Bảng điều khiển
        </button>
      </div>

      {/* Completion screen if 0 items */}
      {sessionItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-5 shadow-sm">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner border border-emerald-200">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h4 className="font-sans font-bold text-base text-slate-800">Hôm nay không có lịch ôn!</h4>
            <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">
              Xin chúc mừng! Bộ nhớ của bạn đang ở trạng thái tối ưu. Toàn bộ từ vựng và câu sai đã được ôn tập đầy đủ.
            </p>
          </div>
          <button
            onClick={onBackToDashboard}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-100 cursor-pointer"
          >
            Quay lại trang chính
          </button>
        </div>
      ) : (
        /* Card Panel */
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          
          {/* Card progress info */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 text-slate-600 font-bold font-sans text-xs rounded-md border border-slate-200/60">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              Thẻ {currentIndex + 1} / {sessionItems.length}
            </span>
            <span className="text-slate-400 font-sans font-semibold">
              Loại thẻ: <strong className="text-indigo-600">{activeItem.sessionType === "word" ? "Từ vựng" : "Chép câu"}</strong>
            </span>
          </div>

          {/* Flashcard body */}
          <div className="min-h-[220px] bg-slate-50 rounded-xl p-6 border border-slate-200 flex flex-col justify-between shadow-inner relative overflow-hidden">
            
            {/* Sentence practicing mode */}
            {activeItem.sessionType === "sentence" ? (
              <div className="space-y-4 w-full">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-bold">NGHE CÂU VÀ CHÉP CHÍNH TẢ:</span>
                  <button 
                    onClick={playItemAudio}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-sm font-bold text-[11px] cursor-pointer flex items-center gap-1"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> Nghe giọng đọc
                  </button>
                </div>

                {!sentenceSubmitted ? (
                  <textarea
                    value={userTypedAnswer}
                    onChange={(e) => setUserTypedAnswer(e.target.value)}
                    rows={2}
                    placeholder="Hãy nghe và gõ lại câu tiếng Trung..."
                    className="w-full p-3 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 font-sans focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-base shadow-inner"
                  />
                ) : (
                  <div className="space-y-3 pt-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold block">KẾT QUẢ ĐÚNG (Nhấp vào chữ để tra nghĩa):</span>
                      <div className="font-sans text-lg font-bold text-emerald-600 tracking-wide select-all">
                        <ClickableChinese text={activeItem.chinese} onLookup={onLookupWord} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold block">BẢN DỊCH NGHĨA:</span>
                      <p className="font-sans text-xs text-slate-700 leading-relaxed font-semibold">{activeItem.translation}</p>
                    </div>
                    {activeItem.explanation && (
                      <div className="space-y-1 border-t border-slate-200 pt-2 text-[11px]">
                        <span className="text-slate-400 block font-bold">GIẢI THÍCH NGỮ PHÁP/TỪ VỰNG:</span>
                        <p className="text-slate-500 whitespace-pre-line leading-relaxed">{activeItem.explanation}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Vocabulary flashcard mode */
              <div className="space-y-4 text-center w-full my-auto">
                {!isFlipped ? (
                  <div className="space-y-3">
                    <span className="text-[10px] text-slate-400 font-bold block font-mono">MẶT TRƯỚC (Nhấp để tra nghĩa):</span>
                    <div className="font-sans font-bold text-3xl text-slate-800 tracking-wider">
                      <ClickableChinese text={activeItem.chinese} onLookup={onLookupWord} />
                    </div>
                    {activeItem.sourceSentence && (
                      <div className="text-[11px] text-slate-500 bg-white/60 p-2 rounded border border-slate-200 max-w-md mx-auto block italic">
                        Ngữ cảnh: {activeItem.sourceSentence}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 animate-scale-up">
                    <span className="text-[10px] text-slate-400 font-bold block font-mono">MẶT SAU (Nhấp để tra nghĩa):</span>
                    <div className="font-sans font-bold text-3xl text-indigo-600 tracking-wider">
                      <ClickableChinese text={activeItem.chinese} onLookup={onLookupWord} />
                    </div>
                    <p className="font-mono text-base text-amber-600 font-semibold tracking-wide">[{activeItem.pinyin}]</p>
                    <p className="font-sans text-sm text-slate-800 font-bold">{activeItem.translation}</p>
                    {activeItem.sourceSentence && (
                      <p className="text-[11px] text-slate-400 italic block">Trong câu: {activeItem.sourceSentence}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Flip card control button */}
            <div className="pt-4 border-t border-slate-200 flex justify-center">
              {activeItem.sessionType === "sentence" && !sentenceSubmitted ? (
                <button
                  onClick={checkSentenceSelfGrade}
                  disabled={!userTypedAnswer.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 text-white font-bold rounded-lg transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <Eye className="w-4 h-4" /> Lật Thẻ Xem Đáp Án
                </button>
              ) : activeItem.sessionType === "word" && !isFlipped ? (
                <button
                  onClick={() => setIsFlipped(true)}
                  className="px-5 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition-all flex items-center gap-1 cursor-pointer font-semibold shadow-sm"
                >
                  <Eye className="w-4 h-4" /> Lật Thẻ Xem Nghĩa
                </button>
              ) : null}
            </div>

          </div>

          {/* Anki SRS SM-2 Self Grading Action Buttons */}
          {isFlipped && (
            <div className="space-y-4 animate-scale-up">
              <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block text-center">Hãy đánh giá mức độ ghi nhớ của bạn để đặt lịch ôn tập tiếp theo:</label>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                
                {/* q = 0: again */}
                <button
                  onClick={() => handleGrade(0)}
                  disabled={isLoading}
                  className="flex flex-col items-center justify-between bg-red-50 hover:bg-red-100 border border-red-200 p-3 rounded-xl transition-all group cursor-pointer text-center"
                >
                  <span className="font-sans font-bold text-red-700 text-xs">Lại / Quên</span>
                  <span className="text-[10px] text-red-500 font-semibold mt-1">Lịch ôn: Hôm nay</span>
                </button>

                {/* q = 3: hard */}
                <button
                  onClick={() => handleGrade(3)}
                  disabled={isLoading}
                  className="flex flex-col items-center justify-between bg-amber-50 hover:bg-amber-100 border border-amber-200 p-3 rounded-xl transition-all group cursor-pointer text-center"
                >
                  <span className="font-sans font-bold text-amber-700 text-xs">Khó / Yếu</span>
                  <span className="text-[10px] text-amber-600 font-semibold mt-1">Lịch ôn: 1 ngày</span>
                </button>

                {/* q = 4: good */}
                <button
                  onClick={() => handleGrade(4)}
                  disabled={isLoading}
                  className="flex flex-col items-center justify-between bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 p-3 rounded-xl transition-all group cursor-pointer text-center"
                >
                  <span className="font-sans font-bold text-indigo-700 text-xs">Tốt / Nhớ</span>
                  <span className="text-[10px] text-indigo-600 font-semibold mt-1">Lịch ôn: 4 ngày</span>
                </button>

                {/* q = 5: easy */}
                <button
                  onClick={() => handleGrade(5)}
                  disabled={isLoading}
                  className="flex flex-col items-center justify-between bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 p-3 rounded-xl transition-all group cursor-pointer text-center"
                >
                  <span className="font-sans font-bold text-emerald-700 text-xs">Rất Dễ</span>
                  <span className="text-[10px] text-emerald-600 font-semibold mt-1">Lịch ôn: 8 ngày</span>
                </button>

              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
