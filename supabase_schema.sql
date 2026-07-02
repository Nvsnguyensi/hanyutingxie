-- SCRIPT THIẾT LẬP BẢNG CHO SUPABASE
-- Bạn có thể chạy script SQL này trực tiếp trong "SQL Editor" trên bảng điều khiển Supabase của bạn.

-- HƯỚNG DẪN QUAN TRỌNG ĐỂ TRÁNH LỖI BUCKET RLS:
-- Nếu bạn chạy câu lệnh INSERT vào bảng storage.buckets mà gặp lỗi "violates row-level security policy for table 'buckets'":
-- 1. Hãy truy cập trang quản trị Supabase Dashboard của bạn.
-- 2. Đi tới mục "Storage" ở thanh menu bên trái.
-- 3. Bấm "New bucket", điền tên là "app-files".
-- 4. BẬT (Tích chọn) ô "Public bucket" (Cực kỳ quan trọng để người dùng có thể xem ảnh/nghe nhạc trực tiếp).
-- 5. Bấm "Create bucket".
-- 6. Sau đó, chạy đoạn mã SQL bên dưới trong SQL Editor để cấu hình chính sách truy cập (Policies) cho các tệp tin bên trong bucket này.

-- ======================================================
-- 1. Bảng users (Lưu trữ thông tin người dùng)
-- ======================================================
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    uid TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    "displayName" TEXT,
    "photoUrl" TEXT,
    phone TEXT,
    birthday TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Bật Row Level Security (RLS) cho bảng users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Xóa policy cũ nếu tồn tại trước khi tạo mới
DROP POLICY IF EXISTS "Cho phép toàn quyền truy cập" ON public.users;
-- Tạo chính sách cho phép mọi thao tác
CREATE POLICY "Cho phép toàn quyền truy cập" ON public.users FOR ALL USING (true) WITH CHECK (true);


-- ======================================================
-- 2. Bảng stats (Lưu trữ chỉ số học tập của từng người dùng)
-- ======================================================
CREATE TABLE IF NOT EXISTS public.stats (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    "totalLessons" INTEGER DEFAULT 0,
    "totalCorrect" INTEGER DEFAULT 0,
    "totalWrong" INTEGER DEFAULT 0,
    "totalXp" INTEGER DEFAULT 0,
    "vocabCount" INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    "dailyProgress" JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép toàn quyền truy cập" ON public.stats;
CREATE POLICY "Cho phép toàn quyền truy cập" ON public.stats FOR ALL USING (true) WITH CHECK (true);


-- ======================================================
-- 3. Bảng settings (Cấu hình cá nhân hóa & API Keys của từng người dùng)
-- ======================================================
CREATE TABLE IF NOT EXISTS public.settings (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    "groqApiKey" TEXT DEFAULT '',
    "elevenLabsApiKey" TEXT DEFAULT '',
    "elevenLabsVoiceId" TEXT DEFAULT 'pNInz6ob9g9j9ffgIOFa',
    "useGoogleTts" BOOLEAN DEFAULT true,
    "xpSettings" JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép toàn quyền truy cập" ON public.settings;
CREATE POLICY "Cho phép toàn quyền truy cập" ON public.settings FOR ALL USING (true) WITH CHECK (true);


-- ======================================================
-- 4. Bảng vocabulary (Danh sách từ vựng cá nhân đã lưu)
-- ======================================================
CREATE TABLE IF NOT EXISTS public.vocabulary (
    id TEXT PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    chinese TEXT NOT NULL,
    pinyin TEXT,
    translation TEXT,
    "sourceSentence" TEXT,
    "srsNextReviewDate" TIMESTAMPTZ DEFAULT NOW(),
    "srsInterval" INTEGER DEFAULT 1,
    "srsEaseFactor" DOUBLE PRECISION DEFAULT 2.5,
    "srsRepetitions" INTEGER DEFAULT 0
);

ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép toàn quyền truy cập" ON public.vocabulary;
CREATE POLICY "Cho phép toàn quyền truy cập" ON public.vocabulary FOR ALL USING (true) WITH CHECK (true);


-- ======================================================
-- 5. Bảng revisionItems (Danh sách câu cần ôn tập SRS)
-- ======================================================
CREATE TABLE IF NOT EXISTS public.revisionItems (
    id TEXT PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    "sentenceId" TEXT,
    chinese TEXT NOT NULL,
    pinyin TEXT,
    translation TEXT,
    "sourceSentence" TEXT,
    "srsNextReviewDate" TIMESTAMPTZ DEFAULT NOW(),
    "srsInterval" INTEGER DEFAULT 1,
    "srsEaseFactor" DOUBLE PRECISION DEFAULT 2.5,
    "srsRepetitions" INTEGER DEFAULT 0
);

ALTER TABLE public.revisionItems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép toàn quyền truy cập" ON public.revisionItems;
CREATE POLICY "Cho phép toàn quyền truy cập" ON public.revisionItems FOR ALL USING (true) WITH CHECK (true);


-- ======================================================
-- 6. Bảng lessons (Các bài học do quản trị viên tạo)
-- ======================================================
CREATE TABLE IF NOT EXISTS public.lessons (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    level TEXT NOT NULL,
    topic TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép toàn quyền truy cập" ON public.lessons;
CREATE POLICY "Cho phép toàn quyền truy cập" ON public.lessons FOR ALL USING (true) WITH CHECK (true);


-- ======================================================
-- 7. Bảng sentences (Danh sách các câu thuộc bài học tương ứng)
-- ======================================================
CREATE TABLE IF NOT EXISTS public.sentences (
    id TEXT PRIMARY KEY,
    "lessonId" TEXT NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    chinese TEXT NOT NULL,
    pinyin TEXT DEFAULT '',
    translation TEXT,
    explanation TEXT DEFAULT '',
    "audioUrl" TEXT DEFAULT ''
);

ALTER TABLE public.sentences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép toàn quyền truy cập" ON public.sentences;
CREATE POLICY "Cho phép toàn quyền truy cập" ON public.sentences FOR ALL USING (true) WITH CHECK (true);


-- ======================================================
-- 8. CẤU HÌNH STORAGE POLICIES (CHÍNH SÁCH LƯU TRỮ FILE)
-- ======================================================
-- Bật RLS cho storage.objects (nếu chưa bật)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Cho phép SELECT (đọc công khai) tất cả tệp trong bucket 'app-files'
DROP POLICY IF EXISTS "Allow Public Select" ON storage.objects;
CREATE POLICY "Allow Public Select" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'app-files');

-- Cho phép INSERT (tải lên công khai) tệp vào bucket 'app-files'
DROP POLICY IF EXISTS "Allow Public Insert" ON storage.objects;
CREATE POLICY "Allow Public Insert" ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'app-files');

-- Cho phép UPDATE (cập nhật công khai) tệp trong bucket 'app-files'
DROP POLICY IF EXISTS "Allow Public Update" ON storage.objects;
CREATE POLICY "Allow Public Update" ON storage.objects
    FOR UPDATE
    USING (bucket_id = 'app-files')
    WITH CHECK (bucket_id = 'app-files');

-- Cho phép DELETE (xóa công khai) tệp trong bucket 'app-files'
DROP POLICY IF EXISTS "Allow Public Delete" ON storage.objects;
CREATE POLICY "Allow Public Delete" ON storage.objects
    FOR DELETE
    USING (bucket_id = 'app-files');

