import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  items: [{
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameAccount',
      required: true
    },
    price: {
      type: Number,
      required: true
    }
  }],
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['balance'],
    default: 'balance'
  },
  spinsAwarded: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index phục vụ tra cứu tài khoản theo đơn hàng (trang "Tài khoản đã bán").
orderSchema.index({ 'items.accountId': 1 });
orderSchema.index({ createdAt: -1 });

export default mongoose.model('Order', orderSchema);
