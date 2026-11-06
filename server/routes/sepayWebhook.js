import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import DepositRequest from '../models/DepositRequest.js';
import WebhookLog from '../models/WebhookLog.js';
import User from '../models/User.js';
import BankAccount from '../models/BankAccount.js';
import { autoApproveDeposit } from '../utils/depositApproval.js';
import { parseDepositCode } from '../utils/depositCodeParser.js';

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

// Khoảng thời gian (phút) để fallback match theo SỐ TIỀN khi không parse được mã nạp.
// Ví dụ nội dung CK = "ZP263100611362 677567" nhưng user quên gõ mã nạp,
// hoặc ngân hàng bổ sung mã máy sinh làm nội dung bị lẫn → không match theo mã.
// Fallback: tìm deposit pending bank có amount khớp (±AMOUNT_TOLERANCE) tạo gần đây.
// Giữ cửa sổ hẹp (30 phút) để giảm rủi ro khớp nhầm vào yêu cầu nạp cũ đã bỏ quên.
const AMOUNT_MATCH_WINDOW_MINUTES = 30;

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

// === Helper: mô tả nguồn match để log / Telegram ===
/**
 * Tạo chuỗi mô tả ngắn gọn cách match được deposit, dùng cho log và thông báo Telegram.
 * @param {string} matchType
 * @param {string|Object|null} parsed Kết quả parseDepositCode
 * @returns {string}
 */
function describeMatch(matchType, parsed) {
  if (matchType === 'amount-fallback') {
    return `amount fallback (${AMOUNT_MATCH_WINDOW_MINUTES} phút gần đây)`;
  }
  if (matchType === 'amount-fallback-same-user') {
    return `amount fallback, cùng user (${AMOUNT_MATCH_WINDOW_MINUTES} phút gần đây)`;
  }
  if (typeof parsed === 'string') {
    return `code="${parsed}"`;
  }
  if (parsed?.type === 'scan-qr') {
    return `Scan QR code="${parsed.code}"`;
  }
  if (parsed?.type) {
    return `${parsed.type} username="${parsed.username}", amount=${parsed.amount}`;
  }
  return 'unknown';
}

// === Helper: fallback match theo SỐ TIỀN ===
/**
 * Tìm các DepositRequest pending (bank) có số tiền khớp `amount` (± AMOUNT_TOLERANCE)
 * được tạo trong `AMOUNT_MATCH_WINDOW_MINUTES` phút gần đây.
 *
 * Dùng làm fallback khi không tìm được deposit theo mã nạp 6 số — ví dụ nội dung
 * CK bị ngân hàng/SePay thêm mã máy sinh ("ZP263100611362") làm mã nạp bị lẫn.
 *
 * @param {number} amount Số tiền thực nhận
 * @param {string} [accountNumber] Số tài khoản nhận (để lọc theo bank account)
 * @returns {Promise<Array>} Danh sách deposit khớp (rỗng nếu không có)
 */
async function findPendingDepositsByAmount(amount, accountNumber) {
  if (typeof amount !== 'number' || amount <= 0) return [];

  const since = new Date(Date.now() - AMOUNT_MATCH_WINDOW_MINUTES * 60 * 1000);

  const query = {
    status: 'pending',
    depositMethod: 'bank',
    createdAt: { $gte: since },
    // Lọc số tiền ngay trong DB để không bị giới hạn bởi .limit()
    amount: { $gte: amount - AMOUNT_TOLERANCE, $lte: amount + AMOUNT_TOLERANCE },
  };

  // Lọc theo bank account để tránh khớp nhầm sang tài khoản nhận khác.
  if (accountNumber) {
    const bankAccounts = await BankAccount.find({ accountNumber: String(accountNumber) })
      .select('_id')
      .lean();
    if (bankAccounts.length > 0) {
      query.bankAccountId = { $in: bankAccounts.map((b) => b._id) };
    }
  }

  // KHÔNG dùng .lean() — candidate cần là Mongoose document để autoApproveDeposit
  // gọi được deposit.save({ session }).
  return DepositRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('userId', 'username isActive');
}

// === Helper: tìm deposit pending theo mã nạp 6 số ===
/**
 * Escape các ký tự đặc biệt của RegExp để dựng pattern an toàn từ chuỗi user input.
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tìm DepositRequest pending (bank) theo mã nạp 6 số.
 *
 * Thử khớp CHÍNH XÁC trước (nhanh, dùng index nếu có). Nếu không tìm được thì
 * thử khớp MỀM: bỏ khoảng trắng thừa + không phân biệt hoa/thường — phòng
 * trường hợp gateway lưu transferNote lệch (ví dụ " 556308 " hoặc "556308 ").
 *
 * @param {string} code Mã nạp 6 số
 * @returns {Promise<Object|null>} DepositRequest document hoặc null
 */
async function findPendingDepositByCode(code) {
  if (!code || typeof code !== 'string') return null;

  const base = {
    status: 'pending',
    depositMethod: 'bank',
  };

  // 1) Khớp chính xác
  let candidate = await DepositRequest.findOne({
    ...base,
    transferNote: code,
  })
    .sort({ createdAt: 1 })
    .populate('userId', 'username isActive');

  if (candidate) return candidate;

  // 2) Khớp mềm: bỏ khoảng trắng + không phân biệt hoa/thường
  const loosePattern = new RegExp(`^\\s*${escapeRegExp(code)}\\s*$`, 'i');
  candidate = await DepositRequest.findOne({
    ...base,
    transferNote: loosePattern,
  })
    .sort({ createdAt: 1 })
    .populate('userId', 'username isActive');

  return candidate;
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
  // Một số gateway (BIDV) gửi nội dung CK ở `content`, số khác lại nhét vào
  // `description` (vd: "BankAPINotify ZP263101138755 556308"). Thử lần lượt
  // các nguồn cho tới khi ra mã nạp.
  let parsed = null;
  let parsedFrom = null;
  for (const [field, value] of [
    ['content', payload.content],
    ['description', payload.description],
    ['code', payload.code],
  ]) {
    if (!value || typeof value !== 'string') continue;
    const result = parseDepositCode(value);
    if (result) {
      parsed = result;
      parsedFrom = field;
      break;
    }
  }
  if (!parsed) {
    console.warn(
      `[SePay Webhook] Cannot parse deposit code from content: "${payload.content}" ` +
      `(description="${payload.description || ''}") (id=${sepayId}) ` +
      `→ thử fallback match theo số tiền`
    );
  } else if (parsedFrom && parsedFrom !== 'content') {
    console.log(
      `[SePay Webhook] Parsed deposit code from "${parsedFrom}": "${payload[parsedFrom]}" (id=${sepayId})`
    );
  }

  // === Find matching DepositRequest ===
  let candidate = null;
  let matchType = 'unknown';

  if (typeof parsed === 'string') {
    // 6-digit code → match transferNote (chính xác trước, sau đó khớp mềm)
    matchType = '6-digit-code';
    candidate = await findPendingDepositByCode(parsed);
  } else if (parsed?.type === 'scan-qr') {
    // BIDV "Scan QR" format → match transferNote (giống 6-digit-code)
    matchType = 'scan-qr-format';
    candidate = await findPendingDepositByCode(parsed.code);
  } else if (parsed?.type === 'bidv' || parsed?.type === 'techcombank') {
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

  // === Fallback: không tìm được theo mã nạp → thử khớp theo SỐ TIỀN ===
  // Áp dụng khi:
  //   - Content không parse được mã (vd: "ZP263100611362" — mã máy sinh của SePay).
  //   - Có mã nhưng không tồn tại deposit pending nào mang mã đó.
  // Điều kiện an toàn: chỉ có DUY NHẤT 1 deposit pending khớp số tiền (±1.000đ)
  // được tạo trong khoảng thời gian gần đây → mới approve.
  // Nếu có nhiều deposit cùng số tiền → KHÔNG approve, báo admin để xử lý tay.
  if (!candidate) {
    const amountMatches = await findPendingDepositsByAmount(
      payload.transferAmount,
      payload.accountNumber
    );

    if (amountMatches.length === 1) {
      candidate = amountMatches[0];
      matchType = 'amount-fallback';
      console.log(
        `[SePay Webhook] ↩ Fallback match theo số tiền: ${payload.transferAmount.toLocaleString('vi-VN')}đ ` +
        `→ deposit #${candidate._id.toString().slice(-8).toUpperCase()} ` +
        `(user=${candidate.userId?.username}, createdAt=${candidate.createdAt?.toISOString()}) ` +
        `(SePay id=${sepayId})`
      );
    } else if (amountMatches.length > 1) {
      // Nhiều deposit pending cùng số tiền. Nếu TẤT CẢ thuộc cùng một user
      // (user bấm "tạo yêu cầu nạp" nhiều lần rồi chuyển 1 lần) → chọn yêu cầu
      // MỚI NHẤT của user đó: cộng tiền cho đúng user là an toàn dù duyệt yêu cầu
      // nào. Nếu thuộc nhiều user khác nhau → KHÔNG tự approve, báo admin.
      const ownerIds = [
        ...new Set(
          amountMatches.map((d) => d.userId?._id?.toString() || 'no-user')
        ),
      ];

      if (ownerIds.length === 1 && ownerIds[0] !== 'no-user') {
        candidate = amountMatches[0]; // query đã sort createdAt desc → mới nhất
        matchType = 'amount-fallback-same-user';
        console.log(
          `[SePay Webhook] ↩ Fallback theo số tiền (cùng user): ${payload.transferAmount.toLocaleString('vi-VN')}đ ` +
          `→ deposit #${candidate._id.toString().slice(-8).toUpperCase()} ` +
          `(user=${candidate.userId?.username}, ${amountMatches.length} yêu cầu cùng số tiền, chọn mới nhất) ` +
          `(SePay id=${sepayId})`
        );
      } else {
        console.warn(
          `[SePay Webhook] Ambiguous amount match: ${amountMatches.length} pending deposits cùng số tiền ` +
          `${payload.transferAmount.toLocaleString('vi-VN')}đ → KHÔNG tự approve (SePay id=${sepayId})`
        );
        await updateWebhookLog(logId, {
          processingStatus: 'ignored',
          processingNote:
            `Ambiguous amount match: ${amountMatches.length} pending deposits với số tiền ` +
            `${payload.transferAmount} (đề tạo trong ${AMOUNT_MATCH_WINDOW_MINUTES} phút) — cần admin xử lý tay`
        });
        notifyIgnored(payload, 'ambiguous_amount', {
          amount: payload.transferAmount,
          matchCount: amountMatches.length,
          depositIds: amountMatches.map((d) => d._id.toString()),
          matchType: 'amount-fallback',
        });
        return res.json({ success: true, ignored: 'ambiguous_amount' });
      }
    }
  }

  if (!candidate) {
    const parseDetail = describeMatch(matchType, parsed);

    console.warn(
      `[SePay Webhook] No matching pending deposit for ${parseDetail} via ${matchType} ` +
      `(SePay id=${sepayId}, gateway=${payload.gateway}, accountNumber=${payload.accountNumber})`
    );
    await updateWebhookLog(logId, {
      processingStatus: 'ignored',
      processingNote: `No matching pending deposit for ${parseDetail} (${matchType})`
    });
    // Nội dung không parse được → coi là 'unparseable_content', ngược lại là 'no_match'.
    const reason = parsed ? 'no_match' : 'unparseable_content';
    // Lưu ý: `typeof null === 'object'` nên phải check truthy trước khi đọc field.
    const parsedObj = parsed && typeof parsed === 'object' ? parsed : null;
    notifyIgnored(payload, reason, {
      parsedCode: typeof parsed === 'string'
        ? parsed
        : parsedObj?.type === 'scan-qr'
          ? parsedObj.code
          : null,
      parsedUsername: parsedObj && parsedObj.type !== 'scan-qr' ? parsedObj.username : null,
      parsedAmount: parsedObj && parsedObj.type !== 'scan-qr' ? parsedObj.amount : null,
      matchType,
    });
    return res.json({ success: true, ignored: reason });
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
    const matchDetail = describeMatch(matchType, parsed);

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
      (deposit.ipAddress ? `🌐 <b>IP tạo lệnh nạp:</b> <code>${deposit.ipAddress}</code>\n` : '') +
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
 *                                   'no_match' | 'user_inactive' | 'amount_mismatch' |
 *                                   'ambiguous_amount'
 * @param {Object} extra             Context thêm tùy theo reason:
 *   - unparseable_content: { content }
 *   - user_not_found:      { parsedUsername, parsedAmount, matchType }
 *   - no_match:            { parsedUsername?, parsedAmount?, parsedCode?, matchType }
 *   - user_inactive:       { depositId, username }
 *   - amount_mismatch:     { depositId, username, expectedAmount, receivedAmount, diff }
 *   - ambiguous_amount:    { amount, matchCount, depositIds, matchType }
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
      case 'ambiguous_amount':
        header = '⚠️ <b>BỎ QUA — NHIỀU DEPOSIT CÙNG SỐ TIỀN (SePay)</b>';
        suggestion =
          '⚠️ Không tìm được mã nạp, mà có nhiều yêu cầu nạp cùng số tiền.\n' +
          '   • Hệ thống KHÔNG tự duyệt để tránh cộng nhầm cho user khác.\n' +
          '   • Cần admin kiểm tra thủ công và duyệt yêu cầu nạp đúng user.';
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
          '   • Đã thử cả `content`, `description` và `code` của payload.\n' +
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
          `\n<b>Lý do:</b> Không parse được nội dung chuyển khoản — không match 6-digit code, BIDV format hay Techcombank format.`,
          `<b>Đã thử fallback theo số tiền:</b> không tìm được yêu cầu nạp pending nào khớp số tiền.`
        );
        break;      case 'ambiguous_amount':
        detailLines.push(
          `\n<b>Lý do:</b> Không tìm được mã nạp, mà có <b>${extra.matchCount || 'N/A'}</b> yêu cầu nạp pending cùng số tiền.`,
          `<b>Số tiền nhận:</b> ${formatVnd(extra.amount)}`,
          `<b>Deposit IDs:</b> <code>${(extra.depositIds || []).join(', ') || 'N/A'}</code>`,
          `<b>Match type:</b> <code>${extra.matchType || 'amount-fallback'}</code>`
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
