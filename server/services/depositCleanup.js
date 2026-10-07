import DepositRequest from '../models/DepositRequest.js';

/**
 * Cleanup job — tự động reject các deposit pending quá hạn.
 *
 * Job này chạy độc lập, không phụ thuộc emailChecker hay SePay webhook:
 *   1. Mỗi interval quét DepositRequest với status='pending' và createdAt < (now - TTL)
 *   2. Atomically chuyển sang 'rejected' (chống race với approve đồng thời)
 *   3. Ghi log rõ ràng để admin tracking
 *
 * Race-safe — dùng findOneAndUpdate với filter status='pending' nên nếu SePay webhook
 * hoặc admin vừa approve thì cập nhật sẽ miss → tránh double-update.
 */

const DEPOSIT_TTL_MS = 20 * 60 * 1000; // 20 phút (khớp với countdown frontend)
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 phút quét 1 lần
const BATCH_SIZE = 50; // giới hạn mỗi lần quét để tránh spike DB khi có nhiều pending cũ

let intervalId = null;
let isRunning = false;

/**
 * Quét và expire các deposit pending quá hạn.
 * @returns {Promise<{expired: number, totalCandidates: number}>}
 */
export async function expireOldPendingDeposits() {
  if (isRunning) {
    // Chống overlap nếu interval trước chưa xong (DB chậm / nhiều pending cũ)
    return { expired: 0, totalCandidates: 0, skipped: true };
  }

  isRunning = true;
  const cutoff = new Date(Date.now() - DEPOSIT_TTL_MS);

  try {
    const candidates = await DepositRequest.find({
      status: 'pending',
      createdAt: { $lt: cutoff }
    })
      .select('_id userId amount transferNote')
      .populate('userId', 'username')
      .limit(BATCH_SIZE)
      .lean();

    if (candidates.length === 0) {
      return { expired: 0, totalCandidates: 0 };
    }

    const expireNote =
      `Tự động hết hạn sau ${DEPOSIT_TTL_MS / 60_000} phút không chuyển khoản`;

    let expired = 0;

    for (const cand of candidates) {
      try {
        // Atomic transition pending -> rejected.
        // Nếu SePay webhook hoặc admin vừa approve/reject thì filter sẽ miss → skip.
        const updated = await DepositRequest.findOneAndUpdate(
          { _id: cand._id, status: 'pending' },
          {
            $set: {
              status: 'rejected',
              processedAt: new Date(),
              processedBy: null, // null = auto system
              adminNote: expireNote
            }
          },
          { new: true }
        );

        if (!updated) continue; // đã được xử lý bởi luồng khác

        expired++;

        console.log(
          `   ❌ Expired deposit #${updated._id.toString().slice(-8).toUpperCase()} - ` +
          `User: ${cand.userId?.username || 'N/A'}, ` +
          `Amount: ${cand.amount?.toLocaleString('vi-VN')}đ, ` +
          `Note: ${cand.transferNote}`
        );
      } catch (err) {
        console.error(`[depositCleanup] expire error for ${cand._id}:`, err.message);
      }
    }

    if (expired > 0) {
      console.log(
        `🧹 [depositCleanup] Expired ${expired} deposit(s) (cutoff: ${cutoff.toISOString()})`
      );
    }

    // Nếu đã xử lý hết batch nhưng vẫn còn pending cũ → log để admin biết
    if (candidates.length === BATCH_SIZE) {
      const remaining = await DepositRequest.countDocuments({
        status: 'pending',
        createdAt: { $lt: cutoff }
      });
      if (remaining > 0) {
        console.log(
          `⚠️ [depositCleanup] còn ${remaining} pending > ${DEPOSIT_TTL_MS / 60_000}m, sẽ xử lý ở tick tiếp theo`
        );
      }
    }

    return { expired, totalCandidates: candidates.length };
  } catch (err) {
    console.error('[depositCleanup] scan error:', err);
    return { expired: 0, totalCandidates: 0, error: err.message };
  } finally {
    isRunning = false;
  }
}

/**
 * Khởi động cleanup job. Idempotent — gọi nhiều lần chỉ chạy 1 interval.
 */
export function startDepositCleanup() {
  if (intervalId) {
    console.log('[depositCleanup] already running');
    return;
  }

  // Lần đầu chạy sau 10s (chờ MongoDB ổn định + tránh race với bootstrap)
  setTimeout(() => {
    expireOldPendingDeposits().catch((err) =>
      console.error('[depositCleanup] initial run error:', err)
    );
  }, 10_000);

  intervalId = setInterval(() => {
    expireOldPendingDeposits().catch((err) =>
      console.error('[depositCleanup] interval error:', err)
    );
  }, CLEANUP_INTERVAL_MS);

  console.log(
    `✅ depositCleanup job started (TTL=${DEPOSIT_TTL_MS / 60_000}m, interval=${CLEANUP_INTERVAL_MS / 1000}s)`
  );
}

/**
 * Dừng cleanup job. Dùng khi shutdown server / test.
 */
export function stopDepositCleanup() {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
  console.log('🛑 depositCleanup job stopped');
}

export function isDepositCleanupRunning() {
  return intervalId !== null;
}

// Export constants for testing / config
export const DEPOSIT_CLEANUP_CONFIG = {
  DEPOSIT_TTL_MS,
  CLEANUP_INTERVAL_MS,
  BATCH_SIZE
};
