import mongoose from 'mongoose';

const adminAccessLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  adminUsername: {
    type: String,
    required: true
  },
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    required: true
  },
  path: {
    type: String,
    required: true
  },
  ip: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  params: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  // Body keys only — never store sensitive values
  bodyKeys: {
    type: [String],
    default: []
  },
  statusCode: {
    type: Number,
    default: null
  },
  responseTime: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

// Index for fast queries
adminAccessLogSchema.index({ createdAt: -1 });
adminAccessLogSchema.index({ adminId: 1, createdAt: -1 });
adminAccessLogSchema.index({ path: 1, createdAt: -1 });

export default mongoose.model('AdminAccessLog', adminAccessLogSchema);
