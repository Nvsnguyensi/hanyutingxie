import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, BookMarked, Volume2, Search, Sparkles, Loader2, Play, CheckCircle
} from "lucide-react";
import { VocabularyWord } from "../types";

interface DictionaryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery: string;
  vocabulary: VocabularyWord[];
  onRefreshStats: () => void;
}

export default function DictionaryDrawer({ 
  isOpen, 
  onClose, 
  initialQuery, 
  vocabulary, 
  onRefreshStats 
}: DictionaryDrawerProps) {
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [addingToVocab, setAddingToVocab] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Synchronize with initialQuery when it changes or when drawer opens
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      handleSearch(initialQuery);
    } else {
      setQuery("");
      setResult(null);
      setError("");
    }
  }, [initialQuery, isOpen]);

  // Check if current word is already in Wordbook
  useEffect(() => {
    if (result && result.chinese) {
      const saved = vocabulary.some(
        (w) => w.chinese === result.chinese || w.chinese.trim() === result.chinese.trim()
      );
      setIsSaved(saved);
    } else {
      setIsSaved(false);
    }
  }, [result, vocabulary]);

  const handleSearch = async (searchTerm: string) => {
    const term = searchTerm.trim();
    if (!term) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/dictionary/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: term }),
      });

      const data = await res.json();
      if (data.status === "success" && data.data) {
        setResult(data.data);
      } else {
        setError(data.message || "Không thể tìm thấy nghĩa của từ này.");
      }
    } catch (err: any) {
      console.error("Lỗi tra từ điển:", err);
      setError("Có lỗi hệ thống khi tra cứu từ điển.");
    } finally {
      setLoading(false);
    }
  };

  const speakText = (text: string) => {
    if (!text) return;
    try {
      const gTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(text)}`;
      const audio = new Audio(gTtsUrl);
      audio.playbackRate = 0.85;
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
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  };

  const addToWordbook = async () => {
    if (!result || addingToVocab || isSaved) return;

    setAddingToVocab(true);
    try {
      const res = await fetch("/api/vocabulary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chinese: result.chinese,
          pinyin: result.pinyin,
          translation: result.translation,
          sourceSentence: result.example?.chinese || "Tra cứu từ điển"
        }),
      });

      const data = await res.json();
      if (data.status === "success") {
        setIsSaved(true);
        onRefreshStats();
      } else {
        alert(data.message || "Không thể thêm vào sổ tay.");
      }
    } catch (err) {
      console.error("Lỗi thêm từ vựng:", err);
      alert("Đã xảy ra lỗi khi lưu từ vựng.");
    } finally {
      setAddingToVocab(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            id="dict-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 transition-all cursor-pointer"
          />

          {/* Sliding Side Drawer */}
          <motion.div
            id="dict-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:max-w-md bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col h-full text-slate-800"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
              <div className="flex items-center gap-1.5 text-indigo-700">
                <BookMarked className="w-5 h-5 text-indigo-600" />
                <h3 className="font-sans font-bold text-sm tracking-tight">Tra cứu từ điển Hán - Việt</h3>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              
              {/* Search input field */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Nhập từ cần tra cứu:</label>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSearch(query);
                  }}
                  className="relative flex items-center"
                >
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ví dụ: 学习, 朋友, 我..."
                    className="w-full pl-9 pr-20 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-sans text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                  />
                  <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                  <button
                    type="submit"
                    disabled={!query.trim() || loading}
                    className="absolute right-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {loading ? "Đang tra..." : "Tra cứu"}
                  </button>
                </form>
              </div>

              {/* Result State */}
              {loading && (
                <div className="py-12 flex flex-col items-center justify-center space-y-2 text-indigo-600">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-[11px] font-mono tracking-wider text-slate-400 uppercase">Đang phân tích ngữ cảnh...</span>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl text-xs space-y-1 animate-scale-up">
                  <p className="font-bold">Không tìm thấy từ vựng</p>
                  <p className="text-slate-500">{error}</p>
                </div>
              )}

              {!loading && !error && result && (
                <div className="space-y-5 animate-scale-up">
                  
                  {/* Chinese Character & Pinyin Box */}
                  <div className="bg-slate-50/50 border border-slate-200/80 p-5 rounded-2xl text-center space-y-3 relative overflow-hidden">
                    {/* Glowing BG Decor */}
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-100 rounded-full blur-2xl opacity-70 pointer-events-none"></div>
                    
                    <div className="space-y-1">
                      <span className="font-mono text-[10px] text-indigo-600 font-bold bg-indigo-50 border border-indigo-100/50 px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-block">
                        {result.pos || "Từ vựng"}
                      </span>
                      <h2 className="text-5xl font-sans font-black text-slate-800 tracking-wide pt-1">
                        {result.chinese}
                      </h2>
                      <p className="font-mono text-sm text-indigo-700 font-bold tracking-wider pt-0.5">
                        {result.pinyin}
                      </p>
                    </div>

                    <div className="flex justify-center gap-2 pt-1">
                      <button
                        onClick={() => speakText(result.chinese)}
                        className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-full transition-all cursor-pointer shadow-sm hover:scale-105"
                        title="Phát âm từ này"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Vietnamese Meaning Section */}
                  <div className="space-y-1 bg-indigo-50/30 p-4 rounded-xl border border-indigo-100/50 shadow-sm">
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider font-mono">Ý nghĩa Hán Việt / Nghĩa từ</span>
                    <p className="text-slate-800 font-sans text-sm font-bold pt-1.5 leading-relaxed">
                      {result.translation}
                    </p>
                  </div>

                  {/* Grammar/Explanation Section */}
                  {result.explanation && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Giải thích ngữ cảnh & cách dùng:</span>
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-xs text-slate-600 leading-relaxed whitespace-pre-line shadow-inner">
                        {result.explanation}
                      </div>
                    </div>
                  )}

                  {/* Example sentence Section */}
                  {result.example && result.example.chinese && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ví dụ minh họa:</span>
                      <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl space-y-2 shadow-sm relative group">
                        
                        {/* Play example sentence */}
                        <button
                          onClick={() => speakText(result.example.chinese)}
                          className="absolute right-3 top-3 p-1.5 bg-white hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 text-slate-400 rounded-lg transition-all cursor-pointer shadow-sm"
                          title="Nghe ví dụ"
                        >
                          <Play className="w-3 h-3 fill-current" />
                        </button>

                        <p className="font-sans text-sm font-bold text-slate-800 tracking-wide pr-8">
                          {result.example.chinese}
                        </p>
                        <p className="font-mono text-[11px] text-indigo-600 tracking-wide">
                          {result.example.pinyin}
                        </p>
                        <p className="text-xs text-slate-500 border-t border-slate-200/50 pt-1.5">
                          {result.example.translation}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* SRS / Wordbook Save Area */}
                  <div className="pt-2">
                    {isSaved ? (
                      <div className="w-full py-2.5 px-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm">
                        <CheckCircle className="w-4 h-4 text-emerald-600 animate-scale-up" />
                        <span>Đã lưu vào Sổ tay từ vựng của bạn</span>
                      </div>
                    ) : (
                      <button
                        onClick={addToWordbook}
                        disabled={addingToVocab}
                        className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {addingToVocab ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Đang lưu từ vựng...</span>
                          </>
                        ) : (
                          <>
                            <BookMarked className="w-4 h-4" />
                            <span>Lưu từ vựng này vào Sổ tay</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  
                  {/* AI badge */}
                  {result.source === "gemini" && (
                    <div className="text-center pt-2">
                      <span className="inline-flex items-center gap-1 text-[9px] text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100 font-mono">
                        <Sparkles className="w-3 h-3 text-indigo-500" /> Giải nghĩa thông minh bởi Gemini AI
                      </span>
                    </div>
                  )}

                </div>
              )}

              {!loading && !result && !error && (
                <div className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto text-indigo-500">
                    <BookMarked className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-700 text-xs">Sẵn sàng tra cứu</h4>
                    <p className="text-[10px] text-slate-400 max-w-xs mx-auto pt-1 leading-relaxed">
                      Nhấp vào bất kỳ chữ Hán nào trong quá trình học tập hoặc nhập trực tiếp từ vào thanh tìm kiếm ở trên để xem phiên âm pinyin, giải nghĩa Hán Việt và ví dụ minh họa tức thì.
                    </p>
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
