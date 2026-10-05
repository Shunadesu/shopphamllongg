import mongoose from 'mongoose';
import DepositRequest from '../models/DepositRequest.js';
import User from '../models/User.js';
import { calculateSpinsAwarded } from './spinLogic.js';

/**
 * Auto-approve một DepositRequest pending, cộng số dư + spins cho user.
 * Dùng MongoDB transaction để đảm bảo atomic (cả deposit và user update hoặc không có gì update).
 *
 * Lưu ý: luôn cộng `deposit.amount` (số tiền user yêu cầu ban đầu), không phải số tiền
 * thực nhận — theo policy đã chốt với admin.
 *
 * @param {Object} options
 * @param {Object} options.deposit   - DepositRequest document (chưa save) — sẽ mutate và save.
 * @param {string} options.source     - 'sepay' | 'email' | 'polling' (ghi vào adminNote để audit).
 * @param {string} options.note       - Ghi chú thêm cho adminNote (vd: 'Received: 50000đ').
 * @returns {Promise<{user: Object, spinsAwarded: number}>}
 */
export async function autoApproveDeposit({ deposit, source, note }) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(deposit.userId).session(session);
    if (!user) {
      throw new Error(`User not found for deposit ${deposit._id}`);
    }

    // === Update deposit ===
    deposit.status = 'approved';
    deposit.processedAt = new Date();
    deposit.processedBy = null; // null = auto by system
    deposit.autoApproved = true;
    deposit.adminNote = `Auto approved via ${source} - ${note}`;
    await deposit.save({ session });

    // === Update user balance + spins ===
    const oldBalance = user.balance;
    const prevTotalDeposited = user.totalDeposited || 0;
    const newTotalDeposited = prevTotalDeposited + deposit.amount;
    const spinsAwarded = calculateSpinsAwarded(prevTotalDeposited, newTotalDeposited);

    user.balance += deposit.amount;
    user.totalDeposited = newTotalDeposited;
    user.spins = (user.spins || 0) + spinsAwarded;
    await user.save({ session });

    await session.commitTransaction();

    console.log(
      `[autoApproveDeposit] ${deposit._id} via ${source} | ` +
      `user=${user.username} | ` +
      `amount=${deposit.amount.toLocaleString('vi-VN')}đ | ` +
      `balance: ${oldBalance.toLocaleString()} → ${user.balance.toLocaleString()} | ` +
      `spins: +${spinsAwarded} (total: ${user.spins}) | ` +
      `totalDeposited: ${prevTotalDeposited.toLocaleString()} → ${newTotalDeposited.toLocaleString()}`
    );

    return { user, spinsAwarded };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
