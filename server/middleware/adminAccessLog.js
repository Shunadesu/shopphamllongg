import AdminAccessLog from '../models/AdminAccessLog.js';

// Paths to skip logging
const SKIP_PATHS = ['/api/health'];

// Sensitive body keys to never log
const SENSITIVE_KEYS = ['password', 'token', 'secret', 'key', 'authorization', 'oldPassword', 'newPassword'];

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return [];
  return Object.keys(body).filter(key => !SENSITIVE_KEYS.includes(key.toLowerCase()));
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.ip ||
    req.socket?.remoteAddress ||
    ''
  );
}

export function adminAccessLog(req, res, next) {
  // Skip certain paths
  if (SKIP_PATHS.some(p => req.path === p || req.originalUrl === p)) {
    return next();
  }

  const startTime = Date.now();
  const adminId = req.user?._id;
  const adminUsername = req.user?.username || 'unknown';

  // Capture request metadata
  const logEntry = {
    adminId,
    adminUsername,
    method: req.method,
    path: req.originalUrl,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'] || '',
    params: Object.keys(req.params || {}).length > 0 ? req.params : null,
    bodyKeys: sanitizeBody(req.body),
    statusCode: null,
    responseTime: null
  };

  // Log after response finishes (non-blocking)
  res.on('finish', () => {
    logEntry.statusCode = res.statusCode;
    logEntry.responseTime = Date.now() - startTime;

    // Fire-and-forget — don't block or delay the response
    AdminAccessLog.create(logEntry).catch((err) => {
      console.error('[AdminAccessLog] Failed to write log:', err.message);
    });
  });

  next();
}

export default adminAccessLog;
