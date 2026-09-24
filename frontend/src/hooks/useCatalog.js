import { useEffect, useCallback, useRef } from 'react';
import { useCatalogStore } from '../store/data/catalogStore';

export function useCategories() {
  const data = useCatalogStore((s) => s.categories);
  const loading = useCatalogStore((s) => s.loading);

  // Track để tránh gọi fetch nhiều lần khi mount nhiều component cùng lúc
  const fetchingRef = useRef(false);

  const refresh = useCallback(() => {
    return useCatalogStore.getState().fetchCategories(true);
  }, []);

  // Initial fetch: nếu cache trống hoặc đã stale thì gọi API
  useEffect(() => {
    if (
      !data ||
      data.length === 0 ||
      useCatalogStore.getState().isStale()
    ) {
      if (!fetchingRef.current) {
        fetchingRef.current = true;
        useCatalogStore
          .getState()
          .fetchCategories()
          .catch(() => {})
          .finally(() => {
            fetchingRef.current = false;
          });
      }
    }
  }, [data]);

  // Refetch khi user quay lại tab/window focus
  // Giúp danh mục mới được admin tạo hiển thị ngay khi user quay lại
  useEffect(() => {
    const handleFocus = () => {
      // Chỉ refetch khi cache đã stale (>2 phút) để tránh gọi API thừa
      if (useCatalogStore.getState().isStale()) {
        if (!fetchingRef.current) {
          fetchingRef.current = true;
          useCatalogStore
            .getState()
            .fetchCategories(true)
            .catch(() => {})
            .finally(() => {
              fetchingRef.current = false;
            });
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      }
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return {
    data: data || [],
    loading,
    refresh,
  };
}

// Hook để lấy subcategories của một category
export function useSubcategories(parentId) {
  const categories = useCatalogStore((s) => s.categories);
  const loading = useCatalogStore((s) => s.loading);
  const fetchingRef = useRef(false);

  const refresh = useCallback(() => {
    return useCatalogStore.getState().fetchCategories(true);
  }, []);

  useEffect(() => {
    if (
      !categories ||
      categories.length === 0 ||
      useCatalogStore.getState().isStale()
    ) {
      if (!fetchingRef.current) {
        fetchingRef.current = true;
        useCatalogStore
          .getState()
          .fetchCategories()
          .catch(() => {})
          .finally(() => {
            fetchingRef.current = false;
          });
      }
    }
  }, [categories]);

  // Refetch on window focus (giống useCategories)
  useEffect(() => {
    const handleFocus = () => {
      if (useCatalogStore.getState().isStale()) {
        if (!fetchingRef.current) {
          fetchingRef.current = true;
          useCatalogStore
            .getState()
            .fetchCategories(true)
            .catch(() => {})
            .finally(() => {
              fetchingRef.current = false;
            });
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      }
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Lấy subcategories từ category gốc
  const subcategories =
    categories.find((c) => c._id === parentId)?.subcategories || [];

  return {
    data: subcategories,
    loading,
    refresh,
  };
}

// Kiểm tra category có subcategories không
export function useHasSubcategories(categoryId) {
  const hasSubcategories = useCatalogStore((s) => s.hasSubcategories);
  return hasSubcategories(categoryId);
}
