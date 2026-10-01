import mongoose from 'mongoose';

// Counter collection dùng để cấp số thứ tự tăng dần một cách atomic,
// phục vụ việc sinh mã tài khoản cố định (vd: "TÀI KHOẢN FO4 #1").
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, {
  timestamps: false
});

// Dùng `findByIdAndUpdate({ $inc: { seq: 1 } }, { upsert: true })` để
// đảm bảo không trùng số khi nhiều request tạo tài khoản đồng thời.
export default mongoose.model('Counter', counterSchema);
