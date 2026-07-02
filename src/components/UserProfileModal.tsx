import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, User, Sparkles, Check, Loader2, Upload, Phone, Calendar, Link } from "lucide-react";
import { ClientUser } from "../types";
import { uploadFileToSupabase, isFirebaseEnabled } from "../firebase";
import { uploadFileToSupabaseStorage, isSupabaseEnabled } from "../supabase";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: ClientUser | null;
  onProfileUpdated: () => void;
}

export default function UserProfileModal({ isOpen, onClose, user, onProfileUpdated }: UserProfileModalProps) {
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [photoUrl, setPhotoUrl] = useState(user?.photoURL || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [birthday, setBirthday] = useState(user?.birthday || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [customAvatars, setCustomAvatars] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/custom-avatars")
        .then(res => res.json())
        .then(data => {
          if (data.status === "success") {
            setCustomAvatars(data.avatars || []);
          }
        })
        .catch(err => console.error("Lỗi tải danh sách ảnh đại diện mẫu:", err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
      setPhotoUrl(user.photoURL || "");
      setPhone(user.phone || "");
      setBirthday(user.birthday || "");
      setImgError(false);
    }
  }, [user, isOpen]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg("Kích thước tệp quá lớn (tối đa 2MB).");
      return;
    }

    // Validate type
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Chỉ hỗ trợ tệp định dạng hình ảnh.");
      return;
    }

    setIsUploading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      let uploadedSuccessfully = false;

      if (isSupabaseEnabled) {
        try {
          const directUrl = await uploadFileToSupabaseStorage(file, "avatars", file.name);
          setPhotoUrl(directUrl);
          setImgError(false);
          setSuccessMsg("Đã tải ảnh đại diện lên thành công!");
          uploadedSuccessfully = true;
          setIsUploading(false);
        } catch (err: any) {
          console.warn("Lỗi tải ảnh trực tiếp lên Supabase Storage, thử tải qua Backend Server...", err);
        }
      } else if (isFirebaseEnabled) {
        try {
          const directUrl = await uploadFileToSupabase(file, "avatars", file.name);
          setPhotoUrl(directUrl);
          setImgError(false);
          setSuccessMsg("Đã tải ảnh đại diện lên thành công!");
          uploadedSuccessfully = true;
          setIsUploading(false);
        } catch (err: any) {
          console.warn("Lỗi tải ảnh trực tiếp lên Firebase Storage, thử tải qua Backend Server...", err);
        }
      }

      if (!uploadedSuccessfully) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          try {
            const res = await fetch("/api/user/upload-avatar", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                base64Data,
                fileName: file.name
              })
            });

            const data = await res.json();
            if (res.ok && data.status === "success") {
              setPhotoUrl(data.photoUrl);
              setImgError(false);
              setSuccessMsg("Đã tải ảnh đại diện lên thành công!");
            } else {
              throw new Error(data.message || "Không thể tải ảnh lên.");
            }
          } catch (err: any) {
            console.error("Lỗi tải ảnh lên backend:", err);
            setErrorMsg(err.message || "Lỗi khi tải ảnh lên máy chủ.");
          } finally {
            setIsUploading(false);
          }
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      console.error("Lỗi đọc/tải file ảnh:", err);
      setErrorMsg(err.message || "Lỗi xử lý file.");
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMsg("Tên hiển thị không được bỏ trống.");
      return;
    }

    setIsSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          photoUrl: photoUrl.trim(),
          phone: phone.trim() || null,
          birthday: birthday || null,
        }),
      });

      const data = await res.json();
      if (data.status === "success") {
        setSuccessMsg("Đã lưu thông tin cá nhân thành công!");
        onProfileUpdated();
        setTimeout(() => {
          onClose();
          setSuccessMsg("");
        }, 1500);
      } else {
        setErrorMsg(data.message || "Không thể cập nhật hồ sơ.");
      }
    } catch (err: any) {
      setErrorMsg("Có lỗi xảy ra khi kết nối máy chủ.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, y: 15, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 15, opacity: 0 }}
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative z-10 flex flex-col text-slate-800"
          >
            {/* Header */}
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
                <h3 className="font-sans font-bold text-base text-slate-900">Tùy chỉnh thông tin cá nhân</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer outline-none border-0 bg-transparent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
              {/* Profile Preview */}
              <div className="flex items-center gap-5 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50">
                <div className="relative">
                  {photoUrl && !imgError ? (
                    <img
                      src={photoUrl}
                      alt="Xem trước"
                      className="w-16 h-16 rounded-full object-cover border-2 border-indigo-500 shadow-md"
                      onError={() => setImgError(true)}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xl border-2 border-indigo-200">
                      {displayName?.charAt(0).toUpperCase() || "H"}
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 p-1 bg-indigo-600 text-white rounded-full text-[10px] shadow border border-white">
                    <User className="w-3 h-3" />
                  </span>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{displayName || "Học viên mới"}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
                </div>
              </div>

              {/* Display Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Tên hiển thị</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Nhập tên hiển thị của bạn..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    required
                  />
                </div>
              </div>

              {/* Phone & Birthday Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Phone Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Số điện thoại</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                      <Phone className="w-4 h-4" />
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Nhập số điện thoại..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>
                </div>

                {/* Birthday Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Ngày sinh</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                      <Calendar className="w-4 h-4" />
                    </span>
                    <input
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Admin Uploaded Custom Avatars */}
              {customAvatars.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-indigo-600 uppercase tracking-wider block flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                    CHỌN ẢNH ĐẠI DIỆN
                  </label>
                  <div className="grid grid-cols-4 gap-2.5">
                    {customAvatars.map((url, index) => {
                      const isSelected = photoUrl === url;
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setPhotoUrl(url);
                            setErrorMsg("");
                            setImgError(false);
                          }}
                          className={`group relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all active:scale-95 ${
                            isSelected
                              ? "border-indigo-600 ring-2 ring-indigo-500/20 shadow-md"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                          title={`Ảnh mẫu ${index + 1}`}
                        >
                          <img
                            src={url}
                            alt={`Ảnh mẫu ${index + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            referrerPolicy="no-referrer"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-indigo-600/20 flex items-center justify-center">
                              <span className="p-1 bg-indigo-600 text-white rounded-full shadow">
                                <Check className="w-3 h-3" />
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Upload to Storage */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Thiết lập ảnh đại diện (Tải lên hoặc Dán link)</label>
                <div className="flex items-center gap-3">
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/20 px-4 py-4 rounded-xl cursor-pointer transition-all text-slate-500 group flex-1">
                    <div className="flex flex-col items-center justify-center space-y-1">
                      {isUploading ? (
                        <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                      ) : (
                        <Upload className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                      )}
                      <span className="text-xs font-bold text-slate-600 group-hover:text-indigo-600 transition-colors">
                        {isUploading ? "Đang xử lý tải lên..." : "Chọn ảnh đại diện..."}
                      </span>
                      <span className="text-[10px] text-slate-400">PNG, JPG tối đa 2MB</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploading || isSaving}
                    />
                  </label>
                  
                  <button
                    type="button"
                    onClick={() => {
                      const url = window.prompt("Nhập link ảnh (Hỗ trợ tự động lấy ID từ link Google Drive):", photoUrl || "");
                      if (url !== null && url.trim() !== "") {
                        let finalUrl = url.trim();
                        if (finalUrl.includes("drive.google.com")) {
                          const idMatch = finalUrl.match(/[-\w]{25,}/);
                          if (idMatch) {
                            finalUrl = `https://drive.google.com/uc?export=download&id=${idMatch[0]}`;
                          }
                        }
                        setPhotoUrl(finalUrl);
                        setImgError(false);
                      }
                    }}
                    className="flex flex-col items-center justify-center border-2 border-slate-200 hover:border-indigo-400 bg-white hover:bg-indigo-50/20 px-4 py-4 rounded-xl cursor-pointer transition-all text-slate-500 group flex-1"
                  >
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <Link className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                      <span className="text-xs font-bold text-slate-600 group-hover:text-indigo-600 transition-colors">
                        Dán Link Ảnh
                      </span>
                      <span className="text-[10px] text-slate-400">Drive, Imgur...</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Error and Success Notifications */}
              {errorMsg && (
                <div className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 p-3 rounded-xl animate-shake">
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 p-3 rounded-xl animate-fade-in flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-500" />
                  {successMsg}
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex gap-3 pt-3 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-4 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer disabled:opacity-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Đang lưu...
                    </>
                  ) : (
                    "Lưu thay đổi"
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
