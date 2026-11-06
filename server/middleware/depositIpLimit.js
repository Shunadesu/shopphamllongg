import DepositRequest from '../models/DepositRequest.js';
import { getClientIp } from '../utils/clientIp.js';

/**
 * Chống spam / DDoS khi tạo lệnh nạp.
 *
 * Hai lớp giới hạn độc lập:
 * 1. Theo IP   — tổng số lệnh nạp `pending` của TẤT CẢ user dùng chung IP đó.
 *                Chặn kẻ spam tạo hàng loạt lệnh nạp từ 1 địa chỉ (vd: bot/script).
 * 2. Theo user — số lệnh nạp `pending` của chính user đó.
 *                Chặn user đổi IP xoay vòng để vượt giới hạn IP.
 *
 * Vì lệnh nạp `pending` tự hết hạn sau 20 phút (job `depositCleanup`), giới hạn
 * tự giải phóng theo thời gian — không cần bộ đếm riêng.
 *
 * Ngưỡng hardcode theo yêu cầu (không cấu hình được trong admin).
 * Muốn nới/thu hẹp → sửa 2 hằng dưới đây.
 */

/** Tối đa lệnh nạp `pending` cho cùng một IP (tổng cộng mọi user). */
export const MAX_PENDING_PER_IP = 3;

/** Tối đa lệnh nạp `pending` cho cùng một user. */
export const MAX_PENDING_PER_USER = 3;

/**
 * Mutex in-process theo IP.
 *
 * Server chạy 1 tiến trình Node nên khóa ở memory là đủ để tránh race:
 * 2 request cùng IP đến đồng thời sẽ không cùng lúc đọc count và cùng vượt ngưỡng.
 * (Nếu sau này scale nhiều instance, cần chuyển sang bộ đếm atomic trên DB.)
 *
 * @type {Map<string, Promise<void>>}
 */
const ipLocks = new Map();

/**
 * Chạy `fn` với khóa theo `key` — các lần gọi cùng `key` chạy tuần tự.
 *
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withLock(key, fn) {
  // Chờ lượt trước đó (nếu có) hoàn tất.
  const previous = ipLocks.get(key) || Promise.resolve();

  let release;
  const current = new Promise((resolve) => { release = resolve; });
  ipLocks.set(key, current);

  try {
    await previous;
    return await fn();
  } finally {
    release();
    // Xoá bản ghi nếu không còn hàng đợi nào chờ sau nó.
    if (ipLocks.get(key) === current) ipLocks.delete(key);
  }
}

/**
 * Middleware: chặn tạo lệnh nạp khi vượt giới hạn pending.
 *
 * Gắn SAU `auth` vì cần `req.user._id` cho lớp giới hạn theo user.
 * Gắn middleware này vào req/res/next.
 */
export const depositIpLimit = async (req, res, next) => {
  // Chống gọi next() 2 lần: nếu lỗi xảy ra SAU khi next() đã chạy (vd handler
  // throw), nhánh catch không được gọi lại next().
  let nextCalled = false;
  const callNext = () => {
    if (nextCalled) return;
    nextCalled = true;
    next();
  };

  try {
    const ip = getClientIp(req);
    req.depositIp = ip;

    const userId = req.user?._id;

    // Không xác định được IP (proxy cấu hình sai) → bỏ qua lớp giới hạn theo IP
    // để không gom nhầm nhiều user khác nhau vào 1 nhóm và chặn oan.
    // Lớp giới hạn theo user vẫn áp dụng.
    const skipIpCheck = !ip || ip === 'unknown';

    await withLock(ip || 'unknown', async () => {
      // === Lớp 1: giới hạn theo IP ===
      if (!skipIpCheck) {
        const ipPending = await DepositRequest.countDocuments({
          ipAddress: ip,
          status: 'pending',
        });

        if (ipPending >= MAX_PENDING_PER_IP) {
          console.warn(
            `[Deposits] ⛔ Chặn tạo lệnh nạp — IP ${ip} đã có ${ipPending}/${MAX_PENDING_PER_IP} ` +
            `lệnh nạp pending (user=${req.user?.username || 'N/A'})`
          );
          res.status(429).json({
            message:
              `Địa chỉ IP này đang có ${ipPending} lệnh nạp chờ duyệt (tối đa ${MAX_PENDING_PER_IP}). ` +
              `Vui lòng đợi admin xử lý hoặc thử lại sau.`,
            code: 'DEPOSIT_IP_LIMIT',
            pendingCount: ipPending,
            maxPending: MAX_PENDING_PER_IP,
          });
          return;
        }
      }

      // === Lớp 2: giới hạn theo user ===
      if (userId) {
        const userPending = await DepositRequest.countDocuments({
          userId,
          status: 'pending',
        });

        if (userPending >= MAX_PENDING_PER_USER) {
          console.warn(
            `[Deposits] ⛔ Chặn tạo lệnh nạp — user ${req.user?.username || userId} đã có ` +
            `${userPending}/${MAX_PENDING_PER_USER} lệnh nạp pending (ip=${ip})`
          );
          res.status(429).json({
            message:
              `Bạn đang có ${userPending} lệnh nạp chờ duyệt (tối đa ${MAX_PENDING_PER_USER}). ` +
              `Vui lòng đợi admin xử lý hoặc thử lại sau.`,
            code: 'DEPOSIT_USER_LIMIT',
            pendingCount: userPending,
            maxPending: MAX_PENDING_PER_USER,
          });
          return;
        }
      }

      // Giữ khóa tới khi response kết thúc để lệnh nạp vừa tạo đã được tính vào
      // count của request kế tiếp — nếu không, 2 request song song cùng IP có thể
      // cùng đọc count cũ và cùng vượt ngưỡng.
      // Timeout 30s để trường hợp response treo không giữ khóa vô hạn.
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        res.once('finish', done);
        res.once('close', done);
        const timer = setTimeout(done, 30000);
        if (typeof timer.unref === 'function') timer.unref();
        callNext();
      });
    });
  } catch (error) {
    console.error('[depositIpLimit] error:', error.message);
    // Lỗi hệ thống khi đếm → cho qua để không chặn nhầm người dùng.
    callNext();
  }
};
