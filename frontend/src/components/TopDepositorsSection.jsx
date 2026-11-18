import { FiTrendingUp } from 'react-icons/fi';
import { useTopDepositors } from '../hooks/useDeposits';
import Skeleton from './SkeletonLoader';

/**
 * Bảng xếp hạng "Top tài khoản nạp trong tháng" — hiển thị trên trang Home.
 *
 * Dùng chung cache với thanh "Top nạp tháng" dưới cùng (BottomStatusBar)
 * nên không phát sinh thêm request — cả hai cùng đọc từ `useDepositStore`.
 *
 * Dữ liệu lấy từ API `GET /deposits/top-depositors` (public):
 *   - Chỉ tính deposit đã được duyệt (`status: 'approved'`).
 *   - Mốc tháng theo giờ Việt Nam.
 *   - Tổng tiền = số tiền thực cộng vào số dư (`receivedAmount` fallback `amount`).
 *
 * Bố cục gọn: dùng lưới nhiều cột + mỗi ô một dòng duy nhất, không dùng
 * banner tiêu đề lớn để tiết kiệm chiều cao.
 */
const TopDepositorsSection = () => {
  const { data: topDepositors, monthLabel, loading } = useTopDepositors({ limit: 20 });

  const list = Array.isArray(topDepositors) ? topDepositors : [];

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN').format(Number(amount) || 0) + 'đ';

  // Chữ cái đầu của tên, dùng làm avatar fallback (model User không có field avatar).
  const getInitial = (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return '?';
    return trimmed.charAt(0).toLocaleUpperCase('vi-VN');
  };

  // Màu huy hiệu theo thứ hạng.
  const rankBadgeClass = (rank) => {
    if (rank === 1) return 'bg-yellow-500 text-white';
    if (rank === 2) return 'bg-slate-400 text-white';
    if (rank === 3) return 'bg-amber-700 text-white';
    return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  };

  const title = monthLabel
    ? `Top tài khoản nạp tháng ${monthLabel}`
    : 'Top tài khoản nạp trong tháng';

  return (
    <section className="py-2">
      <div className="container-custom">
        <div className="card p-2 md:p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <FiTrendingUp className="w-3.5 h-3.5 text-primary" />
              {title}
            </h3>
            {list.length > 0 && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {list.length} tài khoản
              </span>
            )}
          </div>

          {/* Loading */}
          {loading && list.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-50 dark:bg-dark-light"
                >
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-14 ml-auto" />
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            /* Empty state */
            <div className="text-center py-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chưa có tài khoản nào nạp trong tháng này.
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Bảng xếp hạng sẽ cập nhật ngay khi có giao dịch nạp đầu tiên.
              </p>
            </div>
          ) : (
            /* Danh sách xếp hạng — mỗi ô một dòng */
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1">
              {list.map((depositor, index) => (
                <li
                  key={depositor._id || `dep-${index}`}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 dark:bg-dark-light hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                >
                  {/* Thứ hạng */}
                  <span
                    className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${rankBadgeClass(index + 1)}`}
                  >
                    {index + 1}
                  </span>

                  {/* Avatar (chữ cái đầu) */}
                  <span className="w-6 h-6 shrink-0 rounded-full bg-primary text-white flex items-center justify-center text-[11px] font-bold">
                    {getInitial(depositor.fullName)}
                  </span>

                  {/* Tên + số lượt nạp */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-white truncate leading-tight">
                      {depositor.fullName || 'Người dùng'}
                    </p>
                  </div>

                  {/* Số lượt nạp + tổng tiền */}
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 hidden sm:inline">
                    {depositor.count || 1} lượt
                  </span>
                  <span className="text-xs font-bold text-primary shrink-0">
                    {formatCurrency(depositor.totalAmount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export default TopDepositorsSection;
