// Event bus cho auth errors.
//
// Mục đích: cho phép `utils/api.js` báo "có lỗi 401" tới `store/authStore.js`
// mà không tạo circular import (api.js → authStore → cartStore → api.js).
//
// - `onAuthError(fn)`: đăng ký listener, trả về hàm unsubscribe.
// - `emitAuthError()`: gọi tất cả listener đã đăng ký, lỗi trong từng
//   listener được nuốt để một listener hỏng không chặn các listener khác.

const listeners = new Set();

export const onAuthError = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const emitAuthError = () => {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[authEvents] listener error:', err);
    }
  }
};
