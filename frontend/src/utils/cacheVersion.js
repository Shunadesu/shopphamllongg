import api from './api';
import { useSettingsStore } from '../store/data/settingsStore';
import { useDepositStore } from '../store/data/depositStore';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';

// ── Frontend cache version ───────────────────────────────────────────────
//
// Vấn đề: các store zustand dùng `persist` lưu vào localStorage. Sau mỗi
// lần deploy, người dùng vẫn thấy dữ liệu/link cũ (banner, social link,
// thông báo) vì zustand rehydrate state cũ, phải đợi TTL 30 phút mới tự lành.
//
// Cách sửa: server lưu một "version" cache. Admin bấm nút refresh → version
// tăng. Mọi client poll thấy version lệch → xóa các store persist cũ →
// hard-reload kèm `?cv=<version>` để bust cache index.html/bundle.
//
// Chi tiết:
// - Lần chạy đầu tiên (chưa có version trong localStorage): nếu không có
//   store persist nào thì chỉ ghi version, không reload (tránh reload thừa
//   cho user mới). Nếu có store persist cũ → coi như lệch → xóa + reload.
// - Lỗi mạng: bỏ qua, thử lại ở lần poll sau. Không xóa nhầm dữ liệu.

const VERSION_KEY = 'frontend-cache-version';

// Các key localStorage của zustand persist chứa dữ liệu cần làm mới.
// `catalog-storage` đã bỏ persist ở catalogStore nhưng vẫn còn sót từ bản
// cũ trên máy user nên xóa luôn cho gọn.
const STALE_KEYS = [
  'settings-storage',
  'deposit-storage',
  'catalog-storage',
  'cart-storage',
  'auth-storage',
];

// Token lưu song song với `auth-storage` (xem utils/api.js) → xóa để
// buộc đăng nhập lại thật sự (không chỉ reset state trong RAM).
const TOKEN_KEY = 'token';

// Giữ lại (không phải dữ liệu link cũ):
// - theme-storage: lựa chọn giao diện của user
// - guest_cart   : giỏ hàng khách
// - guestId      : định danh khách để giỏ hàng server khớp
// - app-storage-cleaned-v2: cờ dọn cache một lần của phiên bản cũ

const getStoredVersion = () => {
  try {
    return localStorage.getItem(VERSION_KEY);
  } catch {
    return null;
  }
};

const setStoredVersion = (version) => {
  try {
    localStorage.setItem(VERSION_KEY, version);
  } catch {
    /* localStorage bị chặn (private mode) — bỏ qua */
  }
};

const hasStaleStores = () => {
  try {
    return STALE_KEYS.some((key) => localStorage.getItem(key) !== null);
  } catch {
    return false;
  }
};

// Reset state trong RAM trước.
//
// Bắt buộc phải làm trước khi xóa key: middleware `persist` của zustand ghi
// lại toàn bộ state vào localStorage mỗi khi có `set()`. Nếu chỉ xóa key mà
// state trong RAM còn dữ liệu cũ, một `set()` bất kỳ (ví dụ fetch về) sẽ ghi
// lại dữ liệu cũ → xóa không có tác dụng.
const resetInMemoryStores = () => {
  try {
    useSettingsStore.getState().reset();
  } catch (_) {}
  try {
    useDepositStore.getState().reset();
  } catch (_) {}
  try {
    // logout() cũng reset cart store và xóa localStorage.token
    useAuthStore.getState().logout();
  } catch (_) {}
  try {
    useCartStore.getState().reset();
  } catch (_) {}
};

// Xóa toàn bộ store persist cũ + token (buộc đăng nhập lại)
export const clearStaleStores = () => {
  resetInMemoryStores();

  try {
    STALE_KEYS.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

// Hard reload kèm cache-bust để chắc chắn lấy index.html + bundle mới
const hardReload = (version) => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('cv', version);
    // replace thay vì assign: không tạo thêm entry trong history
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
};

// Xóa tham số `?cv=` khỏi URL sau khi reload (giữ URL sạch cho user)
export const stripCacheBustParam = () => {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('cv')) return;
    url.searchParams.delete('cv');
    const next = url.pathname + url.search + url.hash;
    window.history.replaceState(null, '', next);
  } catch {
    /* ignore */
  }
};

/**
 * Đồng bộ version cache với server.
 * @returns {Promise<{changed: boolean, version: string}>}
 *   changed = true nghĩa là đã xóa cache cũ và đang reload.
 */
export const syncCacheVersion = async () => {
  let version = '';
  try {
    const res = await api.get('/settings/frontend-cache/version', {
      headers: { 'Cache-Control': 'no-cache' },
    });
    version = res.data?.version || '';
  } catch (err) {
    // Offline / server lỗi → thử lại ở lần poll sau, không đụng dữ liệu user
    return { changed: false, version: '' };
  }

  const stored = getStoredVersion();

  // Lần đầu tiên user vào site
  if (stored === null) {
    if (hasStaleStores()) {
      // Có dữ liệu persist từ trước khi có cơ chế version → coi như cũ
      clearStaleStores();
      setStoredVersion(version);
      hardReload(version);
      return { changed: true, version };
    }
    // User mới, không có gì để xóa → chỉ ghi version, không reload
    setStoredVersion(version);
    return { changed: false, version };
  }

  if (stored === version) {
    return { changed: false, version };
  }

  // Version lệch → admin vừa refresh cache → xóa sạch + reload
  clearStaleStores();
  setStoredVersion(version);
  hardReload(version);
  return { changed: true, version };
};

export { VERSION_KEY, STALE_KEYS };
