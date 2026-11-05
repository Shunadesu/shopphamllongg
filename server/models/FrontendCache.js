import mongoose from 'mongoose';

// Phiên bản cache frontend.
//
// Mục đích: sau mỗi lần deploy (server + frontend), các store zustand đã
// persist trong localStorage của người dùng vẫn giữ dữ liệu cũ (link ảnh
// banner, social link, thông báo...) khiến site hiện bản cũ. Khi admin bấm
// "Refresh cache toàn bộ người dùng", version ở đây được tăng lên; frontend
// poll thấy version lệch → xóa store persist cũ → reload lấy dữ liệu mới.
//
// Chỉ tồn tại 1 document (key = 'frontend'). Tách khỏi SiteSetting để không
// lọt vào payload public của GET /api/settings và tránh bị PUT /settings/:key
// ghi đè nhầm.
const frontendCacheSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'frontend',
      unique: true,
      index: true,
    },
    version: {
      type: String,
      default: '',
    },
    bumpedAt: {
      type: Date,
      default: null,
    },
    bumpedBy: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('FrontendCache', frontendCacheSchema);
