import { Bot } from 'node-telegram-bot-api';
import { run } from 'node-telegram-bot-api/node';

import DepositRequest from '../models/DepositRequest.js';
import User from '../models/User.js';
import BankAccount from '../models/BankAccount.js';
import { calculateSpinsAwarded } from '../utils/spinLogic.js';

let bot = null;
let adminChatId = null;

/**
 * Escape HTML để an toàn khi nhét vào caption/text Telegram
 * (tránh lỗi parse khi username/title chứa ký tự đặc biệt như &, <, >)
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Khởi tạo Telegram bot
 */
export async function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !adminChatId) {
    console.warn('⚠️  Telegram bot not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID in .env');
    return;
  }

  try {
    bot = new Bot(token);
    
    // Handle /start command
    bot.command('start', async (ctx) => {
      const chatId = ctx.chat.id;
      const username = ctx.from?.username || ctx.from?.first_name || 'User';
      
      const welcomeMessage = `
👋 Xin chào <b>${username}</b>!

🤖 Đây là bot thông báo nạp tiền của <b>Shop Luân Huỳnh</b>

${chatId.toString() === adminChatId ? '✅ Bạn là Admin - Bạn sẽ nhận được thông báo khi có yêu cầu nạp tiền mới!' : '⚠️ Bot này chỉ dành cho Admin.'}

📌 <b>Chat ID của bạn:</b> <code>${chatId}</code>

${chatId.toString() !== adminChatId ? '\n💡 Nếu bạn là Admin, hãy cập nhật TELEGRAM_ADMIN_CHAT_ID trong file .env với Chat ID trên.' : ''}
      `.trim();

      await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
      
      console.log(`📱 User ${username} (${chatId}) started bot`);
    });
    
    // Handle callback queries from inline buttons
    bot.on('callback_query', handleCallbackQuery);

    // Error handler
    bot.catch((err) => {
      console.error('❌ Telegram bot error:', err);
    });

    // Start polling in background (non-blocking)
    bot.startPolling();
    
    console.log('✅ Telegram bot initialized and polling started');
  } catch (error) {
    console.error('❌ Failed to initialize Telegram bot:', error.message);
  }
}

/**
 * Gửi thông báo deposit mới đến admin
 */
export async function sendDepositNotification(deposit) {
  if (!bot || !adminChatId) {
    return; // Bot not configured, skip silently
  }

  try {
    // Populate user and bank data
    const depositData = await DepositRequest.findById(deposit._id)
      .populate('userId', 'username fullName email phone')
      .populate('bankAccountId', 'bankName accountName accountNumber');

    if (!depositData) {
      console.error('Deposit not found:', deposit._id);
      return;
    }

    const user = depositData.userId;
    const bank = depositData.bankAccountId;
    const isCard = depositData.depositMethod === 'card';

    // Format message
    const message = isCard
      ? `
🃏 <b>YÊU CẦU NẠP THẺ CÀO MỚI</b>

━━━━━━━━━━━━━━━━━━
📌 <b>Mã GD:</b> <code>#${depositData._id.toString().slice(-8).toUpperCase()}</code>

👤 <b>Người dùng:</b>
   • Username: <b>${user?.username || 'N/A'}</b>
   • Họ tên: ${user?.fullName || 'N/A'}
   • SĐT: ${user?.phone || 'N/A'}

💳 <b>Loại thẻ:</b> <b>${(depositData.cardType || '').toUpperCase()}</b>

🎫 <b>Số serial:</b> <code>${depositData.cardSerial || 'N/A'}</code>
🔑 <b>Mã thẻ:</b> <code>${depositData.cardCode || 'N/A'}</code>

💰 <b>Mệnh giá thẻ:</b> <b>${(depositData.faceAmount ?? depositData.amount).toLocaleString('vi-VN')}đ</b>
📈 <b>Tỷ lệ quy đổi:</b> <b>${depositData.exchangeRate ?? '?'}%</b>
💵 <b>User nhận được:</b> <b>${depositData.receivedAmount?.toLocaleString('vi-VN') || depositData.amount?.toLocaleString('vi-VN')}đ</b>

⏰ <b>Thời gian:</b> ${new Date(depositData.createdAt).toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })}
━━━━━━━━━━━━━━━━━━
      `.trim()
      : `
🔔 <b>YÊU CẦU NẠP TIỀN MỚI</b>

━━━━━━━━━━━━━━━━━━
📌 <b>Mã GD:</b> <code>#${depositData._id.toString().slice(-8).toUpperCase()}</code>

👤 <b>Người dùng:</b>
   • Username: <b>${user?.username || 'N/A'}</b>
   • Họ tên: ${user?.fullName || 'N/A'}


💰 <b>Số tiền:</b> <b>${depositData.amount.toLocaleString('vi-VN')}đ</b>

🏦 <b>Ngân hàng nhận:</b>
   • ${bank?.bankName || 'N/A'}
   • ${bank?.accountName || 'N/A'}
   • STK: <code>${bank?.accountNumber || 'N/A'}</code>

📝 <b>Nội dung CK:</b> <code>${depositData.transferNote || 'N/A'}</code>

⏰ <b>Thời gian:</b> ${new Date(depositData.createdAt).toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })}
━━━━━━━━━━━━━━━━━━
      `.trim();

    // Inline keyboard with approve/reject buttons
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ Xác nhận',
            callback_data: `approve_${depositData._id}`
          },
          {
            text: '❌ Từ chối',
            callback_data: `reject_${depositData._id}`
          }
        ]
      ]
    };

    await bot.api.sendMessage({
      chat_id: adminChatId,
      text: message,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    console.log(`✅ Telegram notification sent for ${isCard ? 'card' : 'bank'} deposit:`, depositData._id);
  } catch (error) {
    console.error('❌ Failed to send Telegram notification:', error.message);
  }
}

/**
 * Xử lý callback query từ inline buttons
 */
async function handleCallbackQuery(ctx) {
  const chatId = ctx.chat.id;
  const messageId = ctx.callbackQuery.message.message_id;
  const callbackData = ctx.callbackQuery.data;

  // Verify it's from admin chat
  if (chatId.toString() !== adminChatId) {
    await ctx.answerCallbackQuery({
      text: '❌ Unauthorized',
      show_alert: true
    });
    return;
  }

  try {
    // Parse callback data: "approve_depositId" or "reject_depositId"
    const [action, depositId] = callbackData.split('_');

    if (!['approve', 'reject'].includes(action) || !depositId) {
      await ctx.answerCallbackQuery({
        text: '❌ Invalid action',
        show_alert: true
      });
      return;
    }

    // Find deposit
    const deposit = await DepositRequest.findById(depositId)
      .populate('userId', 'username balance');

    if (!deposit) {
      await ctx.answerCallbackQuery({
        text: '❌ Không tìm thấy yêu cầu nạp tiền',
        show_alert: true
      });
      return;
    }

    // Check if already processed
    if (deposit.status !== 'pending') {
      await ctx.answerCallbackQuery({
        text: `⚠️ Yêu cầu này đã được xử lý (${deposit.status})`,
        show_alert: true
      });
      return;
    }

    // Process deposit
    if (action === 'approve') {
      // Approve and add balance to user
      deposit.status = 'approved';
      deposit.processedAt = new Date();
      
      const user = await User.findById(deposit.userId);
      let spinsAwarded = 0;
      
      if (user) {
        // Award spins based on cumulative deposit (mỗi 200k = 1 lượt, cộng dồn)
        const prevTotalDeposited = user.totalDeposited || 0;
        const newTotalDeposited = prevTotalDeposited + deposit.amount;
        spinsAwarded = calculateSpinsAwarded(prevTotalDeposited, newTotalDeposited);
        
        // Update user (same way as admin panel)
        user.balance += deposit.amount;
        user.totalDeposited = newTotalDeposited;
        user.spins = (user.spins || 0) + spinsAwarded;
        await user.save();
        
        console.log(`✅ Deposit ${depositId} approved via Telegram - User received ${spinsAwarded} spins (balance: ${user.balance}, totalDeposited: ${user.totalDeposited}, spins: ${user.spins})`);
      }

      await deposit.save();

      // Update message with spin info
      const updatedMessage = ctx.callbackQuery.message.text + `\n\n✅ <b>ĐÃ DUYỆT</b>\n⏰ ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\n👤 Xử lý từ Telegram${spinsAwarded > 0 ? `\n🎡 Nhận thêm: <b>${spinsAwarded} lượt quay</b>` : ''}`;
      
      await bot.api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: updatedMessage,
        parse_mode: 'HTML'
      });

      await ctx.answerCallbackQuery({
        text: '✅ Đã duyệt yêu cầu nạp tiền'
      });

    } else if (action === 'reject') {
      // Reject deposit
      deposit.status = 'rejected';
      deposit.processedAt = new Date();
      deposit.adminNote = 'Từ chối từ Telegram';
      await deposit.save();

      // Update message
      const updatedMessage = ctx.callbackQuery.message.text + `\n\n❌ <b>ĐÃ TỪ CHỐI</b>\n⏰ ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\n👤 Xử lý từ Telegram`;
      
      await bot.api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: updatedMessage,
        parse_mode: 'HTML'
      });

      await ctx.answerCallbackQuery({
        text: '❌ Đã từ chối yêu cầu nạp tiền'
      });

      console.log(`❌ Deposit ${depositId} rejected via Telegram`);
    }

  } catch (error) {
    console.error('❌ Error handling callback query:', error);
    await ctx.answerCallbackQuery({
      text: `❌ Lỗi: ${error.message}`,
      show_alert: true
    });
  }
}

/**
 * Gửi thông báo đơn hàng mua thành công đến admin Telegram.
 * Mỗi account trong đơn gửi 1 ảnh (ảnh đầu tiên) kèm caption chứa mã tài khoản.
 * Nếu account không có ảnh hoặc Telegram không fetch được ảnh → fallback text.
 *
 * @param {Object} params
 * @param {Object} params.order - Order doc (đã populate items.accountId + userId)
 *                                hoặc plain object từ .lean()
 * @param {string} [params.publicBaseUrl] - Base URL build URL tuyệt đối cho ảnh
 *                                          (mặc định lấy từ PUBLIC_BASE_URL env,
 *                                          fallback https://phamlongfco.online)
 */
export async function sendPurchaseNotification({ order, publicBaseUrl } = {}) {
  if (!bot || !adminChatId) return;
  if (!order || !Array.isArray(order.items) || order.items.length === 0) return;

  const baseUrl = publicBaseUrl
    || process.env.PUBLIC_BASE_URL
    || 'https://phamlongfco.online';

  try {
    // === Resolve buyer info ===
    let userInfo = null;
    const rawUser = order.userId;
    if (rawUser && typeof rawUser === 'object' && (rawUser.username || rawUser.fullName)) {
      // đã populate
      userInfo = rawUser;
    } else if (rawUser) {
      // chưa populate → fetch
      try {
        userInfo = await User.findById(rawUser)
          .select('username fullName email phone')
          .lean();
      } catch (e) {
        console.warn('[Telegram] Cannot load buyer info:', e.message);
      }
    }

    const buyerLine = userInfo
      ? `👤 Người mua: <b>${escapeHtml(userInfo.username)}</b>` +
        (userInfo.fullName ? ` <i>(${escapeHtml(userInfo.fullName)})</i>` : '')
      : '👤 Người mua: <i>không rõ</i>';

    const orderLine = `🧾 Mã đơn: <code>${escapeHtml(order.orderNumber)}</code>`;
    const totalLine = `💵 Tổng tiền: <b>${(order.totalAmount || 0).toLocaleString('vi-VN')}đ</b>`;
    const timeLine = `⏰ ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;

    // === Gửi header trước ===
    const header = [
      '🛒 <b>ĐƠN HÀNG MỚI</b>',
      '━━━━━━━━━━━━━━━━━━',
      orderLine,
      buyerLine,
      totalLine,
      `📦 Số tài khoản: <b>${order.items.length}</b>`,
      timeLine,
    ].join('\n');

    await bot.api.sendMessage({
      chat_id: adminChatId,
      text: header,
      parse_mode: 'HTML',
    });

    // === Mỗi item: gửi 1 photo + caption ===
    const totalItems = order.items.length;
    for (let i = 0; i < totalItems; i++) {
      const item = order.items[i];
      const acc = item.accountId;
      if (!acc) continue;

      const codeLine = `🔖 Mã tài khoản: <b>${escapeHtml(acc.code || '(chưa có mã)')}</b>`;
      const titleLine = acc.title ? `📦 Tên: ${escapeHtml(acc.title)}` : '';
      const priceLine = `💰 Giá: <b>${(item.price || 0).toLocaleString('vi-VN')}đ</b>`;
      const idxLine = totalItems > 1 ? `\n<i>(${i + 1}/${totalItems})</i>` : '';

      const caption = [codeLine, titleLine, priceLine, idxLine]
        .filter(Boolean)
        .join('\n');

      // Telegram caption giới hạn 1024 chars — cắt nếu vượt
      const finalCaption = caption.length > 1024 ? caption.slice(0, 1020) + '...' : caption;

      const firstImage = Array.isArray(acc.images) && acc.images.length > 0
        ? acc.images[0]
        : null;

      let sentAsPhoto = false;

      if (firstImage) {
        const photoUrl = firstImage.startsWith('http')
          ? firstImage
          : `${baseUrl.replace(/\/+$/, '')}${firstImage.startsWith('/') ? '' : '/'}${firstImage}`;

        try {
          await bot.api.sendPhoto({
            chat_id: adminChatId,
            photo: photoUrl,
            caption: finalCaption,
            parse_mode: 'HTML',
          });
          sentAsPhoto = true;
        } catch (photoErr) {
          // Telegram không fetch được ảnh → fallback text
          console.warn(
            `[Telegram] sendPhoto failed for order ${order.orderNumber} item ${i}:`,
            photoErr.message
          );
        }
      }

      if (!sentAsPhoto) {
        await bot.api.sendMessage({
          chat_id: adminChatId,
          text: finalCaption,
          parse_mode: 'HTML',
        });
      }

      // Tránh flood limit (30 msg/s nhưng an toàn với 50ms gap)
      if (i < totalItems - 1) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    console.log(`✅ Telegram purchase notification sent for order ${order.orderNumber}`);
  } catch (error) {
    console.error('❌ Failed to send Telegram purchase notification:', error.message);
  }
}

export default bot;
