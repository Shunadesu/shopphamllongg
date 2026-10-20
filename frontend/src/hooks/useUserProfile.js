import { useEffect } from 'react';
import { useUserStore } from '../store/data/userStore';

const TTL = 60 * 1000;
const TOKEN_KEY = 'token';

export function useUserProfile({ enabled = true } = {}) {
  const data = useUserStore((s) => s.profile);
  const loading = useUserStore((s) => s.loading);
  const lastFetched = useUserStore((s) => s.lastFetched);

  useEffect(() => {
    if (!enabled) return;
    // Không gọi /auth/me khi chưa có token → tránh 401 toast spam cho guest user
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    if (!data || Date.now() - lastFetched > TTL) {
      useUserStore.getState().fetchProfile().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    data,
    loading,
    refresh: () => useUserStore.getState().fetchProfile(true),
    setProfile: useUserStore.getState().setProfile,
  };
}
