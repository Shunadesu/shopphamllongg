import { create } from 'zustand';
import api from '../../utils/api';

const TTL = 60 * 1000; // 60 seconds

const paramsKey = (params) => {
  if (!params) return 'default';
  const entries = Object.entries(params)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
};

export const useAccountListStore = create((set, get) => ({
  // byFilter: { [key]: { data, accounts, pagination, ts } }
  byFilter: {},
  loading: {}, // { [key]: bool }
  loadingMore: {}, // { [key]: bool } — đang tải trang tiếp theo
  error: null,

  isStale: (key) => {
    const entry = get().byFilter[key];
    return !entry || Date.now() - entry.ts > TTL;
  },

  fetchAccounts: async (params = {}, force = false) => {
    const key = paramsKey(params);
    const state = get();
    const existing = state.byFilter[key];
    if (!force && existing && !state.isStale(key)) {
      return existing;
    }

    set((s) => ({ loading: { ...s.loading, [key]: true }, error: null }));
    try {
      const queryString = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) {
          queryString.append(k, v);
        }
      });
      const url = `/accounts${queryString.toString() ? `?${queryString.toString()}` : ''}`;
      const res = await api.get(url);
      const data = res.data || {};
      const payload = {
        data,
        accounts: data.accounts || [],
        pagination: data.pagination || null,
        ts: Date.now(),
      };
      set((s) => ({
        byFilter: { ...s.byFilter, [key]: payload },
        loading: { ...s.loading, [key]: false },
      }));
      return payload;
    } catch (err) {
      set((s) => ({ loading: { ...s.loading, [key]: false }, error: err }));
      throw err;
    }
  },

  // Tải trang tiếp theo và GHI THÊM vào danh sách hiện có.
  // Dùng cho nút "Xem thêm" ở trang Home: chỉ tải đúng phần user cần xem
  // thay vì kéo 1000 bản ghi về ngay từ đầu.
  //
  // `params` KHÔNG chứa `page` — trang tiếp theo được tính từ số bản ghi
  // đã có, và kết quả ghi thêm vào CÙNG key gốc để component đọc được
  // danh sách đầy đủ.
  fetchMore: async (params = {}) => {
    const { page: _ignoredPage, ...baseParams } = params;
    const key = paramsKey(baseParams);
    const state = get();
    const existing = state.byFilter[key];

    // Đã tải hết rồi → không gọi nữa.
    const total = existing?.pagination?.total;
    const currentCount = existing?.accounts?.length || 0;
    if (total !== null && total !== undefined && currentCount >= total) {
      return existing;
    }

    const limit = parseInt(baseParams.limit, 10) || 12;
    const nextPage = Math.floor(currentCount / limit) + 1;

    set((s) => ({ loadingMore: { ...s.loadingMore, [key]: true }, error: null }));
    try {
      const queryString = new URLSearchParams();
      Object.entries({ ...baseParams, page: nextPage }).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) {
          queryString.append(k, v);
        }
      });
      const url = `/accounts${queryString.toString() ? `?${queryString.toString()}` : ''}`;
      const res = await api.get(url);
      const data = res.data || {};
      const incoming = data.accounts || [];

      const merged = {
        data,
        accounts: [...(existing?.accounts || []), ...incoming],
        pagination: data.pagination || existing?.pagination || null,
        ts: existing?.ts || Date.now(),
      };

      set((s) => ({
        byFilter: { ...s.byFilter, [key]: merged },
        loadingMore: { ...s.loadingMore, [key]: false },
      }));
      return merged;
    } catch (err) {
      set((s) => ({ loadingMore: { ...s.loadingMore, [key]: false }, error: err }));
      throw err;
    }
  },

  invalidate: () => set({ byFilter: {}, loading: {}, loadingMore: {} }),

  reset: () => set({ byFilter: {}, loading: {}, loadingMore: {}, error: null }),
}));

export const accountListParamsKey = paramsKey;
