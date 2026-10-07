import mongoose from 'mongoose';

const webhookLogSchema = new mongoose.Schema({
  // Nguồn webhook (hiện tại chỉ có sepay, sau có thể mở rộng)
  source: {
    type: String,
    enum: ['sepay'],
    required: true,
    default: 'sepay'
  },
  
  // Raw payload từ webhook provider
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // SePay transaction ID (từ payload.id)
  sepayTransactionId: {
    type: String,
    index: true
  },
  
  // Số tiền giao dịch
  amount: {
    type: Number,
    default: 0
  },
  
  // Nội dung chuyển khoản
  content: {
    type: String,
    default: ''
  },
  
  // Gateway/ngân hàng (VCB, ACB, etc.)
  gateway: {
    type: String,
    default: ''
  },
  
  // Số tài khoản nhận
  accountNumber: {
    type: String,
    default: ''
  },
  
  // Kết quả xử lý webhook
  processingStatus: {
    type: String,
    enum: ['processing', 'success', 'ignored', 'error', 'duplicate'],
    default: 'processing',
    index: true
  },
  
  // Ghi chú về quá trình xử lý (lý do ignored/error)
  processingNote: {
    type: String,
    default: ''
  },
  
  // Deposit request được match (nếu có)
  matchedDepositId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DepositRequest',
    default: null,
    index: true
  },
  
  // IP nguồn gửi webhook
  sourceIp: {
    type: String,
    default: 'unknown'
  },
  
  // Thời điểm nhận webhook
  receivedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound index để query hiệu quả
webhookLogSchema.index({ processingStatus: 1, receivedAt: -1 });

export default mongoose.model('WebhookLog', webhookLogSchema);
