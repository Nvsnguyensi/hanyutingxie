import React from "react";
import { BookOpen, BarChart3, Settings2, RotateCw, BookMarked, Award, Flame, UserCheck, LogOut } from "lucide-react";
import { UserStats, SystemSettings, ClientUser } from "../types";

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  stats: UserStats;
  user: ClientUser;
  onLogout: () => void;
  onEditProfile: () => void;
  settings?: SystemSettings | null;
}

export default function Header({ activeTab, setActiveTab, stats, user, onLogout, onEditProfile, settings }: HeaderProps) {
  const isAdmin = user?.uid === "b9c5d331-26ff-4f1b-909f-38728ecde8fb" || user?.uid === "d8b2806e-77e7-4852-89d6-fb9b33222d63" || user?.uid === "local_dev" || user?.uid === "Wx15T6MdBpes6hUznG3P4NDqjH13" || user?.email === "nvsnguyensi@gmail.com";

  const navItems = [
    { id: "dashboard", label: settings?.menuLabels?.dashboard || "Bảng điều khiển", icon: BarChart3 },
    { id: "practice", label: settings?.menuLabels?.practice || "Luyện chép câu", icon: BookOpen },
    { id: "revision", label: settings?.menuLabels?.revision || "Ôn tập thông minh", icon: RotateCw, badge: stats.dueCount },
    { id: "wordbook", label: settings?.menuLabels?.wordbook || "Sổ từ vựng", icon: BookMarked },
    ...(isAdmin ? [{ id: "admin", label: settings?.menuLabels?.admin || "Cấu hình hệ thống", icon: Settings2 }] : []),
  ];

  return (
    <header className="bg-white border-b border-slate-200 text-slate-800 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Application Title */}
          <button 
            onClick={() => setActiveTab("dashboard")}
            className="flex items-center gap-3 text-left focus:outline-none cursor-pointer group border-0 bg-transparent"
          >
            <div className="relative w-10 h-10 flex-shrink-0">
              <img 
                src="/api/avatars/preset_1782568534322.png" 
                alt="HanScript Logo" 
                className="w-10 h-10 rounded-xl object-cover shadow-md shadow-indigo-100 group-hover:scale-105 transition-transform duration-300 absolute inset-0 z-10"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = document.getElementById('header-logo-fallback');
                  if (fallback) fallback.classList.remove('hidden');
                }}
              />
              <div id="header-logo-fallback" className="hidden w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-md shadow-indigo-100 absolute inset-0">
                中
              </div>
            </div>
            <div>
              <h1 className="text-base font-bold leading-none text-slate-900 tracking-tight group-hover:text-indigo-600 transition-colors">
                HanScript
              </h1>
              <p className="text-[10px] text-indigo-600 font-bold tracking-wider uppercase mt-1">
                Luyện Chép Chính Tả Tiếng Trung
              </p>
            </div>
          </button>

          {/* Quick Stats Summary */}
          <div className="hidden md:flex items-center gap-4">
            {/* Streak */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 text-xs">
              <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
              <span className="font-sans font-bold text-slate-700">Streak: <strong className="text-orange-600 font-mono">{stats.streak || 0}</strong> ngày</span>
            </div>

            {/* Total XP */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 text-xs">
              <Award className="w-4 h-4 text-yellow-500" />
              <span className="font-sans font-bold text-slate-700">Tổng điểm: <strong className="text-indigo-600 font-mono">{(stats.totalXp || 0).toLocaleString()}</strong> XP</span>
            </div>

            {/* User Indicator & Logout */}
            <div className="flex items-center gap-2">
              {user ? (
                <>
                  <button
                    onClick={onEditProfile}
                    className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 border border-slate-200 px-3 py-1.5 rounded-full text-xs transition-all cursor-pointer outline-none font-medium text-slate-700 active:scale-95"
                    title="Sửa thông tin cá nhân"
                  >
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || "Avatar"} className="w-5 h-5 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-[10px]">
                        {user.displayName?.charAt(0).toUpperCase() || "H"}
                      </div>
                    )}
                    <span className="font-semibold text-slate-700 hidden lg:inline-block max-w-[120px] truncate">{user.displayName || "Học viên"}</span>
                  </button>

                  <button
                    id="btn-logout-header"
                    onClick={onLogout}
                    className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 hover:border-rose-300 border border-rose-200 px-3 py-1.5 rounded-full text-xs transition-all cursor-pointer outline-none font-semibold text-rose-700 active:scale-95"
                    title="Đăng xuất tài khoản"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline-block">Đăng xuất</span>
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-start overflow-x-auto border-t border-slate-100 scrollbar-none">
          <nav className="flex space-x-1 py-1.5" aria-label="Tabs">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`tab-btn-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer
                    ${isActive
                      ? "bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100/50 font-bold"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                    }
                  `}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white font-mono animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
