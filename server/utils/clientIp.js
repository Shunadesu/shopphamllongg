/**
 * Tiện ích lấy IP client — dùng chung cho rate limit, log và chống spam.
 *
 * Server đang chạy sau reverse proxy (nginx/Caddy) và đã bật `app.set('trust proxy', 1)`
 * trong server.js. Với `trust proxy` bật, Express tự resolve `req.ip` theo chuỗi
 * X-Forwarded-For mà ta tin cậy, nên `req.ip` là lựa chọn đáng tin cậy nhất.
 *
 * Vì sao KHÔNG đọc thẳng `x-forwarded-for` như `adminAccessLog.js` trước đây:
 * - Nếu server bị truy cập trực tiếp (không qua proxy), client tự gán được header
 *   `X-Forwarded-For` và giả IP → vượt qua được giới hạn theo IP.
 * - `req.ip` với `trust proxy` chỉ tin các hop proxy thực sự trong chuỗi.
 */

/**
 * Chuẩn hoá địa chỉ IP:
 * - `::ffff:1.2.3.4` → `1.2.3.4` (IPv4-mapped IPv6 từ Node socket)
 * - `::1` → `::1` (giữ nguyên IPv6)
 * - Bỏ khoảng trắng và ký tự `%zone` của IPv6 link-local
 *
 * @param {string} raw
 * @returns {string} IP đã chuẩn hoá, hoặc '' nếu không xác định
 */
export function normalizeIp(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let ip = raw.trim();
  if (!ip) return '';

  // IPv6 zone id (vd: fe80::1%eth0)
  const zoneIdx = ip.indexOf('%');
  if (zoneIdx !== -1) ip = ip.slice(0, zoneIdx);

  // IPv4-mapped IPv6 → IPv4
  const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped) return mapped[1];

  return ip;
}

/**
 * Lấy IP thật của client.
 *
 * Thứ tự ưu tiên:
 * 1. `req.ip` — Express đã tôn trọng `trust proxy` (đáng tin cậy nhất).
 * 2. `x-real-ip` — header do proxy thiết lập, chỉ dùng khi req.ip rỗng.
 * 3. `socket.remoteAddress` — kết nối TCP trực tiếp.
 *
 * @param {import('express').Request} req
 * @returns {string} IP đã chuẩn hoá, hoặc 'unknown' nếu không xác định
 */
export function getClientIp(req) {
  const candidates = [
    req?.ip,
    req?.headers?.['x-real-ip'],
    req?.socket?.remoteAddress,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate);
    if (normalized) return normalized;
  }

  return 'unknown';
}

/**
 * Che bớt IP để hiển thị cho người dùng (giảm rò rỉ thông tin địa chỉ đầy đủ).
 * IPv4: 203.0.113.45 → 203.0.113.xxx
 * IPv6: giữ 2 nhóm đầu + dấu ...
 *
 * @param {string} ip
 * @returns {string}
 */
export function maskIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized || normalized === 'unknown') return '';

  if (normalized.includes(':')) {
    const parts = normalized.split(':');
    return `${parts.slice(0, 2).join(':')}:...`;
  }

  const parts = normalized.split('.');
  if (parts.length !== 4) return normalized;
  return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
}

/**
 * Rút gọn User-Agent cho log/hiển thị (giới hạn độ dài để không làm rối UI).
 *
 * @param {string} userAgent
 * @returns {string}
 */
export function shortenUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return '';
  return userAgent.length > 120 ? `${userAgent.slice(0, 117)}...` : userAgent;
}
