import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../../utils/api';

const BANK_TTL = 30 * 60 * 1000; // 30 minutes
const REQUESTS_TTL = 30 * 1000; // 30 seconds
const TOP_TTL = 10 * 60 * 1000; // 10 minutes
const LIMIT_TTL = 15 * 1000; // 15 seconds — bộ đếm lệnh nạp pending cần tươi
// Số bản ghi tối thiểu luôn được tải về — dùng chung cache cho thanh "Top nạp tháng"
// dưới cùng và mục bảng xếp hạng trên trang Home (một request duy nhất).
const DEFAULT_TOP_LIMIT = 20;

export const useDepositStore = create(
  persist(
    (set, get) => ({
      bankAccounts: [],
      lastFetchedBanks: 0,
      banksLoading: false,

      myRequests: [],
      lastFetchedRequests: 0,
      requestsLoading: false,

      topDepositors: [],
      topDepositorsMonth: '',
      lastFetchedTop: 0,
      topLoading: false,
      // Số lượng bản ghi đã yêu cầu từ server — dùng để quyết định có cần
      // fetch lại với limit lớn hơn hay không.
      topDepositorsLimit: 0,
      // Promise của request đang chạy + limit tương ứng (chống gọi trùng).
      topFetchPromise: null,
      topFetchLimit: 0,

      // Giới hạn lệnh nạp pending: { pendingCount, maxPending, ipPendingCount, maxPendingPerIp, ipMasked }
      depositLimit: null,
      lastFetchedLimit: 0,

      error: null,

      fetchBankAccounts: async (force = false) => {
        const state = get();
        if (!force && state.bankAccounts.length > 0 && Date.now() - state.lastFetchedBanks < BANK_TTL) {
          return state.bankAccounts;
        }
        set({ banksLoading: true, error: null });
        try {
          const res = await api.get('/deposits/bank-accounts');
          const data = res.data || [];
          set({ bankAccounts: data, lastFetchedBanks: Date.now(), banksLoading: false });
          return data;
        } catch (err) {
          set({ banksLoading: false, error: err });
          throw err;
        }
      },

      fetchMyRequests: async (force = false) => {
        const state = get();
        if (!force && state.myRequests.length > 0 && Date.now() - state.lastFetchedRequests < REQUESTS_TTL) {
          return state.myRequests;
        }
        set({ requestsLoading: true, error: null });
        try {
          const res = await api.get('/deposits/my-requests');
          const data = res.data || [];
          set({ myRequests: data, lastFetchedRequests: Date.now(), requestsLoading: false });
          return data;
        } catch (err) {
          set({ requestsLoading: false, error: err });
          throw err;
        }
      },

      // Lấy số lệnh nạp pending hiện tại + giới hạn (chống spam theo IP / theo user).
      fetchDepositLimit: async (force = false) => {
        const state = get();
        if (!force && state.depositLimit && Date.now() - state.lastFetchedLimit < LIMIT_TTL) {
          return state.depositLimit;
        }
        try {
          const res = await api.get('/deposits/my-limit');
          const data = res.data || null;
          set({ depositLimit: data, lastFetchedLimit: Date.now() });
          return data;
        } catch (err) {
          // Không chặn luồng UI vì lỗi fetch giới hạn — bỏ qua âm thầm.
          return state.depositLimit;
        }
      },

      // Lấy bảng xếp hạng người nạp trong tháng.
      // `limit` = số bản ghi tối đa cần. Cache luôn giữ tối thiểu
      // DEFAULT_TOP_LIMIT bản ghi để mọi nơi dùng chung một request duy nhất
      // (thanh dưới cùng + mục trên trang Home).
      //
      // `topFetchPromise` giữ request đang chạy để tránh gọi trùng khi
      // BottomStatusBar và TopDepositorsSection mount cùng lúc.
      fetchTopDepositors: async (force = false, limit = DEFAULT_TOP_LIMIT) => {
        const state = get();
        const wantLimit = Math.max(limit, DEFAULT_TOP_LIMIT);

        if (
          !force &&
          state.lastFetchedTop > 0 &&
          state.topDepositorsLimit >= wantLimit &&
          Date.now() - state.lastFetchedTop < TOP_TTL
        ) {
          return state.topDepositors;
        }

        // Đang có request cho cùng limit → dùng lại, không gọi thêm.
        if (!force && state.topFetchPromise && state.topFetchLimit === wantLimit) {
          return state.topFetchPromise;
        }

        set({ topLoading: true, error: null, topFetchLimit: wantLimit });

        const promise = api
          .get('/deposits/top-depositors', { params: { limit: wantLimit } })
          .then((res) => {
            // Response mới: { monthLabel, depositors: [...] }
            // Fallback về array thuần để tương thích nếu server chưa được deploy lại.
            const raw = res.data;
            let data = raw;
            if (!Array.isArray(data)) {
              if (Array.isArray(data?.depositors)) data = data.depositors;
              else if (Array.isArray(data?.data)) data = data.data;
              else if (Array.isArray(data?.items)) data = data.items;
              else data = [];
            }

            const monthLabel = typeof raw?.monthLabel === 'string' ? raw.monthLabel : '';

            set({
              topDepositors: data,
              topDepositorsMonth: monthLabel,
              topDepositorsLimit: wantLimit,
              lastFetchedTop: Date.now(),
              topLoading: false,
            });
            // Chỉ xóa promise nếu nó vẫn là promise của request này — tránh
            // xóa nhầm khi có một request mới (force refresh) đang chạy.
            set((s) =>
              s.topFetchPromise === promise ? { topFetchPromise: null } : {}
            );
            return data;
          })
          .catch((err) => {
            set({ topLoading: false, error: err });
            set((s) =>
              s.topFetchPromise === promise ? { topFetchPromise: null } : {}
            );
            throw err;
          });

        set({ topFetchPromise: promise });
        return promise;
      },

      addMyRequest: (req) => {
        set((s) => ({ myRequests: [req, ...s.myRequests] }));
      },

      // Hủy yêu cầu nạp đang chờ duyệt (user là chủ sở hữu)
      cancelMyRequest: async (id) => {
        try {
          const res = await api.delete(`/deposits/${id}`);
          const updated = res.data?.deposit;
          if (updated) {
            set((s) => ({
              myRequests: s.myRequests.map((r) => (r._id === id ? updated : r)),
            }));
          } else {
            // fallback: refetch toàn bộ
            await get().fetchMyRequests(true);
          }
          return res.data;
        } catch (err) {
          set({ error: err });
          throw err;
        }
      },

      // Check trạng thái 1 đơn nạp (polling cho UI QR + countdown)
      checkOneRequest: async (id) => {
        try {
          const res = await api.get(`/deposits/${id}`);
          const updated = res.data;
          if (updated && updated._id) {
            set((s) => ({
              myRequests: s.myRequests.map((r) => (r._id === id ? { ...r, ...updated } : r)),
            }));
          }
          return updated;
        } catch (err) {
          set({ error: err });
          throw err;
        }
      },

      // Tạo yêu cầu nạp bằng thẻ cào
      createCardDeposit: async ({ amount, cardType, cardSerial, cardCode }) => {
        try {
          const res = await api.post('/deposits/card-request', {
            amount,
            cardType,
            cardSerial,
            cardCode,
          });
          const newDeposit = res.data?.deposit;
          if (newDeposit) {
            set((s) => ({ myRequests: [newDeposit, ...s.myRequests] }));
          }
          return res.data;
        } catch (err) {
          set({ error: err });
          throw err;
        }
      },

      reset: () => set({
        bankAccounts: [],
        lastFetchedBanks: 0,
        banksLoading: false,
        myRequests: [],
        lastFetchedRequests: 0,
        requestsLoading: false,
        topDepositors: [],
        topDepositorsMonth: '',
        topDepositorsLimit: 0,
        topFetchPromise: null,
        topFetchLimit: 0,
        lastFetchedTop: 0,
        topLoading: false,
        depositLimit: null,
        lastFetchedLimit: 0,
        error: null,
      }),
    }),
    {
      name: 'deposit-storage',
      // KHÔNG persist `topDepositors` / `topDepositorsMonth`:
      // dữ liệu bảng xếp hạng phụ thuộc tháng hiện tại. Cache trong
      // localStorage sẽ cũ sang tháng mới và hiển thị sai người nạp.
      // TTL 10 phút trong RAM vẫn giữ, không tăng tải server.
      //
      // `version: 2` + `migrate` dọn dữ liệu `topDepositors` còn sót lại
      // trong localStorage của người dùng từ trước khi deploy bản này.
      version: 2,
      migrate: (persistedState, fromVersion) => {
        if (!persistedState) return persistedState;
        if (fromVersion < 2) {
          delete persistedState.topDepositors;
          delete persistedState.lastFetchedTop;
        }
        return persistedState;
      },
      partialize: (state) => ({
        bankAccounts: state.bankAccounts,
        lastFetchedBanks: state.lastFetchedBanks,
      }),
    }
  )
);
