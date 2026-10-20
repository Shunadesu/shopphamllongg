import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import DepositRequest from '../models/DepositRequest.js';
import WebhookLog from '../models/WebhookLog.js';
import User from '../models/User.js';
import { autoApproveDeposit } from '../utils/depositApproval.js';

const router = express.Router();

// === Config ===
const SEPAY_API_KEY = process.env.SEPAY_API_KEY || '';

// === Diagnostic log khi module được load ===
// In ra để verify env đã được đọc đúng khi server start.
function maskKey(k) {
  if (!k) return '(EMPTY)';
  if (k.length <= 6) return '***';
  return `${k.slice(0, 3)}***${k.slice(-3)} (length=${k.length})`;
}
console.log(`[SePay Webhook] Module loaded. SEPAY_API_KEY=${maskKey(SEPAY_API_KEY)}`);
console.log(`[SePay Webhook] WEBHOOK URL: POST /payinwebhook`);
console.log(`[SePay Webhook] NODE_ENV=${process.env.NODE_ENV || '(unset)'}`);
console.log(`[SePay Webhook] CWD=${process.cwd()}`);

// Amount tolerance khi match với deposit pending (giống emailChecker cũ).
const AMOUNT_TOLERANCE = 1000;

// === Webhook logging helpers ===
/**
 * Log webhook entry vào database (non-blocking)
 * @returns {string|null} Log ID nếu thành công, null nếu fail
 */
async function logWebhook(data) {
  try {
    const log = new WebhookLog(data);
    await log.save();
    return log._id.toString();
  } catch (err) {
    console.error('[WebhookLog] Failed to save:', err.message);
    return null;
  }
}

/**
 * Update webhook log với status cuối cùng (non-blocking)
 */
async function updateWebhookLog(logId, updates) {
  if (!logId) return;
  try {
    await WebhookLog.findByIdAndUpdate(logId, updates);
  } catch (err) {
    console.error('[WebhookLog] Failed to update:', err.message);
  }
}

// === API Key middleware ===
// Header: "Authorization: Apikey <key>" — so sánh constant-time.
function verifyApiKey(req, res, next) {
  if (!SEPAY_API_KEY) {
    console.error('[SePay Webhook] SEPAY_API_KEY chưa cấu hình trong .env');
    return res.status(500).json({ success: false, message: 'Server not configured' });
  }

  const auth = req.header('Authorization') || '';
  const expected = `Apikey ${SEPAY_API_KEY}`;

  // constant-time compare
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.warn(`[SePay Webhook] Unauthorized request from ${req.ip}, header: ${auth.slice(0, 20)}...`);
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  next();
}

// === Debug endpoint (tạm thời) — GET /payinwebhook/debug
// Trả về trạng thái env để diagnose từ xa. Xóa sau khi fix xong.
router.get('/payinwebhook/debug', (req, res) => {
  res.json({
    sepayApiKeyLoaded: !!SEPAY_API_KEY,
    sepayApiKeyMasked: SEPAY_API_KEY ? `${SEPAY_API_KEY.slice(0, 3)}***${SEPAY_API_KEY.slice(-3)}` : '(empty)',
    envSepayKeyExists: 'SEPAY_API_KEY' in process.env,
    envSepayKeyRaw: process.env.SEPAY_API_KEY ? `${process.env.SEPAY_API_KEY.slice(0, 3)}***${process.env.SEPAY_API_KEY.slice(-3)}` : '(empty)',
    nodeEnv: process.env.NODE_ENV || '(unset)',
    cwd: process.cwd(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// === Helper: parse transferNote as 6-digit deposit code ===
// Accept format:
// - Exactly "123456" (new format)
// - "123456 ..." or "123456-..." (code at start, legacy)
// - 6-digit code at end OR before ".CT" (new BIDV format)
// Reject:
// - Old format like "username 252000" (has letters and space)
// - "NAP 123456" or other patterns with letters before code
/**
 * Parse deposit code from webhook content
 * Returns: string (6-digit code) | object { type, username, amount } | object { type: 'scan-qr', code } | null
 */
function parseDepositCode(content) {
  if (!content || typeof content !== 'string') return null;

  const trimmed = content.trim();

  // Case 0 (NEW): BIDV semicolon-separated format
  // Example: "BIDV;96247B6RW7;544587"
  // Pattern: BIDV;{subAccount};{6-digit-code}
  // The last token after the final semicolon is the deposit code.
  const bidvSemicolonMatch = trimmed.match(/^BIDV;[^;]+;(\d{6})$/);
  if (bidvSemicolonMatch) {
    return bidvSemicolonMatch[1];
  }

  // Case 1: Content is exactly 6 digits (new format)
  if (/^\d{6}$/.test(trimmed)) {
    return trimmed;
  }

  // Case 2 (NEW): 6-digit code at end of content OR immediately before ".CT"
  // Handles new BIDV format (the deposit code is always the LAST 6-digit number
  // that's either at end-of-string or followed by ".CT").
  // Example A: "151015889347 0866586858 388887" → "388887"  (at end, all-numeric)
  // Example B: "MBVCB.16464989264.754632.388044.CT tu 1069..." → "388044"  (before .CT)
  // The `(?!\d)` ensures we don't pick a 6-digit run that's part of a longer number
  // (e.g., "12345678" should NOT match "123456").
  //
  // IMPORTANT: For the "all-numeric ending" case, we require the content to have
  // NO alphabetic characters — otherwise we'd accidentally pick the trailing
  // amount from old-format content like "username 252000".
  // The "before .CT" case is safe regardless of alphabetic chars because ".CT"
  // is a strong marker.
  const ctMatch = trimmed.match(/(?:^|\D)(\d{6})(?=\.CT)(?!\d)/);
  if (ctMatch) {
    return ctMatch[1];
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    // Tìm tất cả cụm 6 số đứng độc lập, lấy cụm cuối cùng
    const allMatches = trimmed.match(/(?:^|\D)(\d{6})(?!\d)/g);
    if (allMatches && allMatches.length > 0) {
      const lastMatch = allMatches[allMatches.length - 1];
      // Strip leading non-digit (nếu có) rồi lấy 6 số
      return lastMatch.match(/\d{6}$/)[0];
    }
  }

  // Case 2.5: Pattern with dash separator "text - 6digit" (e.g., "QR - 574948")
  // The dash is a strong indicator that the 6-digit is a code, not an amount.
  // This handles new BIDV format where content is prefixed with "QR - " or similar.
  const dashCodeMatch = trimmed.match(/-\s*(\d{6})(?!\d)$/);
  if (dashCodeMatch) {
    return dashCodeMatch[1];
  }

  // Case 2.6: Short uppercase prefix + space + 6-digit code
  // Examples: "IBFT 239268", "QR 574948", "NAP 388887"
  // The prefix is 2-6 UPPERCASE letters (BIDV transfer method codes like IBFT, QR, NAP, CT, FT).
  // This differs from old format "username 252000" where the prefix is typically lowercase
  // or longer than 6 characters.
  const shortPrefixMatch = trimmed.match(/^([A-Z]{2,6})\s+(\d{6})$/);
  if (shortPrefixMatch) {
    return shortPrefixMatch[2];
  }

  // Case 2.7 (NEW): BIDV "Scan QR" format with optional trailing reference number
  // Example: "Scan QR 066023 2109693809825206272"
  // Pattern: "Scan QR" + 6-digit code + optional (space + reference)
  // The "Scan QR" prefix is BIDV's marker for QR-code-based payments (NAP qua QR).
  // Trailing reference number is the bank's internal transaction ID — bỏ qua, chỉ lấy 6-digit.
  // Distinct from Case 2.6 vì Case 2.6 chỉ match đúng 2 token, còn format này có 3-4 token.
  // Lưu ý: KHÔNG match "QR - thanhdrums9 252000" (old format có dấu "-" và username viết thường).
  const scanQrMatch = trimmed.match(/^Scan\s+QR\s+(\d{6})(?:\s+\S+)?$/);
  if (scanQrMatch) {
    return {
      type: 'scan-qr',
      code: scanQrMatch[1],
    };
  }

  // Case 2.8 (NEW): Bank short prefix + 6-digit code (UPPERCASE only, optional space).
  // Bổ sung cho Case 2.6 (chỉ match UPPERCASE + có space). Mục đích bắt các format:
  //   "SE123456" / "SE 123456" — SePay default payment code prefix
  //   "MB123456" / "MB 123456" — MBBank chuyển khoản QR
  //   "VCB123456" / "VCB 123456" — Vietcombank
  //   "BIDV123456" / "BID 123456" / "BIDV 123456" — BIDV
  //   "ACB123456" / "ACB 123456" — ACB
  //   "TPB123456" / "TPB 123456" — TPBank
  //   "VPB123456" / "VPB 123456" — VPBank
  //   "ICB123456" / "ICB 123456" — VietinBank
  //   "TCB123456" / "TCB 123456" — Techcombank
  // Whitelist bank codes thay vì match bất kỳ 2-6 chữ cái nào — tránh match nhầm với
  // username (vd: user tên "mb" gõ "mb 252000" sẽ KHÔNG match ở đây, an toàn).
  // UPPERCASE-only vì ngân hàng gửi prefix viết HOA; nếu user gõ thường thì rơi vào
  // reject (chấp nhận miss thay vì risk approve nhầm).
  const bankPrefixMatch = trimmed.match(/^(?:SE|SEPAY|MB|VCB|BIDV?|ACB|TPB|VPB|ICB|TCB)\s*(\d{6})$/);
  if (bankPrefixMatch) {
    return bankPrefixMatch[1];
  }

  // Case 3: Content starts with 6 digits followed by space or dash
  // Legacy format: "997044 FT26282279126632" or "997044-abc"
  // (We check this AFTER the new-format cases so that mixed content
  //  like "123456 foo 654321" correctly picks "654321".)
  const match = trimmed.match(/^(\d{6})[\s\-]/);
  if (match) {
    return match[1];
  }

  // Case 4: BIDV long format "MBVCB.xxx.username amount.CT ..."
  // Example: "MBVCB.16457010956.559317.daihung112 2600000.CT tu 1019322584 NGUYEN VAN TAM toi 96247B6RW7 PHAM VAN"
  const bidvMatch = trimmed.match(/\.([a-zA-Z0-9_]+)\s+(\d+)\.CT/);
  if (bidvMatch) {
    return {
      type: 'bidv',
      username: bidvMatch[1],
      amount: parseInt(bidvMatch[2], 10),
    };
  }

  // Case 5: Techcombank format "username amount FTxxx"
  // Example: "duongphuchung 252000 FT26282279126632"
  // Pattern: <username> <amount> FT<digits>
  const techcombankMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+(\d+)\s+FT\d+$/);
  if (techcombankMatch) {
    return {
      type: 'techcombank',
      username: techcombankMatch[1],
      amount: parseInt(techcombankMatch[2], 10),
    };
  }

  // Case 5.5 (NEW): Code and amount separated by comma
  // Example: "ZP7DCJUND45H, 144590" or "ZP7DCJUND45H,144590"
  // Pattern: {CODE}, {AMOUNT} where CODE is alphanumeric (deposit reference from SePay)
  const commaMatch = trimmed.match(/^([A-Z0-9]+)\s*,\s*(\d+)$/);
  if (commaMatch) {
    return commaMatch[1];
  }

  // Case 6 (NEW): Vietnamese generic text + 6-digit code (case-insensitive).
  // Đặt TRƯỚC reject logic cuối vì content có space + letters sẽ bị reject.
  // Các pattern hay gặp:
  //   "Chuyen tien 123456" / "chuyen tien 123456"
  //   "Thanh toan 123456" / "thanh toan 123456"
  //   "Nap tien 123456" / "nap tien 123456"
  //   "CK 123456" (chuyển khoản viết tắt)
  //   "TT 123456" (thanh toán viết tắt)
  //   "Chuyển tiền 123456" (có dấu tiếng Việt — regex có flag 'i' nhưng \w không bắt
  //   dấu; bỏ qua các variant có dấu, chỉ cover dạng không dấu vì hầu hết bank
  //   trong content CK dùng không dấu hoặc SePay normalize về không dấu).
  // KHÔNG match "username 252000" vì pattern yêu cầu keyword cố định ở đầu.
  const vietTextMatch = trimmed.match(/^(?:chuyen\s+tien|thanh\s+toan|nap\s+tien|ck|tt)\s+(\d{6})$/i);
  if (vietTextMatch) {
    return vietTextMatch[1];
  }

  // Reject old format like "username 252000"
  // Pattern: has space AND has alphabetic characters → old format
  if (trimmed.includes(' ') && /[a-zA-Z]/.test(trimmed)) {
    return null;
  }

  return null;
}

// === POST /payinwebhook ===
router.post('/payinwebhook', verifyApiKey, async (req, res) => {
  const payload = req.body || {};
  const sepayId = payload.id;
  const sourceIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  // === Entry log — xác nhận webhook đã nhận request ===
  console.log(
    `[SePay Webhook] ➜ POST /payinwebhook from ${sourceIp}` +
    ` | id=${sepayId ?? 'N/A'}` +
    ` | transferType=${payload.transferType ?? 'N/A'}` +
    ` | amount=${typeof payload.transferAmount === 'number' ? payload.transferAmount.toLocaleString('vi-VN') + 'đ' : 'N/A'}` +
    ` | gateway=${payload.gateway ?? 'N/A'}` +
    ` | accountNumber=${payload.accountNumber ?? 'N/A'}` +
    ` | content="${payload.content ?? ''}"`
  );

  // === Log webhook entry vào database ===
  const logId = await logWebhook({
    source: 'sepay',
    rawPayload: payload,
    sepayTransactionId: String(sepayId),
    amount: payload.transferAmount || 0,
    content: payload.content || '',
    gateway: payload.gateway || '',
    accountNumber: payload.accountNumber || '',
    processingStatus: 'processing',
    sourceIp,
    receivedAt: new Date()
  });

  // === Validate cơ bản ===
  if (sepayId === undefined || sepayId === null) {
    await updateWebhookLog(logId, {
      processingStatus: 'error',
      processingNote: 'Missing id field in payload'
    });
    return res.status(400).json({ success: false, message: 'Missing id' });
  }
  if (payload.transferType !== 'in') {
    // Giao dịch ra — bỏ qua, return success để SePay không retry
    console.log(`[SePay Webhook] Ignore transferType=${payload.transferType} (id=${sepayId})`);
    await updateWebhookLog(logId, {
      processingStatus: 'ignored',
      processingNote: `Not incoming transfer (type: ${payload.transferType})`
    });
    return res.json({ success: true, ignored: 'not_incoming' });
  }
  if (typeof payload.transferAmount !== 'number' || payload.transferAmount <= 0) {
    console.warn(`[SePay Webhook] Invalid transferAmount: ${payload.transferAmount} (id=${sepayId})`);
    await updateWebhookLog(logId, {
      processingStatus: 'error',
      processingNote: `Invalid transferAmount: ${payload.transferAmount}`
    });
    return res.status(400).json({ success: false, message: 'Invalid transferAmount' });
  }

  // === Dedup theo SePay transaction id ===
  // Unique sparse index trên `sepayTransactionId` đảm bảo chỉ 1 record / SePay id
  const existing = await DepositRequest.findOne({ sepayTransactionId: String(sepayId) })
    .select('_id status')
    .lean();
  if (existing) {
    console.log(`[SePay Webhook] Duplicate SePay id ${sepayId} → already on deposit ${existing._id} (${existing.status})`);
    await updateWebhookLog(logId, {
      processingStatus: 'duplicate',
      processingNote: `Already processed for deposit ${existing._id} (${existing.status})`,
      matchedDepositId: existing._id
    });
    return res.json({ success: true, duplicate: true });
  }

  // === Parse content → 6-digit code OR BIDV format ===
  const parsed = parseDepositCode(payload.content);
  if (!parsed) {
    console.warn(`[SePay Webhook] Cannot parse deposit code from content: "${payload.content}" (id=${sepayId})`);
    await updateWebhookLog(logId, {
      processingStatus: 'ignored',
      processingNote: `Cannot parse deposit code from content: "${payload.content}"`
    });
    notifyIgnored(payload, 'unparseable_content', {
      content: payload.content,
    });
    return res.json({ success: true, ignored: 'unparseable_content' });
  }

  // === Find matching DepositRequest ===
  let candidate = null;
  let matchType = 'unknown';

  if (typeof parsed === 'string') {
    // 6-digit code → match exact transferNote
    matchType = '6-digit-code';
    candidate = await DepositRequest.findOne({
      status: 'pending',
      depositMethod: 'bank',
      transferNote: parsed,
    })
      .sort({ createdAt: 1 })
      .populate('userId', 'username isActive');
  } else if (parsed.type === 'scan-qr') {
    // BIDV "Scan QR" format → match exact transferNote (giống 6-digit-code)
    matchType = 'scan-qr-format';
    candidate = await DepositRequest.findOne({
      status: 'pending',
      depositMethod: 'bank',
      transferNote: parsed.code,
    })
      .sort({ createdAt: 1 })
      .populate('userId', 'username isActive');
  } else if (parsed.type === 'bidv' || parsed.type === 'techcombank') {
    // BIDV / Techcombank format → find user by username, then match amount + recent pending
    matchType = `${parsed.type}-format`;
    const { username: bidvUsername, amount: bidvAmount } = parsed;

    // Tìm user theo username
    const user = await User.findOne({ username: bidvUsername }).select('_id');

    if (!user) {
      console.warn(
        `[SePay Webhook] ${parsed.type} format but user not found: "${bidvUsername}" ` +
        `(SePay id=${sepayId})`
      );
      await updateWebhookLog(logId, {
        processingStatus: 'ignored',
        processingNote: `${parsed.type} format matched but user "${bidvUsername}" not found`
      });
      notifyIgnored(payload, 'user_not_found', {
        parsedUsername: bidvUsername,
        parsedAmount: bidvAmount,
        matchType: `${parsed.type}-format`,
      });
      return res.json({ success: true, ignored: 'user_not_found' });
    }

    // Match: user + amount + pending + recent
    candidate = await DepositRequest.findOne({
      userId: user._id,
      status: 'pending',
      depositMethod: 'bank',
      amount: bidvAmount,
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'username isActive');
  }

  if (!candidate) {
    const parseDetail = typeof parsed === 'string'
      ? `code="${parsed}"`
      : parsed.type === 'scan-qr'
        ? `Scan QR code="${parsed.code}"`
        : `BIDV username="${parsed.username}", amount=${parsed.amount}`;

    console.warn(
      `[SePay Webhook] No matching pending deposit for ${parseDetail} via ${matchType} ` +
      `(SePay id=${sepayId}, gateway=${payload.gateway}, accountNumber=${payload.accountNumber})`
    );
    await updateWebhookLog(logId, {
      processingStatus: 'ignored',
      processingNote: `No matching pending deposit for ${parseDetail} (${matchType})`
    });
    notifyIgnored(payload, 'no_match', {
      parsedCode: typeof parsed === 'string'
        ? parsed
        : parsed.type === 'scan-qr'
          ? parsed.code
          : null,
      parsedUsername: typeof parsed === 'object' && parsed.type !== 'scan-qr' ? parsed.username : null,
      parsedAmount: typeof parsed === 'object' && parsed.type !== 'scan-qr' ? parsed.amount : null,
      matchType,
    });
    return res.json({ success: true, ignored: 'no_match' });
  }

  // === Check user còn active không ===
  if (!candidate.userId || !candidate.userId.isActive) {
    console.warn(`[SePay Webhook] Match found but user is inactive/missing (deposit ${candidate._id})`);
    await updateWebhookLog(logId, {
      processingStatus: 'ignored',
      processingNote: `User inactive or missing (deposit: ${candidate._id})`,
      matchedDepositId: candidate._id
    });
    notifyIgnored(payload, 'user_inactive', {
      depositId: candidate._id.toString(),
      username: candidate.userId?.username || 'unknown',
    });
    return res.json({ success: true, ignored: 'user_inactive' });
  }

  // === Check amount match ±1000đ ===
  const diff = Math.abs(candidate.amount - payload.transferAmount);
  if (diff > AMOUNT_TOLERANCE) {
    console.warn(
      `[SePay Webhook] Amount mismatch: deposit=${candidate.amount.toLocaleString()}đ, ` +
      `received=${payload.transferAmount.toLocaleString()}đ, diff=${diff}đ ` +
      `(deposit ${candidate._id}, user=${candidate.userId.username})`
    );
    await updateWebhookLog(logId, {
      processingStatus: 'ignored',
      processingNote: `Amount mismatch: expected ${candidate.amount}, received ${payload.transferAmount}, diff ${diff}đ`,
      matchedDepositId: candidate._id
    });
    notifyIgnored(payload, 'amount_mismatch', {
      depositId: candidate._id.toString(),
      username: candidate.userId.username,
      expectedAmount: candidate.amount,
      receivedAmount: payload.transferAmount,
      diff,
    });
    return res.json({ success: true, ignored: 'amount_mismatch' });
  }

  // === Gắn SePay metadata trước khi approve (idempotency) ===
  candidate.sepayTransactionId = String(sepayId);
  candidate.sepayRawPayload = payload;

  // === Auto-approve ===
  try {
    const {
      user,
      spinsAwarded,
      oldBalance,
      oldSpins,
      oldTotalDeposited,
    } = await autoApproveDeposit({
      deposit: candidate,
      source: 'sepay',
      note: `Received: ${payload.transferAmount.toLocaleString('vi-VN')}đ (gateway: ${payload.gateway})`,
    });

    // ✅ Webhook callback xử lý thành công — log tổng kết ở cấp handler
    const depositShortId = candidate._id.toString().slice(-8).toUpperCase();
    const matchDetail = typeof parsed === 'string'
      ? `code="${parsed}"`
      : parsed.type === 'scan-qr'
        ? `Scan QR code="${parsed.code}"`
        : `BIDV user="${parsed.username}", amount=${parsed.amount.toLocaleString()}`;

    console.log(
      `[SePay Webhook] ✅ Approved via ${matchType} — ` +
      `SePay id=${sepayId}, matched ${matchDetail} → deposit #${depositShortId}, ` +
      `user=${user.username}, +${candidate.amount.toLocaleString('vi-VN')}đ → balance=${user.balance.toLocaleString()}đ, ` +
      `+${spinsAwarded} spins (total=${user.spins}), ` +
      `totalDeposited=${user.totalDeposited.toLocaleString()}đ`
    );

    // Update webhook log với success status
    await updateWebhookLog(logId, {
      processingStatus: 'success',
      processingNote: `Approved deposit #${depositShortId} via ${matchType}, credited ${candidate.amount.toLocaleString()}đ, awarded ${spinsAwarded} spins`,
      matchedDepositId: candidate._id
    });

    // Trả Telegram notification cho admin (best-effort, không block)
    try {
      await sendApprovedDepositNotification(candidate, payload, user, spinsAwarded, {
        oldBalance,
        oldSpins,
        oldTotalDeposited,
        matchType,
      });
    } catch (telegramErr) {
      console.error('[SePay Webhook] Telegram notification error (non-fatal):', telegramErr.message);
    }

    return res.json({ success: true, approved: true, spinsAwarded });
  } catch (err) {
    // Trùng key (race condition 2 webhook đến cùng lúc) → 2 request cùng match 1 deposit,
    // cái thứ 2 sẽ fail vì unique index. Coi như duplicate.
    if (err && (err.code === 11000 || /duplicate key/i.test(err.message || ''))) {
      console.log(`[SePay Webhook] Race condition: SePay id ${sepayId} already inserted`);
      await updateWebhookLog(logId, {
        processingStatus: 'duplicate',
        processingNote: 'Race condition: duplicate key on sepayTransactionId'
      });
      return res.json({ success: true, duplicate: true });
    }

    console.error(`[SePay Webhook] Auto-approve error (SePay id ${sepayId}):`, err);
    await updateWebhookLog(logId, {
      processingStatus: 'error',
      processingNote: `Auto-approve failed: ${err.message}`
    });
    // Trả 500 để SePay retry (lần sau sẽ hit dedup nếu lần trước đã commit)
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

/**
 * Gửi Telegram notification sau khi auto-approve qua SePay.
 * Best-effort — lỗi không ảnh hưởng webhook response.
 *
 * @param {Object} deposit         DepositRequest doc (đã approved)
 * @param {Object} sepayPayload    Raw SePay payload
 * @param {Object} user            User doc (đã cộng balance + spins)
 * @param {number} spinsAwarded    Số spins vừa thưởng
 * @param {Object} [audit]         Thông tin audit
 * @param {number} [audit.oldBalance]
 * @param {number} [audit.oldSpins]
 * @param {number} [audit.oldTotalDeposited]
 * @param {string} [audit.matchType]  '6-digit-code' | 'bidv-format' | 'techcombank-format'
 */
async function sendApprovedDepositNotification(deposit, sepayPayload, user, spinsAwarded, audit = {}) {
  // Lazy import để tránh circular / khởi tạo Telegram bot khi không cần
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!token || !adminChatId) return;

    const { Bot } = await import('node-telegram-bot-api');
    const bot = new Bot(token);

    const {
      oldBalance,
      oldSpins,
      oldTotalDeposited,
      matchType,
    } = audit;

    const formatVnd = (n) =>
      typeof n === 'number' ? n.toLocaleString('vi-VN') + 'đ' : 'N/A';

    const balanceLine = typeof oldBalance === 'number'
      ? `💳 <b>Số dư:</b> ${formatVnd(oldBalance)} → <b>${formatVnd(user.balance)}</b>`
      : `💳 <b>Số dư mới:</b> <b>${formatVnd(user.balance)}</b>`;

    const spinsLine = typeof oldSpins === 'number'
      ? `🎰 <b>Spins:</b> ${oldSpins} → <b>${user.spins}</b> <i>(+${spinsAwarded})</i>`
      : `🎰 <b>Spins:</b> +${spinsAwarded} (tổng: ${user.spins})`;

    const totalLine = typeof oldTotalDeposited === 'number'
      ? `📈 <b>Tổng đã nạp:</b> ${formatVnd(oldTotalDeposited)} → <b>${formatVnd(user.totalDeposited)}</b>`
      : `📈 <b>Tổng đã nạp:</b> ${formatVnd(user.totalDeposited)}`;

    const matchLabel = matchType
      ? matchType.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : 'N/A';

    const message =
      `✅ <b>NẠP TIỀN TỰ ĐỘNG (SePay)</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📌 <b>Mã GD:</b> <code>#${deposit._id.toString().slice(-8).toUpperCase()}</code>\n` +
      `🔗 <b>SePay TxID:</b> <code>${sepayPayload.id ?? 'N/A'}</code>\n` +
      `🔍 <b>Match:</b> ${matchLabel}\n\n` +
      `👤 <b>Người dùng:</b> <b>${user.username}</b>\n` +
      `💰 <b>Số tiền yêu cầu:</b> <b>${formatVnd(deposit.amount)}</b>\n` +
      `💵 <b>Thực nhận:</b> ${formatVnd(sepayPayload.transferAmount)}\n` +
      `🏦 <b>Ngân hàng:</b> ${sepayPayload.gateway || 'N/A'}\n` +
      `📝 <b>Nội dung:</b> <code>${sepayPayload.content || 'N/A'}</code>\n` +
      `${spinsLine}\n` +
      `${balanceLine}\n` +
      `${totalLine}\n` +
      `⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\n` +
      `━━━━━━━━━━━━━━━━━━`;

    await bot.api.sendMessage({
      chat_id: adminChatId,
      text: message,
      parse_mode: 'HTML',
    });

    console.log(
      `[SePay Webhook] ✅ Telegram admin notification sent for deposit #${deposit._id.toString().slice(-8).toUpperCase()} ` +
      `(user=${user.username}, +${user.balance.toLocaleString('vi-VN')}đ)`
    );
  } catch (err) {
    console.error('[SePay Webhook] sendApprovedDepositNotification error:', err.message);
  }
}

/**
 * Gửi Telegram thông báo cho admin khi webhook SePay bị skip/ignore.
 * Best-effort — lỗi không ảnh hưởng webhook response.
 *
 * @param {Object} payload           Raw SePay payload (req.body)
 * @param {string} reason            Mã lý do:
 *                                   'unparseable_content' | 'user_not_found' |
 *                                   'no_match' | 'user_inactive' | 'amount_mismatch'
 * @param {Object} extra             Context thêm tùy theo reason:
 *   - unparseable_content: { content }
 *   - user_not_found:      { parsedUsername, parsedAmount, matchType }
 *   - no_match:            { parsedUsername?, parsedAmount?, parsedCode?, matchType }
 *   - user_inactive:       { depositId, username }
 *   - amount_mismatch:     { depositId, username, expectedAmount, receivedAmount, diff }
 */
async function sendIgnoredDepositNotification(payload, reason, extra = {}) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!token || !adminChatId) return;

    const { Bot } = await import('node-telegram-bot-api');
    const bot = new Bot(token);

    const formatVnd = (n) =>
      typeof n === 'number' ? n.toLocaleString('vi-VN') + 'đ' : 'N/A';

    // === Header theo severity ===
    let header;
    let suggestion;
    switch (reason) {
      case 'amount_mismatch':
        header = '🚨 <b>SAI SỐ TIỀN (SePay)</b>';
        suggestion =
          '⚠️ <b>User đã chuyển sai số tiền, cần kiểm tra ngay.</b>\n' +
          '   • Có thể cần liên hệ user hoặc cộng tay vào admin panel.\n' +
          '   • Kiểm tra log chi tiết trong WebhookLog (matchedDepositId đã được lưu).';
        break;
      case 'user_not_found':
        header = '⚠️ <b>BỎ QUA — KHÔNG TÌM THẤY USER (SePay)</b>';
        suggestion =
          '⚠️ Có thể user đã đổi username hoặc SePay gửi nhầm format.\n' +
          '   • Kiểm tra log WebhookLog + collection User để tra cứu.';
        break;
      case 'user_inactive':
        header = '⚠️ <b>BỎ QUA — USER BỊ KHÓA (SePay)</b>';
        suggestion =
          '⚠️ User bị inactive nhưng vẫn nhận tiền.\n' +
          '   • Có thể cần review tài khoản (chargeback?) hoặc unlock thủ công.';
        break;
      case 'no_match':
        header = '⚠️ <b>BỎ QUA — KHÔNG MATCH DEPOSIT (SePay)';
        suggestion =
          '⚠️ Không có DepositRequest pending khớp với giao dịch này.\n' +
          '   • Có thể user đã nạp ngoài hệ thống hoặc đã hết hạn deposit pending.';
        break;
      case 'unparseable_content':
        header = '⚠️ <b>BỎ QUA — KHÔNG PARSE ĐƯỢC (SePay)</b>';
        suggestion =
          '⚠️ Format nội dung CK không nằm trong các pattern đã biết.\n' +
          '   • Có thể cần cập nhật parseDepositCode() nếu ngân hàng đổi format.';
        break;
      default:
        header = '⚠️ <b>BỎ QUA GIAO DỊCH (SePay)</b>';
        suggestion = '⚠️ Xem chi tiết bên dưới.';
    }

    // === Common lines ===
    const commonLines = [
      '━━━━━━━━━━━━━━━━━━',
      `🔗 <b>SePay TxID:</b> <code>${payload.id ?? 'N/A'}</code>`,
      `🏦 <b>Ngân hàng:</b> ${payload.gateway || 'N/A'}`,
      `💳 <b>STK nhận:</b> <code>${payload.accountNumber || 'N/A'}</code>`,
      `💰 <b>Số tiền:</b> ${formatVnd(payload.transferAmount)}`,
      `📝 <b>Nội dung:</b> <code>${(payload.content || 'N/A').slice(0, 200)}</code>`,
      `⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    ];

    // === Reason-specific detail ===
    const detailLines = [];
    switch (reason) {
      case 'unparseable_content':
        detailLines.push(
          `\n<b>Lý do:</b> Không parse được nội dung chuyển khoản — không match 6-digit code, BIDV format hay Techcombank format.`
        );
        break;
      case 'user_not_found':
        detailLines.push(
          `\n<b>Lý do:</b> Format parse ra username nhưng user không tồn tại trong hệ thống.`,
          `<b>Username parse:</b> <code>${extra.parsedUsername || 'N/A'}</code>`,
          `<b>Amount parse:</b> ${formatVnd(extra.parsedAmount)}`,
          `<b>Match type:</b> <code>${extra.matchType || 'N/A'}</code>`
        );
        break;
      case 'no_match':
        if (extra.parsedCode) {
          detailLines.push(
            `\n<b>Lý do:</b> Không có DepositRequest pending với transferNote = <code>${extra.parsedCode}</code>.`,
            `<b>Match type:</b> <code>${extra.matchType || '6-digit-code'}</code>`
          );
        } else {
          detailLines.push(
            `\n<b>Lý do:</b> Đã tìm thấy user nhưng không có DepositRequest pending khớp username + amount.`,
            `<b>Username:</b> <code>${extra.parsedUsername || 'N/A'}</code>`,
            `<b>Amount tìm:</b> ${formatVnd(extra.parsedAmount)}`,
            `<b>Match type:</b> <code>${extra.matchType || 'N/A'}</code>`
          );
        }
        break;
      case 'user_inactive':
        detailLines.push(
          `\n<b>Lý do:</b> Deposit match nhưng user đang bị khóa / không còn active.`,
          `<b>Username:</b> <code>${extra.username || 'N/A'}</code>`,
          `<b>Deposit ID:</b> <code>${extra.depositId || 'N/A'}</code>`
        );
        break;
      case 'amount_mismatch':
        detailLines.push(
          `\n<b>Lý do:</b> Tìm thấy DepositRequest nhưng số tiền chuyển lệch quá 1.000đ so với yêu cầu.`,
          `<b>Username:</b> <code>${extra.username || 'N/A'}</code>`,
          `<b>Deposit ID:</b> <code>${extra.depositId || 'N/A'}</code>`,
          `<b>Yêu cầu:</b> ${formatVnd(extra.expectedAmount)}`,
          `<b>Thực nhận:</b> ${formatVnd(extra.receivedAmount)}`,
          `<b>Chênh lệch:</b> <b>${formatVnd(extra.diff)}</b>`
        );
        break;
    }

    const message =
      `${header}\n\n` +
      commonLines.join('\n') +
      detailLines.join('\n') +
      `\n\n${suggestion}\n` +
      `━━━━━━━━━━━━━━━━━━`;

    await bot.api.sendMessage({
      chat_id: adminChatId,
      text: message,
      parse_mode: 'HTML',
    });

    console.log(
      `[SePay Webhook] ⚠️ Telegram ignored notification sent for reason=${reason} (SePay id=${payload.id ?? 'N/A'})`
    );
  } catch (err) {
    console.error('[SePay Webhook] sendIgnoredDepositNotification error:', err.message);
  }
}

/**
 * Fire-and-forget wrapper: gọi sendIgnoredDepositNotification không block response.
 */
function notifyIgnored(payload, reason, extra) {
  // Không await — để webhook trả 200 ngay
  sendIgnoredDepositNotification(payload, reason, extra).catch((e) =>
    console.error('[SePay Webhook] notifyIgnored error:', e.message)
  );
}

export default router;
