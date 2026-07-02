import React, { useState, useEffect } from "react";
import { 
  BookOpen, BarChart3, Database, Award, CheckCircle, AlertCircle, 
  BookMarked, Clock, Flame, Play, RefreshCw, Layers, ShieldCheck, Search,
  Trophy, Star, Crown, Zap, Target, Medal, Sun
} from "lucide-react";
import { UserStats } from "../types";

interface DashboardProps {
  stats: UserStats;
  onStartPractice: () => void;
  onStartRevision: () => void;
  onRefreshStats: () => void;
}

export default function Dashboard({ stats, onStartPractice, onStartRevision, onRefreshStats }: DashboardProps) {
  // Convert stats progress mapping to clean visual list
  const progressEntries = Object.entries(stats.dailyProgress || {}).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5);

  return (
    <div className="space-y-8 animate-fade-in text-slate-800">
      
      {/* Visual Welcome Banner */}
      <div className="bg-indigo-600 p-6 sm:p-8 rounded-2xl relative overflow-hidden shadow-lg shadow-indigo-100 text-white">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Database className="w-48 h-48 text-white" />
        </div>
        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 text-white text-xs font-semibold rounded-full border border-white/20">
            <ShieldCheck className="w-3.5 h-3.5" /> Đồng bộ dữ liệu Local ổn định
          </div>
          <div className="space-y-2">
            <h2 className="font-sans font-extrabold text-2xl sm:text-3xl tracking-tight">
              Chào mừng bạn trở lại!
            </h2>
            <p className="text-indigo-100 text-sm max-w-2xl leading-relaxed">
              Luyện nghe viết chữ Hán kết hợp thuật toán lặp lại ngắt quãng <strong className="text-white font-bold underline decoration-2 decoration-amber-400">Anki SRS (SM-2)</strong> giúp bạn ghi nhớ mặt chữ vĩnh viễn vào bộ nhớ dài hạn. Hãy bắt đầu học tập ngay nào!
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={onStartPractice}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 text-indigo-700 px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-indigo-700 text-indigo-700" /> Bắt đầu luyện chép câu
            </button>
            <button
              onClick={onStartRevision}
              className="flex items-center gap-2 bg-indigo-700 hover:bg-indigo-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold border border-indigo-500/60 shadow-md transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Thẻ ôn tập SRS ({stats.dueCount || 0} mục)
            </button>
          </div>
        </div>
      </div>

      {/* Grid Statistics */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-600" /> Thống kê Tiến trình Học tập
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          
          {/* studied */}
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium text-slate-500">Số bài đã học</span>
              <BookOpen className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="mt-2.5">
              <span className="text-2xl font-black font-mono text-slate-800">{stats.totalLessons || 0}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Bài học tích lũy</span>
            </div>
          </div>

          {/* Correct count */}
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium text-slate-500">Đúng tuyệt đối</span>
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <div className="mt-2.5">
              <span className="text-2xl font-black font-mono text-green-600">{stats.totalCorrect || 0}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Số câu gõ đúng</span>
            </div>
          </div>

          {/* Wrong count */}
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium text-slate-500">Câu đã gõ sai</span>
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <div className="mt-2.5">
              <span className="text-2xl font-black font-mono text-red-500">{stats.totalWrong || 0}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Tự động lưu SRS</span>
            </div>
          </div>

          {/* XP Accumulation */}
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium text-slate-500">Điểm tích lũy</span>
              <Award className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2.5">
              <span className="text-2xl font-black font-mono text-indigo-600">{stats.totalXp || 0}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">XP tổng cộng</span>
            </div>
          </div>

          {/* Vocabulary count */}
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium text-slate-500">Từ đã lưu</span>
              <BookMarked className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2.5">
              <span className="text-2xl font-black font-mono text-slate-800">{stats.vocabCount || 0}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Từ trong sổ tay</span>
            </div>
          </div>

          {/* Due count */}
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium text-slate-500">Cần ôn Anki</span>
              <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
            </div>
            <div className="mt-2.5">
              <span className={`text-2xl font-black font-mono ${stats.dueCount > 0 ? "text-amber-600" : "text-slate-400"}`}>
                {stats.dueCount || 0}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Mục đến hạn ôn</span>
            </div>
          </div>

        </div>
      </div>

      {/* Charts & Badges Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Charts & XP Progress */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm h-full flex flex-col">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" /> Hoạt động XP gần đây
            </h4>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
              Lịch sử XP
            </span>
          </div>

          {progressEntries.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs flex-1 flex items-center justify-center">
              Chưa có hoạt động nào trong hôm nay. Hãy học bài mới để tích điểm XP!
            </div>
          ) : (
            <div className="space-y-4 pt-2 flex-1">
              {progressEntries.map(([date, xp]) => {
                const maxVal = Math.max(...Object.values(stats.dailyProgress || { "t": 100 }));
                const pct = maxVal > 0 ? (xp / maxVal) * 100 : 0;
                return (
                  <div key={date} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-500 font-semibold">{date}</span>
                      <span className="text-indigo-600 font-bold">{xp} XP</span>
                    </div>
                    {/* Visual XP meter */}
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
                      <div 
                        className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-4 mt-auto border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Ngày hoạt động liên tục:</span>
            <span className="font-bold text-orange-600 font-mono flex items-center gap-0.5">
              <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500" /> {stats.streak || 0} ngày liên tiếp
            </span>
          </div>
        </div>

        {/* Badges Section */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm h-full flex flex-col">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" /> Huy hiệu Thành tựu
            </h4>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
              Sưu tập
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 flex-1">
            {[
              {
                id: "early-bird",
                name: "Early Bird",
                description: "Hoàn thành 1 bài học",
                icon: <Sun className="w-5 h-5" />,
                earned: stats.totalLessons >= 1,
                color: "text-amber-500 bg-amber-50 border-amber-200"
              },
              {
                id: "consistency-king",
                name: "Consistency King",
                description: "Chuỗi học 7 ngày",
                icon: <Crown className="w-5 h-5" />,
                earned: stats.streak >= 7,
                color: "text-yellow-600 bg-yellow-50 border-yellow-200"
              },
              {
                id: "vocab-master",
                name: "Vocabulary Master",
                description: "Lưu 50 từ vựng",
                icon: <BookMarked className="w-5 h-5" />,
                earned: stats.vocabCount >= 50,
                color: "text-indigo-500 bg-indigo-50 border-indigo-200"
              },
              {
                id: "sharpshooter",
                name: "Sharpshooter",
                description: "Gõ đúng 100 câu",
                icon: <Target className="w-5 h-5" />,
                earned: stats.totalCorrect >= 100,
                color: "text-emerald-500 bg-emerald-50 border-emerald-200"
              },
              {
                id: "xp-collector",
                name: "XP Collector",
                description: "Tích lũy 1,000 XP",
                icon: <Zap className="w-5 h-5" />,
                earned: stats.totalXp >= 1000,
                color: "text-purple-500 bg-purple-50 border-purple-200"
              },
              {
                id: "dedicated-scholar",
                name: "Dedicated Scholar",
                description: "Học 10 bài học",
                icon: <Medal className="w-5 h-5" />,
                earned: stats.totalLessons >= 10,
                color: "text-blue-500 bg-blue-50 border-blue-200"
              }
            ].map(badge => (
              <div 
                key={badge.id}
                className={`relative flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  badge.earned ? `${badge.color} shadow-sm` : "bg-slate-50 border-slate-100 text-slate-300 grayscale opacity-60"
                }`}
              >
                {badge.earned && (
                  <div className="absolute top-1.5 right-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 fill-green-50" />
                  </div>
                )}
                <div className={`mb-2 p-2 rounded-full ${badge.earned ? "bg-white/60" : "bg-slate-200/50"}`}>
                  {badge.icon}
                </div>
                <h5 className={`text-xs font-bold ${badge.earned ? "" : "text-slate-400"}`}>{badge.name}</h5>
                <p className={`text-[9px] mt-0.5 leading-tight ${badge.earned ? "opacity-80" : "text-slate-400"}`}>
                  {badge.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
