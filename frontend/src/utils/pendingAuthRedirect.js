// Lưu "đường dẫn đích" mà user muốn tới nhưng bị chặn vì chưa đăng nhập.
//
// Ví dụ: user chưa đăng nhập bấm "Nạp tiền" ở thanh điều hướng dưới cùng.
// Ta KHÔNG cho đổi URL, chỉ mở drawer đăng nhập và ghi nhớ `/profile?view=deposit`.
// Sau khi đăng nhập thành công, App.jsx đọc lại đường dẫn này và chuyển tới.
//
// Dùng biến module-level (không persist) vì:
//   - Chỉ cần sống trong vòng đời của phiên SPA hiện tại.
//   - Tránh trường hợp redirect "sót" sang lần đăng nhập sau.

let pendingPath = null;

export const setPendingAuthRedirect = (path) => {
  pendingPath = path || null;
};

// Đọc và xóa luôn — chỉ dùng 1 lần cho 1 lần đăng nhập.
export const takePendingAuthRedirect = () => {
  const path = pendingPath;
  pendingPath = null;
  return path;
};

export const clearPendingAuthRedirect = () => {
  pendingPath = null;
};
