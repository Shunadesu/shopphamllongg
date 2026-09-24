import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../../utils/api';

// TTL giảm từ 15 phút xuống 2 phút để danh mục admin thay đổi nhanh chóng được phản ánh ở frontend.
// Kết hợp với refetchOnWindowFocus trong useCatalog.js để đảm bảo UX tốt nhất.
const TTL = 2 * 60 * 1000; // 2 minutes

export const useCatalogStore = create(
  persist(
    (set, get) => ({
      categories: [], // Mỗi category đã có subcategories bên trong
      loading: false,
      error: null,
      lastFetched: 0,

      isStale: () => {
        const ts = get().lastFetched;
        return !ts || Date.now() - ts > TTL;
      },

      // Đánh dấu cache là stale để lần đọc sau tự refetch
      // (dùng khi admin thay đổi danh mục hoặc component muốn ép refetch)
      markStale: () => set({ lastFetched: 0 }),

      fetchCategories: async (force = false) => {
        const state = get();
        if (!force && state.categories.length > 0 && !state.isStale()) {
          return state.categories;
        }
        set({ loading: true, error: null });
        try {
          const res = await api.get('/categories');
          const data = res.data || [];
          set({
            categories: data,
            lastFetched: Date.now(),
            loading: false,
          });
          return data;
        } catch (err) {
          set({ loading: false, error: err });
          throw err;
        }
      },

      // Lấy subcategories của một category
      getSubcategories: (parentId) => {
        const state = get();
        const parent = state.categories.find(c => c._id === parentId);
        return parent?.subcategories || [];
      },

      // Kiểm tra category có subcategories không
      hasSubcategories: (categoryId) => {
        const state = get();
        const category = state.categories.find(c => c._id === categoryId);
        return category && category.subcategories && category.subcategories.length > 0;
      },

      reset: () => set({ categories: [], loading: false, error: null, lastFetched: 0 }),
    }),
    {
      name: 'catalog-storage',
      partialize: (state) => ({
        categories: state.categories,
        lastFetched: state.lastFetched,
      }),
    }
  )
);
