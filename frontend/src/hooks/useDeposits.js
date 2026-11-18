import { useEffect } from 'react';
import { useDepositStore } from '../store/data/depositStore';

const REQUESTS_TTL = 30 * 1000;
// Chu kỳ làm mới bảng xếp hạng "Top nạp tháng" (khớp với TOP_TTL ở store).
const TOP_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function useBankAccounts(options = {}) {
  const { enabled = true } = options;
  const data = useDepositStore((s) => s.bankAccounts);
  const loading = useDepositStore((s) => s.banksLoading);
  const lastFetched = useDepositStore((s) => s.lastFetchedBanks);

  useEffect(() => {
    if (!enabled) return;
    if (!Array.isArray(data) || data.length === 0 || Date.now() - lastFetched > 30 * 60 * 1000) {
      useDepositStore.getState().fetchBankAccounts().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    data: Array.isArray(data) ? data : [],
    loading,
    refresh: () => useDepositStore.getState().fetchBankAccounts(true),
  };
}

export function useMyDepositRequests(options = {}) {
  const { enabled = true } = options;
  const data = useDepositStore((s) => s.myRequests);
  const loading = useDepositStore((s) => s.requestsLoading);
  const lastFetched = useDepositStore((s) => s.lastFetchedRequests);

  useEffect(() => {
    if (!enabled) return;
    if (!Array.isArray(data) || Date.now() - lastFetched > REQUESTS_TTL) {
      useDepositStore.getState().fetchMyRequests().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    data: Array.isArray(data) ? data : [],
    loading,
    refresh: () => useDepositStore.getState().fetchMyRequests(true),
  };
}

export function useTopDepositors(options = {}) {
  const { limit = 20 } = options;
  const data = useDepositStore((s) => s.topDepositors);
  const monthLabel = useDepositStore((s) => s.topDepositorsMonth);
  const loading = useDepositStore((s) => s.topLoading);

  useEffect(() => {
    const fetchNow = () =>
      useDepositStore.getState().fetchTopDepositors(false, limit).catch(() => {});

    // Dựa trên thời điểm fetch chứ không theo độ dài mảng — nếu tháng chưa có
    // ai nạp, API trả mảng rỗng và hook sẽ gọi lại liên tục nếu check length.
    const last = useDepositStore.getState().lastFetchedTop;
    if (!last || Date.now() - last > TOP_REFRESH_INTERVAL_MS) {
      fetchNow();
    }

    // Làm mới định kỳ để bảng xếp hạng cập nhật khi có người nạp mới.
    const interval = setInterval(fetchNow, TOP_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  return {
    data: Array.isArray(data) ? data : [],
    monthLabel,
    loading,
    refresh: () => useDepositStore.getState().fetchTopDepositors(true, limit),
  };
}
