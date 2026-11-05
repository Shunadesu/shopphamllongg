import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { setPendingAuthRedirect } from '../utils/pendingAuthRedirect';

/**
 * Điều hướng tới một trang yêu cầu đăng nhập.
 *
 * Vấn đề: các link kiểu `/profile?view=deposit` nằm sau `ProtectedRoute`.
 * Nếu user chưa đăng nhập mà bấm link, React Router vẫn đổi URL trước,
 * `ProtectedRoute` mới mở drawer đăng nhập → user thấy trang trắng + URL đổi.
 *
 * Cách sửa:
 *   - Đã đăng nhập  → điều hướng luôn.
 *   - Chưa đăng nhập → KHÔNG đổi URL, chỉ mở drawer đăng nhập và ghi nhớ
 *     đường dẫn đích. Sau khi đăng nhập thành công, App.jsx đọc lại đường dẫn
 *     này và chuyển tới (xem `utils/pendingAuthRedirect.js`).
 *
 * @param {Function} [onOpenAuth] callback mở drawer đăng nhập. Nếu không truyền,
 *   sẽ dispatch event 'openAuthDrawer' (App.jsx lắng nghe event này).
 */
export function useProtectedNavigate(onOpenAuth) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Mở drawer đăng nhập + ghi nhớ đường dẫn đích.
  const requestAuth = useCallback(
    (path) => {
      setPendingAuthRedirect(path);
      if (onOpenAuth) {
        onOpenAuth('login');
      } else {
        window.dispatchEvent(
          new CustomEvent('openAuthDrawer', { detail: { view: 'login' } })
        );
      }
    },
    [onOpenAuth]
  );

  // Handler gắn vào onClick của <Link>. Khi chưa đăng nhập thì chặn hành vi
  // mặc định của React Router (preventDefault) để URL không bị đổi.
  const guardClick = useCallback(
    (path) => (event) => {
      if (isAuthenticated) return;
      event.preventDefault();
      requestAuth(path);
    },
    [isAuthenticated, requestAuth]
  );

  // Điều hướng có kiểm tra đăng nhập (dùng cho nút bấm, không phải <Link>).
  // Trả về true nếu đã điều hướng, false nếu chỉ mở drawer đăng nhập.
  const navigateProtected = useCallback(
    (path) => {
      if (isAuthenticated) {
        navigate(path);
        return true;
      }
      requestAuth(path);
      return false;
    },
    [isAuthenticated, navigate, requestAuth]
  );

  return { isAuthenticated, navigateProtected, guardClick, requestAuth };
}
