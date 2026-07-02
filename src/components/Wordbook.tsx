import React, { useState } from "react";
import { 
  BookMarked, Search, Trash2, Volume2, Calendar, ShieldAlert,
  ChevronRight, ArrowUpDown, RefreshCw, Sparkles, Filter
} from "lucide-react";
import { VocabularyWord } from "../types";

interface WordbookProps {
  vocabulary: VocabularyWord[];
  onDeleteWord: (id: string) => void;
  onRefreshStats: () => void;
  onLookupWord: (word: string) => void;
}

export default function Wordbook({ vocabulary, onDeleteWord, onRefreshStats, onLookupWord }: WordbookProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterType, setFilterType] = useState<"all" | "new" | "learned">("all");
  const [sortBy, setSortBy] = useState<"chinese" | "date" | "reps">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filter words
  const filteredWords = vocabulary.filter((word) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      word.chinese.toLowerCase().includes(query) ||
      (word.pinyin || "").toLowerCase().includes(query) ||
      word.translation.toLowerCase().includes(query);
    
    if (filterType === "new") {
      return matchesSearch && (word.srs?.repetitions || 0) === 0;
    }
    if (filterType === "learned") {
      return matchesSearch && (word.srs?.repetitions || 0) > 0;
    }
    return matchesSearch;
  });

  // Sort words
  const sortedWords = [...filteredWords].sort((a, b) => {
    let comp = 0;
    if (sortBy === "chinese") {
      comp = a.chinese.localeCompare(b.chinese);
    } else if (sortBy === "reps") {
      comp = (a.srs?.repetitions || 0) - (b.srs?.repetitions || 0);
    } else {
      comp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    return sortOrder === "asc" ? comp : -comp;
  });

  const toggleSort = (field: "chinese" | "date" | "reps") => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const speakWord = (text: string) => {
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

  const formatDate = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    } catch {
      return "Chưa rõ";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-xs text-slate-800">
      
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-sans font-bold text-base text-slate-800 flex items-center gap-2 tracking-tight">
            <BookMarked className="w-5 h-5 text-indigo-600" /> Sổ từ vựng cá nhân
          </h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Tổng hợp toàn bộ từ vựng bạn đã gõ sai trong quá trình luyện chép chính tả để ôn tập.
          </p>
        </div>
        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full font-bold font-sans text-xs shadow-sm">
          Tổng cộng: {vocabulary.length} Từ
        </span>
      </div>

      {/* Control bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        
        {/* Search */}
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm kiếm bằng chữ Hán, Pinyin hoặc nghĩa dịch..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs shadow-inner"
          />
        </div>

        {/* Filter type */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={filterType}
            onChange={(e: any) => setFilterType(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 text-xs cursor-pointer shadow-sm"
          >
            <option value="all">Tất cả từ vựng</option>
            <option value="new">Từ mới (Chưa ôn Anki)</option>
            <option value="learned">Đang ôn tập Anki SRS</option>
          </select>
        </div>

        {/* Sort selector */}
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => toggleSort("date")}
            className={`px-2 py-1.5 rounded text-[11px] font-semibold border flex items-center justify-center gap-1 cursor-pointer transition-all ${sortBy === "date" ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
          >
            Mới lưu <ArrowUpDown className="w-3 h-3" />
          </button>
          <button
            onClick={() => toggleSort("chinese")}
            className={`px-2 py-1.5 rounded text-[11px] font-semibold border flex items-center justify-center gap-1 cursor-pointer transition-all ${sortBy === "chinese" ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
          >
            Bảng chữ <ArrowUpDown className="w-3 h-3" />
          </button>
          <button
            onClick={() => toggleSort("reps")}
            className={`px-2 py-1.5 rounded text-[11px] font-semibold border flex items-center justify-center gap-1 cursor-pointer transition-all ${sortBy === "reps" ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
          >
            Số lần ôn <ArrowUpDown className="w-3 h-3" />
          </button>
        </div>

      </div>

      {/* Vocabulary list table */}
      {sortedWords.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3 shadow-sm">
          <ShieldAlert className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-slate-500 text-xs font-semibold">Không tìm thấy từ vựng nào khớp với bộ lọc tìm kiếm.</p>
          <span className="text-slate-400 text-[11px] block">Từ vựng sai khi nghe chính tả sẽ tự động thêm vào đây.</span>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-sans font-bold">
                  <th className="p-3">Hán tự</th>
                  <th className="p-3">Phát âm (Pinyin)</th>
                  <th className="p-3">Nghĩa tiếng Việt</th>
                  <th className="p-3">Ngữ cảnh/Nguồn câu</th>
                  <th className="p-3 text-center">Ôn tập Anki</th>
                  <th className="p-3 text-center">Ngày lưu</th>
                  <th className="p-3 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {sortedWords.map((word) => (
                  <tr key={word.id} className="hover:bg-slate-50/50 transition-colors">
                    
                    {/* Hanzi */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => speakWord(word.chinese)}
                          className="p-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 rounded transition-all cursor-pointer"
                          title="Nghe phát âm từ này"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                        <span 
                          onClick={() => onLookupWord(word.chinese)}
                          className="font-sans font-bold text-lg text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer transition-all select-all"
                          title="Nhấp để tra từ điển Hán-Việt"
                        >
                          {word.chinese}
                        </span>
                      </div>
                    </td>

                    {/* Pinyin */}
                    <td className="p-3">
                      <span className="font-mono text-amber-600 font-bold">[{word.pinyin || "Đang ôn tập"}]</span>
                    </td>

                    {/* translation */}
                    <td className="p-3 font-sans font-bold text-slate-800">
                      {word.translation}
                    </td>

                    {/* Context sentence */}
                    <td className="p-3 max-w-xs truncate text-slate-500 italic font-sans" title={word.sourceSentence}>
                      {word.sourceSentence || "Được thêm thủ công"}
                    </td>

                    {/* SRS repetition status */}
                    <td className="p-3 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] rounded font-bold border border-slate-200/50">
                          {word.srs?.repetitions || 0} lần
                        </span>
                        <span className="text-[9px] text-slate-400 mt-0.5 font-semibold">
                          Kế tiếp: {word.srs?.interval || 1} ngày
                        </span>
                      </div>
                    </td>

                    {/* date */}
                    <td className="p-3 text-center font-mono text-slate-400">
                      {formatDate(word.createdAt)}
                    </td>

                    {/* Delete action */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          if (window.confirm(`Bạn có chắc muốn xóa từ "${word.chinese}" khỏi sổ từ vựng cá nhân?`)) {
                            onDeleteWord(word.id);
                          }
                        }}
                        className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                        title="Xóa khỏi sổ từ vựng"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50 p-3 text-right text-[10px] text-slate-400 border-t border-slate-200">
            Hiển thị <span className="font-bold text-slate-600">{sortedWords.length}</span> trên tổng số <span className="font-bold text-slate-600">{vocabulary.length}</span> từ vựng.
          </div>
        </div>
      )}

      {/* Floating Sparkle Info Card */}
      <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3 shadow-sm">
        <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5 animate-pulse" />
        <div className="space-y-1">
          <span className="text-xs font-bold text-indigo-800">Tính năng tiện ích:</span>
          <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
            Click vào chữ Hán của bất kỳ từ vựng nào để mở <strong>Từ điển ngữ cảnh tức thì Hán - Việt</strong> hỗ trợ bởi Gemini AI. Ngoài ra bạn có thể nhấn nút chiếc loa (<Volume2 className="w-3 h-3 inline text-indigo-500" />) cạnh chữ Hán để nghe phát âm chính tả chuẩn của Bắc Kinh.
          </p>
        </div>
      </div>

    </div>
  );
}
