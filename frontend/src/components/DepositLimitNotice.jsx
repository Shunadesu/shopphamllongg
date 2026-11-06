import { useEffect } from 'react';
import { FiAlertTriangle, FiClock } from 'react-icons/fi';
import { useDepositStore } from '../store/data/depositStore';

/**
 * Hiển thị số lệnh nạp `pending` hiện tại của user so với giới hạn.
 *
 * Backend áp 2 lớp giới hạn (mỗi IP tối đa 3 lệnh pending, mỗi user tối đa 3).
 * Component này cho user biết trước khi họ bị chặn, và cũng cảnh báo khi
 * đã chạm ngưỡng.
 *
 * @param {object} props
 * @param {boolean} [props.showIpHint] - Hiển thị thêm số lệnh pending trên IP của user.
 */
export default function DepositLimitNotice({ showIpHint = false }) {
  const depositLimit = useDepositStore((s) => s.depositLimit);
  const fetchDepositLimit = useDepositStore((s) => s.fetchDepositLimit);

  // Bộ đếm cần tươi → poll mỗi 20s (TTL phía store là 15s nên mỗi nhịp đều
  // lấy dữ liệu mới, không bị dính cache).
  useEffect(() => {
    fetchDepositLimit(true).catch(() => {});
    const timer = setInterval(() => {
      fetchDepositLimit().catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, [fetchDepositLimit]);

  if (!depositLimit) return null;

  const { pendingCount = 0, maxPending = 3, ipPendingCount = 0, maxPendingPerIp = 3 } = depositLimit;
  const isFull = pendingCount >= maxPending;
  const isIpFull = ipPendingCount >= maxPendingPerIp;

  // Không có gì đáng cảnh báo và user không có lệnh nào → im lặng.
  if (!isFull && !isIpFull && pendingCount === 0 && ipPendingCount === 0) return null;

  return (
    <div
      className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm border ${
        isFull || isIpFull
          ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
          : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300'
      }`}
    >
      {isFull || isIpFull ? (
        <FiAlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      ) : (
        <FiClock className="w-4 h-4 mt-0.5 shrink-0" />
      )}
      <div className="leading-relaxed">
        {isFull ? (
          <p>
            Bạn đang có <strong>{pendingCount}/{maxPending}</strong> lệnh nạp chờ duyệt — đã đạt giới hạn.
            Vui lòng đợi admin xử lý hoặc thử lại sau.
          </p>
        ) : isIpFull ? (
          <p>
            Địa chỉ IP của bạn đang có <strong>{ipPendingCount}/{maxPendingPerIp}</strong> lệnh nạp chờ duyệt.
            Vui lòng đợi admin xử lý hoặc thử lại sau.
          </p>
        ) : (
          <p>
            Bạn đang có <strong>{pendingCount}/{maxPending}</strong> lệnh nạp chờ duyệt.
          </p>
        )}
        {showIpHint && !isIpFull && ipPendingCount > 0 && (
          <p className="mt-0.5 opacity-80">
            Trên IP này: {ipPendingCount}/{maxPendingPerIp} lệnh nạp đang chờ.
          </p>
        )}      </div>
    </div>
  );
}
