import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../../utils/api';

const TTL = 30 * 60 * 1000; // 30 minutes

const initialLoading = { settings: false, socialLinks: false, sliders: false, notifications: false };
const initialFetched = { settings: 0, socialLinks: 0, sliders: 0, notifications: 0 };

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      settings: null,
      socialLinks: [],
      sliders: { leftSliders: [], rightBanner: null },
      notifications: [],
      loading: initialLoading,
      error: null,
      lastFetched: initialFetched,

      isStale: (key) => {
        const ts = get().lastFetched[key];
        return !ts || Date.now() - ts > TTL;
      },

      fetchSettings: async (force = false) => {
        const state = get();
        if (!force && state.settings && !state.isStale('settings')) {
          return state.settings;
        }
        set((s) => ({ loading: { ...s.loading, settings: true } }));
        try {
          const { data } = await api.get('/settings');
          set((s) => ({
            settings: data,
            lastFetched: { ...s.lastFetched, settings: Date.now() },
            loading: { ...s.loading, settings: false },
          }));
          return data;
        } catch (err) {
          set((s) => ({ loading: { ...s.loading, settings: false }, error: err }));
          throw err;
        }
      },

      fetchSocialLinks: async (force = false) => {
        const state = get();
        if (!force && Array.isArray(state.socialLinks) && state.socialLinks.length > 0 && !state.isStale('socialLinks')) {
          return state.socialLinks;
        }
        set((s) => ({ loading: { ...s.loading, socialLinks: true } }));
        try {
          const { data } = await api.get('/social-links');
          // Ép về array nếu API trả object
          let arr = data;
          if (!Array.isArray(arr)) {
            if (Array.isArray(arr?.socialLinks)) arr = arr.socialLinks;
            else if (Array.isArray(arr?.data)) arr = arr.data;
            else if (Array.isArray(arr?.items)) arr = arr.items;
            else arr = [];
          }
          set((s) => ({
            socialLinks: arr,
            lastFetched: { ...s.lastFetched, socialLinks: Date.now() },
            loading: { ...s.loading, socialLinks: false },
          }));
          return arr;
        } catch (err) {
          set((s) => ({ loading: { ...s.loading, socialLinks: false }, error: err }));
          throw err;
        }
      },

      fetchSliders: async (force = false) => {
        const state = get();
        if (!force && state.sliders.leftSliders?.length > 0 && !state.isStale('sliders')) {
          return state.sliders;
        }
        set((s) => ({ loading: { ...s.loading, sliders: true } }));
        try {
          const res = await api.get('/settings/sliders');
          set((s) => ({
            sliders: res.data || { leftSliders: [], rightBanner: null },
            lastFetched: { ...s.lastFetched, sliders: Date.now() },
            loading: { ...s.loading, sliders: false },
          }));
          return res.data;
        } catch (err) {
          set((s) => ({ loading: { ...s.loading, sliders: false }, error: err }));
          throw err;
        }
      },

      fetchNotifications: async (force = false) => {
        const state = get();
        if (!force && Array.isArray(state.notifications) && state.notifications.length > 0 && !state.isStale('notifications')) {
          return state.notifications;
        }
        set((s) => ({ loading: { ...s.loading, notifications: true } }));
        try {
          const res = await api.get('/settings/notifications');
          // Ép về array
          let arr = res.data;
          if (!Array.isArray(arr)) {
            if (Array.isArray(arr?.notifications)) arr = arr.notifications;
            else if (Array.isArray(arr?.data)) arr = arr.data;
            else if (Array.isArray(arr?.items)) arr = arr.items;
            else arr = [];
          }
          set((s) => ({
            notifications: arr,
            lastFetched: { ...s.lastFetched, notifications: Date.now() },
            loading: { ...s.loading, notifications: false },
          }));
          return arr;
        } catch (err) {
          set((s) => ({ loading: { ...s.loading, notifications: false }, error: err }));
          throw err;
        }
      },

      reset: () => set({
        settings: null,
        socialLinks: [],
        sliders: { leftSliders: [], rightBanner: null },
        notifications: [],
        loading: initialLoading,
        error: null,
        lastFetched: initialFetched,
      }),
    }),
    {
      name: 'settings-storage',
      version: 4,
      migrate: (persistedState, fromVersion) => {
        // Clear cached sliders on version migration to get new slot/type fields
        if (!persistedState) return persistedState;
        if (fromVersion < 4) {
          persistedState.sliders = { leftSliders: [], rightBanner: null };
          persistedState.lastFetched = { ...(persistedState.lastFetched || {}), sliders: 0 };
        }
        return persistedState;
      },
      partialize: (state) => ({
        settings: state.settings,
        socialLinks: state.socialLinks,
        sliders: state.sliders,
        notifications: state.notifications,
        lastFetched: state.lastFetched,
      }),
    }
  )
);
