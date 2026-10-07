import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import DepositRequest from '../models/DepositRequest.js';
import WebhookLog from '../models/WebhookLog.js';
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

// === Helper: parse transferNote "username amount" ===
// Ví dụ: "namp123 50000" → { username: "namp123", amount: 50000 }
// Hoặc với prefix VietQR/SePay tự thêm: "QR - testa12345 10000" → vẫn parse đúng.
function parseTransferContent(content) {
  if (!content || typeof content !== 'string') return null;

  // Match: tên user (chữ thường/số/_/chữ hoa) + khoảng trắng + số tiền ở CUỐI content.
  // Lý do bỏ anchor `^`: SePay / VietQR generator thường prepend prefix phía trước
  // (vd: "QR - ", "NAP ") vào content thực nhận từ ngân hàng, dù `transferNote` trong
  // DB chỉ có "username amount". Anchor `$` ở cuối vẫn bắt buộc amount là số cuối cùng
  // để tránh match nhầm số ở giữa content (vd: timestamp, mã GD).
  //
  // Regex này không có `^`, nên greedy match sẽ tự chọn username dài nhất trước
  // amount cuối cùng — tránh nhầm với prefix uppercase như "QR", "NAP"...
  const match = content.trim().match(/([A-Za-z0-9_]+)\s+(\d+)\s*$/);
  if (!match) return null;

  return {
    username: match[1].toLowerCase(),
    amount: parseInt(match[2], 10),
  };
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

  // === Parse content → username + amount ===
  const parsed = parseTransferContent(payload.content);
  if (!parsed) {
    console.warn(`[SePay Webhook] Cannot parse content: "${payload.content}" (id=${sepayId})`);
    await updateWebhookLog(logId, {
      processingStatus: 'ignored',
      processingNote: `Cannot parse content: "${payload.content}"`
    });
    return res.json({ success: true, ignored: 'unparseable_content' });
  }

  // === Tìm DepositRequest pending khớp ===
  // transferNote format: "${username} ${amount}" — match regex case-insensitive
  // Lấy cái cũ nhất nếu user có nhiều pending cùng lúc.
  const amountInVND = parsed.amount;
  const escapedUsername = parsed.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const transferNotePattern = new RegExp(`^${escapedUsername}\\s+${amountInVND}$`, 'i');

  const candidate = await DepositRequest.findOne({
    status: 'pending',
    depositMethod: 'bank',
    transferNote: transferNotePattern,
  })
    .sort({ createdAt: 1 })
    .populate('userId', 'username isActive');

  if (!candidate) {
    console.warn(
      `[SePay Webhook] No matching pending deposit for content="${payload.content}" ` +
      `(SePay id=${sepayId}, gateway=${payload.gateway}, accountNumber=${payload.accountNumber})`
    );
    await updateWebhookLog(logId, {
      processingStatus: 'ignored',
      processingNote: `No matching pending deposit for username="${parsed.username}" amount=${parsed.amount}`
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
    return res.json({ success: true, ignored: 'amount_mismatch' });
  }

  // === Gắn SePay metadata trước khi approve (idempotency) ===
  candidate.sepayTransactionId = String(sepayId);
  candidate.sepayRawPayload = payload;

  // === Auto-approve ===
  try {
    const { user, spinsAwarded } = await autoApproveDeposit({
      deposit: candidate,
      source: 'sepay',
      note: `Received: ${payload.transferAmount.toLocaleString('vi-VN')}đ (gateway: ${payload.gateway})`,
    });

    // ✅ Webhook callback xử lý thành công — log tổng kết ở cấp handler
    const depositShortId = candidate._id.toString().slice(-8).toUpperCase();
    console.log(
      `[SePay Webhook] ✅ Webhook callback processed successfully — ` +
      `SePay id=${sepayId} → deposit #${depositShortId} approved, ` +
      `user=${user.username}, +${candidate.amount.toLocaleString('vi-VN')}đ → balance=${user.balance.toLocaleString()}đ, ` +
      `+${spinsAwarded} spins (total=${user.spins}), ` +
      `totalDeposited=${user.totalDeposited.toLocaleString()}đ`
    );

    // Update webhook log với success status
    await updateWebhookLog(logId, {
      processingStatus: 'success',
      processingNote: `Approved deposit #${depositShortId}, credited ${candidate.amount.toLocaleString()}đ, awarded ${spinsAwarded} spins`,
      matchedDepositId: candidate._id
    });

    // Trả Telegram notification cho admin (best-effort, không block)
    try {
      const { sendDepositNotification } = await import('../services/telegramBot.js');
      // Gửi message tùy biến vì deposit đã approved
      await sendApprovedDepositNotification(candidate, payload, user, spinsAwarded);
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
 */
async function sendApprovedDepositNotification(deposit, sepayPayload, user, spinsAwarded) {
  // Lazy import để tránh circular / khởi tạo Telegram bot khi không cần
  let bot, adminChatId;
  try {
    const telegramMod = await import('../services/telegramBot.js');
    // Telegram bot chưa export instance, dùng cách khác: gọi lại sendDepositNotification
    // (gửi message pending — admin thấy, nhưng không quan trọng vì đã approved).
    // Đơn giản hơn: gửi custom message qua bot trực tiếp.
    const token = process.env.TELEGRAM_BOT_TOKEN;
    adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!token || !adminChatId) return;

    const { Bot } = await import('node-telegram-bot-api');
    bot = new Bot(token);

    const message =
      `✅ <b>NẠP TIỀN TỰ ĐỘNG (SePay)</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📌 <b>Mã GD:</b> <code>#${deposit._id.toString().slice(-8).toUpperCase()}</code>\n\n` +
      `👤 <b>Người dùng:</b> <b>${user.username}</b>\n` +
      `💰 <b>Số tiền yêu cầu:</b> <b>${deposit.amount.toLocaleString('vi-VN')}đ</b>\n` +
      `💵 <b>Thực nhận:</b> ${sepayPayload.transferAmount.toLocaleString('vi-VN')}đ\n` +
      `🏦 <b>Ngân hàng:</b> ${sepayPayload.gateway || 'N/A'}\n` +
      `📝 <b>Nội dung:</b> <code>${sepayPayload.content || 'N/A'}</code>\n` +
      `🎰 <b>Spins:</b> +${spinsAwarded} (tổng: ${user.spins})\n` +
      `💳 <b>Số dư mới:</b> <b>${user.balance.toLocaleString('vi-VN')}đ</b>\n` +
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

export default router;
