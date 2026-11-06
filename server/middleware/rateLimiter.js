import rateLimit from 'express-rate-limit';

// Rate limiter for spin API - prevent spam
export const spinLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 spins per minute per IP
  message: {
    message: 'Quá nhiều lượt quay. Vui lòng đợi 1 phút và thử lại.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Quá nhiều lượt quay. Vui lòng đợi 1 phút và thử lại.',
      retryAfter: 60
    });
  }
});

// Rate limiter for checkout/purchase - prevent spam purchases
export const purchaseLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Max 5 purchases per minute per IP
  message: {
    message: 'Quá nhiều giao dịch. Vui lòng đợi 1 phút và thử lại.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Quá nhiều giao dịch. Vui lòng đợi 1 phút và thử lại.',
      retryAfter: 60
    });
  }
});

// Rate limiter chung cho TẤT CẢ endpoint tạo lệnh nạp
// (/request, /card-request, /random-request).
//
// Trước đây chỉ `/request` có limiter (`depositLimiter`, 3 req/phút) → `card-request`
// và `random-request` không giới hạn gì, là lỗ hổng spam. Giờ dùng chung 1 limiter
// cho cả 3 để chặn bot/script tạo hàng loạt lệnh nạp từ 1 IP.
//
// Lưu ý: limiter này chạy TRƯỚC `depositIpLimit` trong chain — mỗi IP bị đếm
// ở đây trước, sau đó mới kiểm tra giới hạn lệnh nạp pending.
export const depositCreateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 phút
  max: 5, // Max 5 lệnh nạp mới trong 5 phút per IP
  message: {
    message: 'Quá nhiều yêu cầu tạo lệnh nạp. Vui lòng đợi vài phút và thử lại.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Quá nhiều yêu cầu tạo lệnh nạp. Vui lòng đợi vài phút và thử lại.',
      code: 'DEPOSIT_RATE_LIMIT',
      retryAfter: 300
    });
  }
});

// General API rate limiter
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per 15 minutes per IP
  message: {
    message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.'
  },
  standardHeaders: true,
  legacyHeaders: false
});
