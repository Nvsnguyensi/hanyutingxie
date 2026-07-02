import { Request, Response, NextFunction } from 'express';
import { authAdmin, isFirebaseEnabled } from './firebase-admin';
import { isSupabaseEnabled, supabaseAdmin } from './supabase-admin';
import { getOrCreateUser } from './users-service';

export interface AuthRequest extends Request {
  user?: any; // Firebase/Supabase/Local User info
  dbUser?: any; // App User database record
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    
    if (isSupabaseEnabled && supabaseAdmin) {
      try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (user && !error) {
          const email = user.email || "user@example.com";
          const displayName = user.user_metadata?.display_name || user.user_metadata?.full_name || email.split('@')[0] || "Học viên";
          const photoUrl = user.user_metadata?.avatar_url || "";
          
          const dbUser = await getOrCreateUser(
            user.id,
            email,
            displayName,
            photoUrl
          );
          req.user = { uid: user.id, email: email };
          req.dbUser = dbUser;
          return next();
        }
      } catch (err) {
        console.error('Lỗi xác thực mã Supabase:', err);
      }
    }
    
    if (isFirebaseEnabled && authAdmin) {
      try {
        const decodedToken = await authAdmin.verifyIdToken(token);
        
        if (decodedToken) {
          const dbUser = await getOrCreateUser(
            decodedToken.uid,
            decodedToken.email || "user@example.com",
            decodedToken.name || decodedToken.email?.split('@')[0] || "Học viên",
            decodedToken.picture || ""
          );
          req.user = { uid: decodedToken.uid, email: decodedToken.email };
          req.dbUser = dbUser;
          return next();
        }
      } catch (err) {
        console.error('Lỗi xác thực mã Firebase, đang chuyển sang tài khoản Demo:', err);
      }
    }
  }

  // Fallback to local offline developer mode ONLY if Supabase is disabled
  if (!isSupabaseEnabled) {
    try {
      const dbUser = await getOrCreateUser(
        "local_dev",
        "nvsnguyensi@gmail.com",
        "Người dùng (Demo)",
        "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150"
      );
      req.user = { uid: "local_dev", email: "nvsnguyensi@gmail.com" };
      req.dbUser = dbUser;
      return next();
    } catch (error) {
      console.error("Lỗi tạo user cục bộ:", error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // If online mode (Supabase enabled) and authentication failed or token is missing
  return res.status(401).json({ status: "error", message: "Vui lòng đăng nhập để tiếp tục." });
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  await requireAuth(req, res, () => {
    if (req.user && (
      req.user.uid === "b9c5d331-26ff-4f1b-909f-38728ecde8fb" || 
      req.user.uid === "d8b2806e-77e7-4852-89d6-fb9b33222d63" || 
      req.user.uid === "local_dev" ||
      req.user.uid === "Wx15T6MdBpes6hUznG3P4NDqjH13" ||
      req.user.email === "nvsnguyensi@gmail.com"
    )) {
      return next();
    }
    return res.status(403).json({ status: "error", message: "Bạn không có quyền quản trị viên." });
  });
};
