import express from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, '../uploads');
const cacheDir = path.join(uploadsDir, '.cache');

// Các bề rộng được phép resize. Dùng danh sách cố định (allowlist) để
// tránh bị ép tạo hàng loạt biến thể gây tốn CPU + disk.
const ALLOWED_WIDTHS = [320, 640, 960, 1280, 1920];

// Ảnh vector / ảnh động → không resize, serve file gốc.
const SKIP_RESIZE_EXT = new Set(['.svg', '.gif']);

const ONE_YEAR = 31536000;

if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Kiểm tra đường dẫn nằm trong uploadsDir (chặn path traversal).
const isInsideUploads = (target) => {
  const rel = path.relative(uploadsDir, target);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

// Resize + chuyển sang WebP, cache kết quả xuống disk.
// Ghi ra file .tmp rồi rename (atomic trên cùng filesystem) để nhiều
// request đồng thời không đọc được file đang ghi dở.
const buildVariant = async (srcPath, width) => {
  const base = path.basename(srcPath, path.extname(srcPath));
  const cacheName = `${base}-${width}.webp`;
  const cachePath = path.join(cacheDir, cacheName);

  if (isFile(cachePath)) return cachePath;

  const tmpPath = path.join(cacheDir, `${cacheName}.${process.pid}.${Date.now()}.tmp`);
  try {
    await sharp(srcPath)
      .rotate() // tôn trọng EXIF orientation trước khi cắt
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(tmpPath);
    fs.renameSync(tmpPath, cachePath);
    return cachePath;
  } catch (err) {
    // Dọn file tạm nếu resize lỗi (file hỏng, format lạ, ...)
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {
      /* ignore */
    }
    throw err;
  }
};

/**
 * GET /uploads/<path>?w=640
 *
 * - Không có `w` (hoặc `w` không hợp lệ) → trả file gốc, cache 1 năm.
 * - Có `w` hợp lệ → resize sang WebP, cache kết quả xuống disk.
 */
router.get('*', async (req, res) => {
  try {
    const rel = decodeURIComponent(req.params[0] || '');
    if (!rel || rel.includes('\0')) {
      return res.status(400).end();
    }

    const srcPath = path.join(uploadsDir, rel);
    if (!isInsideUploads(srcPath) || !isFile(srcPath)) {
      return res.status(404).end();
    }

    const ext = path.extname(srcPath).toLowerCase();
    const width = parseInt(req.query.w, 10);

    if (!ALLOWED_WIDTHS.includes(width) || SKIP_RESIZE_EXT.has(ext)) {
      // File gốc: tên file luôn unique (Date.now + random) nên cache mạnh được.
      return res.sendFile(srcPath, {
        maxAge: `${ONE_YEAR}s`,
        immutable: true,
      });
    }

    const variantPath = await buildVariant(srcPath, width);

    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': `public, max-age=${ONE_YEAR}, immutable`,
      'X-Image-Variant': `${width}w`,
    });
    return res.sendFile(variantPath, {
      maxAge: `${ONE_YEAR}s`,
      immutable: true,
    });
  } catch (error) {
    console.error('Media serve error:', error);
    return res.status(500).end();
  }
});

export default router;
