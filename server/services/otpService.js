/**
 * OTP Service - In-memory OTP store
 * Key: username (lowercase)
 * Value: { otp, expiresAt, attempts }
 */

const otpStore = new Map();

// Config
const OTP_TTL_MS = 5 * 60 * 1000;      // 5 minutes
const MAX_ATTEMPTS = 5;                // max wrong attempts before invalidate
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_PER_WINDOW = 3;          // max OTP requests per window
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds between OTP requests

const rateLimitStore = new Map();

/**
 * Generate a 6-digit OTP
 */
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Check rate limit for a username
 * Returns { allowed: boolean, waitSeconds?: number }
 */
function checkRateLimit(username) {
  const now = Date.now();
  const data = rateLimitStore.get(username);

  if (!data) {
    rateLimitStore.set(username, { count: 1, firstRequestAt: now });
    return { allowed: true };
  }

  // Reset if window expired
  if (now - data.firstRequestAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(username, { count: 1, firstRequestAt: now });
    return { allowed: true };
  }

  if (data.count >= MAX_OTP_PER_WINDOW) {
    const waitMs = RATE_LIMIT_WINDOW_MS - (now - data.firstRequestAt);
    return { allowed: false, waitSeconds: Math.ceil(waitMs / 1000) };
  }

  data.count += 1;
  return { allowed: true };
}

/**
 * Generate OTP for a username
 * Returns { otp, expiresAt } or throws error if rate limited
 */
function generateOTP(username) {
  const normalized = username.toLowerCase().trim();

  // Rate limit check
  const { allowed, waitSeconds } = checkRateLimit(normalized);
  if (!allowed) {
    const err = new Error(`Quá nhiều yêu cầu gửi OTP. Vui lòng thử lại sau ${waitSeconds} giây.`);
    err.status = 429;
    throw err;
  }

  const code = generateCode();
  const expiresAt = Date.now() + OTP_TTL_MS;

  otpStore.set(normalized, {
    otp: code,
    expiresAt,
    attempts: 0,
    createdAt: Date.now(),
  });

  return { otp: code, expiresAt };
}

/**
 * Verify OTP for a username
 * Returns { valid: true } or { valid: false, reason: string }
 * Automatically invalidates after MAX_ATTEMPTS or after expiry
 */
function verifyOTP(username, otp) {
  const normalized = username.toLowerCase().trim();
  const data = otpStore.get(normalized);

  if (!data) {
    return { valid: false, reason: 'Mã OTP không tồn tại hoặc đã hết hạn. Vui lòng gửi lại mã mới.' };
  }

  // Check expiry
  if (Date.now() > data.expiresAt) {
    otpStore.delete(normalized);
    return { valid: false, reason: 'Mã OTP đã hết hạn. Vui lòng gửi lại mã mới.' };
  }

  // Check attempts
  if (data.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(normalized);
    return { valid: false, reason: 'Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.' };
  }

  // Check code
  if (data.otp !== otp.trim()) {
    data.attempts += 1;
    const remaining = MAX_ATTEMPTS - data.attempts;
    if (remaining > 0) {
      return {
        valid: false,
        reason: `Mã OTP không đúng. Bạn còn ${remaining} lần thử.`
      };
    }
    return { valid: false, reason: 'Mã OTP không đúng. Vui lòng gửi lại mã mới.' };
  }

  // Success — invalidate OTP
  otpStore.delete(normalized);
  return { valid: true };
}

/**
 * Invalidate OTP for a username (logout / cancel)
 */
function invalidateOTP(username) {
  const normalized = username.toLowerCase().trim();
  otpStore.delete(normalized);
}

/**
 * Check if OTP exists and get remaining time in seconds
 */
function getOTPStatus(username) {
  const normalized = username.toLowerCase().trim();
  const data = otpStore.get(normalized);

  if (!data) {
    return { exists: false };
  }

  const remainingMs = data.expiresAt - Date.now();
  if (remainingMs <= 0) {
    otpStore.delete(normalized);
    return { exists: false };
  }

  const { otp, ...rest } = data; // Don't expose OTP
  return { exists: true, ...rest, remainingSeconds: Math.ceil(remainingMs / 1000) };
}

/**
 * Get resend cooldown for a username (based on last OTP creation time)
 */
function getResendCooldown(username) {
  const normalized = username.toLowerCase().trim();
  const data = otpStore.get(normalized);

  if (!data) {
    return { canResend: true, waitSeconds: 0 };
  }

  const elapsed = Date.now() - data.createdAt;
  if (elapsed >= RESEND_COOLDOWN_MS) {
    return { canResend: true, waitSeconds: 0 };
  }

  return {
    canResend: false,
    waitSeconds: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000),
  };
}

export {
  generateOTP,
  verifyOTP,
  invalidateOTP,
  getOTPStatus,
  getResendCooldown,
  MAX_ATTEMPTS,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
};
