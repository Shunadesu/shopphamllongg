import mongoose from 'mongoose';
import Counter from './Counter.js';

const gameAccountSchema = new mongoose.Schema({
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  code: {
    type: String,
    unique: true,
    sparse: true,
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  username: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  password2: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    required: true
  },
  originalPrice: {
    type: Number,
    default: 0
  },
  adminDiscountPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  images: [{
    type: String
  }],
  teamValue: {
    type: String,
    default: ''
  },
  bp: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    default: ''
  },
  cccd: {
    type: String,
    default: ''
  },
  additionalInfo: {
    type: String,
    default: ''
  },
  isHot: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['available', 'sold', 'reserved'],
    default: 'available'
  },
  soldTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  soldAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Tự sinh mã cố định "TÀI KHOẢN FO4 #{globalSeq}" khi tạo mới mà không có
// code do admin cung cấp. Sequence lấy từ Counter (atomic $inc) để đảm bảo
// không trùng khi có nhiều request tạo tài khoản đồng thời. Tiền tố "FO4"
// là cố định — không phụ thuộc vào danh mục cha/con hay bất kỳ điều gì
// khác, chỉ cần đánh số tăng dần.
gameAccountSchema.pre('save', async function (next) {
  try {
    if (this.isNew && !this.code) {
      const counter = await Counter.findByIdAndUpdate(
        'accountCode',
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );

      this.code = `TÀI KHOẢN FO4 #${counter.seq}`;
    }
    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.model('GameAccount', gameAccountSchema);
