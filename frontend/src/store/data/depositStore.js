import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../../utils/api';

const BANK_TTL = 30 * 60 * 1000; // 30 minutes
const REQUESTS_TTL = 30 * 1000; // 30 seconds
const TOP_TTL = 10 * 60 * 1000; // 10 minutes
const LIMIT_TTL = 15 * 1000; // 15 seconds — bộ đếm lệnh nạp pending cần tươi

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
      lastFetchedTop: 0,
      topLoading: false,

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

      fetchTopDepositors: async (force = false) => {
        const state = get();
        if (!force && Array.isArray(state.topDepositors) && state.topDepositors.length > 0 && Date.now() - state.lastFetchedTop < TOP_TTL) {
          return state.topDepositors;
        }
        set({ topLoading: true, error: null });
        try {
          const res = await api.get('/deposits/top-depositors');
          // Đảm bảo luôn là array; nếu API trả object thì lấy mảng đầu tiên tìm được
          let data = res.data;
          if (!Array.isArray(data)) {
            if (Array.isArray(data?.depositors)) data = data.depositors;
            else if (Array.isArray(data?.data)) data = data.data;
            else if (Array.isArray(data?.items)) data = data.items;
            else data = [];
          }
          set({ topDepositors: data, lastFetchedTop: Date.now(), topLoading: false });
          return data;
        } catch (err) {
          set({ topLoading: false, error: err });
          throw err;
        }
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
        lastFetchedTop: 0,
        topLoading: false,
        depositLimit: null,
        lastFetchedLimit: 0,
        error: null,
      }),
    }),
    {
      name: 'deposit-storage',
      partialize: (state) => ({
        bankAccounts: state.bankAccounts,
        lastFetchedBanks: state.lastFetchedBanks,
        topDepositors: state.topDepositors,
        lastFetchedTop: state.lastFetchedTop,
      }),
    }
  )
);
