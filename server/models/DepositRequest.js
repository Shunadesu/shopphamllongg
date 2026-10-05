import mongoose from 'mongoose';

const depositRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  // Mệnh giá thẻ user nạp (vd: thẻ 100K = 100000). Chỉ áp dụng cho depositMethod = 'card'.
  // Với depositMethod = 'bank', faceAmount === amount (1:1).
  faceAmount: {
    type: Number,
    default: null
  },
  // Số tiền user thực nhận vào số dư (= faceAmount * rate/100 cho thẻ cào, hoặc = amount cho ATM).
  // Mặc định = amount để tương thích ngược với dữ liệu cũ.
  receivedAmount: {
    type: Number,
    default: null
  },
  // Tỷ lệ quy đổi áp dụng tại thời điểm tạo yêu cầu (vd: 80 = 80%). Lưu lại để audit.
  exchangeRate: {
    type: Number,
    default: null
  },
  depositMethod: {
    type: String,
    enum: ['bank', 'card'],
    default: 'bank'
  },
  // Bank deposit fields
  bankAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount',
    required: function() { return this.depositMethod === 'bank'; }
  },
  transferNote: {
    type: String,
    default: ''
  },
  // Card deposit fields
  cardType: {
    type: String,
    enum: ['viettel', 'mobifone', 'vinaphone'],
    required: function() { return this.depositMethod === 'card'; }
  },
  cardSerial: {
    type: String,
    required: function() { return this.depositMethod === 'card'; }
  },
  cardCode: {
    type: String,
    required: function() { return this.depositMethod === 'card'; }
  },
  // Common fields
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  adminNote: {
    type: String,
    default: ''
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  },
  // Auto-approval tracking
  autoApproved: {
    type: Boolean,
    default: false
  },
  emailProcessedAt: {
    type: Date,
    default: null
  },
  // === SePay webhook dedup & audit ===
  // SePay transaction id (payload.id) — same value across retries & replays, dùng làm dedup key.
  // sparse: true để các record cũ / card deposit (không qua SePay) không vi phạm unique index.
  sepayTransactionId: {
    type: String,
    default: null,
    index: { unique: true, sparse: true }
  },
  // Raw payload từ SePay để audit / debug.
  sepayRawPayload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true
});

export default mongoose.model('DepositRequest', depositRequestSchema);
