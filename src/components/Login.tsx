import React, { useState } from "react";
import { 
  auth as firebaseAuth, 
  isFirebaseEnabled,
  createUserWithEmailAndPassword as firebaseCreateUser, 
  signInWithEmailAndPassword as firebaseSignIn, 
  sendPasswordResetEmail as firebaseReset,
  updateProfile as firebaseUpdateProfile,
  signInWithFacebook as firebaseSignInWithFacebook
} from "../firebase";
import {
  isSupabaseEnabled,
  supabaseUrl,
  supabaseAnonKey,
  setCustomSupabaseConfig,
  clearCustomSupabaseConfig,
  createUserWithEmailAndPassword as supabaseCreateUser,
  signInWithEmailAndPassword as supabaseSignIn,
  sendPasswordResetEmail as supabaseReset,
  updateProfile as supabaseUpdateProfile,
  signInWithFacebook as supabaseSignInWithFacebook
} from "../supabase";
import { Loader2, Mail, Lock, LogIn, UserPlus, Info, CheckCircle2, ShieldAlert, ArrowLeft, KeyRound } from "lucide-react";

interface LoginProps {
  isSyncing?: boolean;
}

export default function Login({ isSyncing = false }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showConfig, setShowConfig] = useState(false);
  const [customUrl, setCustomUrl] = useState(supabaseUrl || "");
  const [customAnonKey, setCustomAnonKey] = useState(supabaseAnonKey || "");

  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseEnabled && !isFirebaseEnabled) {
      setMessage({
        type: "error",
        text: "Hệ thống xác thực chưa được cấu hình. Đang chạy ở chế độ Demo cục bộ.",
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (isForgot) {
        if (isSupabaseEnabled) {
          await supabaseReset(email);
        } else {
          await firebaseReset(firebaseAuth, email);
        }

        setMessage({
          type: "success",
          text: "Yêu cầu đặt lại mật khẩu đã được gửi! Vui lòng kiểm tra email của bạn để nhận liên kết khôi phục (hãy kiểm tra cả hộp thư rác/spam).",
        });
      } else if (isRegister) {
        if (isSupabaseEnabled) {
          await supabaseCreateUser(email, password, fullName);
        } else {
          const userCredential = await firebaseCreateUser(firebaseAuth, email, password);
          await firebaseUpdateProfile(userCredential.user, {
            displayName: fullName || email.split("@")[0],
          });
        }

        setPassword("");
        setMode("login");
        setMessage({
          type: "success",
          text: "Tài khoản của bạn đã được khởi tạo thành công. Vui lòng đăng nhập.",
        });
      } else {
        if (isSupabaseEnabled) {
          try {
            await supabaseSignIn(email, password);
            setMessage({
              type: "success",
              text: "Đăng nhập thành công! Đang chuyển hướng...",
            });
            setTimeout(() => {
              window.location.href = "/";
            }, 800);
          } catch (signInError: any) {
            // Auto register on wrong password / missing account to provide the seamless login/signup experience
            if (signInError.status === 400 || signInError.message?.toLowerCase().includes("invalid login credentials")) {
              try {
                await supabaseCreateUser(email, password, email.split("@")[0]);
                setMessage({
                  type: "success",
                  text: "Đăng ký và Đăng nhập thành công! Đang chuyển hướng...",
                });
                setTimeout(() => {
                  window.location.href = "/";
                }, 800);
              } catch (signUpErr) {
                throw signInError;
              }
            } else {
              throw signInError;
            }
          }
        } else {
          try {
            await firebaseSignIn(firebaseAuth, email, password);
            setMessage({
              type: "success",
              text: "Đăng nhập thành công! Đang chuyển hướng...",
            });
            setTimeout(() => {
              window.location.href = "/";
            }, 800);
          } catch (signInError: any) {
            if (signInError.code === "auth/user-not-found" || signInError.code === "auth/invalid-credential") {
              try {
                const userCredential = await firebaseCreateUser(firebaseAuth, email, password);
                await firebaseUpdateProfile(userCredential.user, {
                  displayName: email.split("@")[0],
                });
                setMessage({
                  type: "success",
                  text: "Đăng ký và Đăng nhập thành công! Đang chuyển hướng...",
                });
                setTimeout(() => {
                  window.location.href = "/";
                }, 800);
              } catch (signUpErr) {
                throw signInError;
              }
            } else {
              throw signInError;
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      let errMsg = err.message || "Đã xảy ra lỗi trong quá trình xác thực.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.status === 400) {
        errMsg = "Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại hoặc tạo tài khoản mới.";
      } else if (err.code === "auth/email-already-in-use" || err.message?.includes("User already registered")) {
        errMsg = "Địa chỉ email này đã được đăng ký tài khoản khác. Vui lòng đăng nhập hoặc chọn khôi phục mật khẩu.";
      } else if (err.code === "auth/weak-password" || err.message?.includes("should be at least 6 characters")) {
        errMsg = "Mật khẩu quá ngắn (tối thiểu 6 ký tự). Vui lòng nhập mật khẩu mạnh hơn.";
      } else if (err.code === "auth/invalid-email") {
        errMsg = "Địa chỉ email không hợp lệ. Vui lòng nhập địa chỉ email đúng định dạng.";
      }

      setMessage({
        type: "error",
        text: errMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    if (!isSupabaseEnabled && !isFirebaseEnabled) {
      setMessage({
        type: "error",
        text: "Hệ thống xác thực chưa được cấu hình. Đang chạy ở chế độ Demo cục bộ.",
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (isSupabaseEnabled) {
        await supabaseSignInWithFacebook();
      } else {
        await firebaseSignInWithFacebook();
      }
      setMessage({
        type: "success",
        text: "Đang chuyển hướng tới trang đăng nhập Facebook...",
      });
    } catch (err: any) {
      console.error("Facebook Login error:", err);
      setMessage({
        type: "error",
        text: err.message || "Không thể khởi tạo đăng nhập bằng Facebook. Vui lòng thử lại sau.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        {/* Branding header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-0.5 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-3xl shadow-lg shadow-indigo-500/20 mb-3 relative w-16 h-16">
            <img 
              src="/api/avatars/preset_1782568534322.png" 
              alt="HanScript Logo" 
              className="w-16 h-16 rounded-[22px] object-cover absolute inset-0 z-10"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = document.getElementById('login-logo-fallback');
                if (fallback) fallback.classList.remove('hidden');
              }}
            />
            <div id="login-logo-fallback" className="hidden p-3 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-2xl w-full h-full flex items-center justify-center">
              <span className="font-sans text-xl font-black text-white tracking-widest">中文</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Học Tiếng Trung Dictation</h1>
          <p className="text-slate-400 text-sm mt-1">Hệ thống luyện nghe chép chính tả thông minh</p>
        </div>

        {/* Configuration Badges */}
        {isSupabaseEnabled && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-200 text-xs leading-relaxed space-y-2 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-emerald-400">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Đã kết nối cơ sở dữ liệu Supabase (Cloud)</span>
              </div>
              {localStorage.getItem("supabase_url_custom") && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Bạn muốn xóa cấu hình Supabase tự chọn và quay lại mặc định?")) {
                      clearCustomSupabaseConfig();
                    }
                  }}
                  className="text-[10px] text-red-400 hover:underline cursor-pointer"
                >
                  Xóa cấu hình
                </button>
              )}
            </div>
            <p className="text-slate-400">
              Dữ liệu học tập và tài khoản của bạn đang được đồng bộ hóa an toàn, thời gian thực trực tiếp trên đám mây Supabase.
            </p>
          </div>
        )}

        {!isSupabaseEnabled && isFirebaseEnabled && (
          <div className="mb-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-200 text-xs leading-relaxed space-y-2 shadow-inner">
            <div className="flex items-center gap-2 font-semibold text-indigo-400">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Đã liên kết cơ sở dữ liệu Firebase</span>
            </div>
            <p>
              Tài khoản và dữ liệu học tập của bạn đang được lưu trữ trực tiếp trên đám mây Firebase.
            </p>
          </div>
        )}

        {!isFirebaseEnabled && !isSupabaseEnabled && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 text-xs leading-relaxed space-y-3 shadow-inner">
            <div className="flex items-center gap-2 font-semibold text-amber-400">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>Chưa liên kết cơ sở dữ liệu Cloud</span>
            </div>
            <p>
              Ứng dụng hiện đang chạy ở chế độ ngoại tuyến (Local Demo). Để kết nối dữ liệu thật của riêng bạn khi triển khai lên Cloudflare, vui lòng cấu hình tài khoản Supabase bên dưới.
            </p>
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="w-full py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-semibold border border-amber-500/30 transition-all cursor-pointer text-center"
            >
              {showConfig ? "Đóng bảng cấu hình" : "Cấu hình liên kết Supabase thủ công"}
            </button>
          </div>
        )}

        {showConfig && (
          <div className="mb-6 p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 text-xs">
            <h3 className="font-semibold text-white text-sm flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-amber-400" /> Cấu hình Supabase cá nhân
            </h3>
            <p className="text-slate-400 leading-relaxed">
              Nhập thông tin kết nối Supabase của bạn (Lấy từ <strong>Project Settings &gt; API</strong> trên Supabase Dashboard).
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Supabase URL</label>
                <input
                  type="text"
                  placeholder="https://your-project.supabase.co"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Supabase Anon Key</label>
                <input
                  type="text"
                  placeholder="eyJh..."
                  value={customAnonKey}
                  onChange={(e) => setCustomAnonKey(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (!customUrl || !customAnonKey) {
                    alert("Vui lòng nhập đầy đủ cả hai trường URL và Anon Key!");
                    return;
                  }
                  setCustomSupabaseConfig(customUrl, customAnonKey);
                }}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-center transition-all cursor-pointer"
              >
                Lưu cấu hình & Kết nối
              </button>
              {localStorage.getItem("supabase_url_custom") && (
                <button
                  type="button"
                  onClick={() => {
                    clearCustomSupabaseConfig();
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-center transition-all cursor-pointer"
                >
                  Xóa
                </button>
              )}
            </div>
          </div>
        )}

        {/* Auth Glass Card */}
        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">
            {isForgot ? "Khôi phục mật khẩu" : isRegister ? "Tạo tài khoản mới" : "Đăng nhập hệ thống"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Họ và tên</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    disabled={loading || isSyncing}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all disabled:opacity-50"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Địa chỉ Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  disabled={loading || isSyncing}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your-email@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all disabled:opacity-50"
                />
              </div>
            </div>

            {!isForgot && (
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-slate-400">Mật khẩu</label>
                  {!isRegister && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setMessage(null);
                      }}
                      className="text-xs text-indigo-400 hover:underline bg-transparent border-0 cursor-pointer outline-none font-semibold"
                    >
                      Quên mật khẩu?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    disabled={loading || isSyncing}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all disabled:opacity-50"
                  />
                </div>
              </div>
            )}

            {message && (
              <div
                className={`p-3 rounded-xl flex items-start gap-2.5 text-xs ${
                  message.type === "success"
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                    : "bg-rose-500/10 border border-rose-500/20 text-rose-300"
                }`}
              >
                {message.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                ) : (
                  <Info className="w-4 h-4 flex-shrink-0 text-rose-400" />
                )}
                <span className="leading-relaxed">{message.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isSyncing}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 active:scale-[0.98] text-white font-medium text-sm rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang đồng bộ dữ liệu đám mây...
                </>
              ) : loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isForgot ? (
                <>
                  <KeyRound className="w-4 h-4" />
                  Gửi liên kết khôi phục
                </>
              ) : isRegister ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  Đăng ký ngay
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Đăng nhập
                </>
              )}
            </button>
          </form>

          {/* Social Sign-In option (only when not in forgot mode) */}
          {!isForgot && (
            <div className="mt-4">
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-slate-900 px-2 text-slate-500 font-medium">Hoặc tiếp tục với</span>
                </div>
              </div>

              <button
                type="button"
                disabled={loading || isSyncing}
                onClick={handleFacebookLogin}
                className="w-full py-2.5 px-4 bg-[#1877F2] hover:bg-[#166FE5] active:scale-[0.98] text-white font-medium text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                )}
                <span>Đăng nhập bằng Facebook</span>
              </button>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-800 text-center text-xs text-slate-400">
            {isForgot ? (
              <button
                onClick={() => {
                  setMode("login");
                  setMessage(null);
                }}
                className="inline-flex items-center gap-2 text-indigo-400 hover:underline cursor-pointer font-semibold outline-none border-0 bg-transparent"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Quay lại đăng nhập
              </button>
            ) : isRegister ? (
              <p>
                Đã có tài khoản?{" "}
                <button
                  onClick={() => {
                    setMode("login");
                    setMessage(null);
                  }}
                  className="text-indigo-400 hover:underline cursor-pointer font-semibold outline-none border-0 bg-transparent"
                >
                  Đăng nhập tại đây
                </button>
              </p>
            ) : (
              <p>
                Chưa có tài khoản?{" "}
                <button
                  onClick={() => {
                    setMode("register");
                    setMessage(null);
                  }}
                  className="text-indigo-400 hover:underline cursor-pointer font-semibold outline-none border-0 bg-transparent"
                >
                  Đăng ký tài khoản mới
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
