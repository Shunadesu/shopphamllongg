import { useEffect } from 'react';
import { useCatalogStore } from '../store/data/catalogStore';

export function useCategories() {
  const data = useCatalogStore((s) => s.categories);
  const loading = useCatalogStore((s) => s.loading);

  // Cache chỉ trong memory (không persist) nên:
  // - Reload page → store rỗng → tự fetch lại API
  // - Điều hướng route trong cùng session → dùng cache trong 1 phút (TTL)
  // - Sau 1 phút trong cùng session → refetch nếu component mount
  useEffect(() => {
    if (!data || data.length === 0 || useCatalogStore.getState().isStale()) {
      useCatalogStore.getState().fetchCategories().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data: data || [],
    loading,
  };
}

// Hook để lấy subcategories của một category
export function useSubcategories(parentId) {
  const categories = useCatalogStore((s) => s.categories);
  const fetchCategories = useCatalogStore((s) => s.fetchCategories);
  const loading = useCatalogStore((s) => s.loading);

  useEffect(() => {
    if (!categories || categories.length === 0 || useCatalogStore.getState().isStale()) {
      fetchCategories().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lấy subcategories từ category gốc
  const subcategories = categories.find(c => c._id === parentId)?.subcategories || [];

  return {
    data: subcategories,
    loading,
  };
}

// Kiểm tra category có subcategories không
export function useHasSubcategories(categoryId) {
  const hasSubcategories = useCatalogStore((s) => s.hasSubcategories);
  return hasSubcategories(categoryId);
}
