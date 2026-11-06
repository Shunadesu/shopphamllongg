import { create } from 'zustand';
import api from '../../utils/api';

const TTL = 60 * 1000; // 60 seconds

/**
 * Số đếm tài khoản theo danh mục.
 *
 * Trang Home chỉ tải 200 tài khoản đầu (có phân trang server-side) nên nếu
 * đếm client-side thì các danh mục có tài khoản nhưng nằm ngoài 200 bản ghi
 * đầu sẽ bị hiện sai là "Sắp có". Endpoint `/accounts/counts` trả số đếm
 * thật, tốn vài trăm byte.
 *
 * Shape (khớp với server/routes/accounts.js):
 *   counts    — { [effectiveCategoryId]: number }  (con nếu có, không thì cha)
 *   direct    — { [parentCategoryId]: number }     (account gắn trực tiếp, không có subcategoryId)
 *   subcounts — { [subCategoryId]: number }
 */
export const useAccountCountsStore = create((set, get) => ({
  counts: {},
  direct: {},
  subcounts: {},
  ts: 0,
  loading: false,

  isStale: () => Date.now() - get().ts > TTL,

  fetchCounts: async (force = false) => {
    const state = get();
    if (!force && state.ts > 0 && !state.isStale()) {
      return state;
    }
    if (state.loading) return state;

    set({ loading: true });
    try {
      const res = await api.get('/accounts/counts', {
        params: { status: 'available' },
      });
      const data = res.data || {};
      set({
        counts: data.counts || {},
        direct: data.direct || {},
        subcounts: data.subcounts || {},
        ts: Date.now(),
        loading: false,
      });
      return get();
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  reset: () => set({ counts: {}, direct: {}, subcounts: {}, ts: 0, loading: false }),
}));
