/**
 * Email Sender Service — gửi email qua EmailJS REST API
 * Không cần SDK, chỉ dùng fetch đến EmailJS public API
 *
 * Biến môi trường cần thiết:
 *   EMAILJS_SERVICE_ID   — Service ID từ EmailJS dashboard
 *   EMAILJS_TEMPLATE_ID  — Template ID từ EmailJS dashboard
 *   EMAILJS_USER_ID      — User ID (public key) từ EmailJS dashboard
 *   ADMIN_EMAIL          — Email nhận (to_address)
 */

const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

/**
 * Gửi email OTP qua EmailJS
 * @param {string} toEmail   — Email người nhận
 * @param {string} toName    — Tên người nhận (hiển thị trong email)
 * @param {string} otpCode   — Mã OTP 6 chữ số
 * @param {number} ttlMinutes — Thời hạn OTP (mặc định 5 phút)
 * @returns {Promise<void>}
 */
async function sendOtpEmail(toEmail, toName, otpCode, ttlMinutes = 5) {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const userId = process.env.EMAILJS_USER_ID;

  if (!serviceId || !templateId || !userId) {
    throw new Error(
      'Thiếu cấu hình EmailJS. Vui lòng kiểm tra EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_USER_ID trong .env'
    );
  }

  const payload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: userId,
    template_params: {
      to_email: toEmail,
      to_name: toName,
      otp_code: otpCode,
      ttl_minutes: ttlMinutes,
      year: new Date().getFullYear(),
    },
  };

  const response = await fetch(EMAILJS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`EmailJS API error: ${response.status} — ${text}`);
  }

  console.log(`[EmailSender] ✅ OTP email sent to ${toEmail}`);
}

/**
 * Fallback: Gửi email đơn giản qua fetch (không qua template)
 * Dùng khi chưa setup EmailJS template — gửi raw HTML email
 * @param {string} toEmail
 * @param {string} toName
 * @param {string} otpCode
 */
async function sendOtpEmailFallback(toEmail, toName, otpCode) {
  const userId = process.env.EMAILJS_USER_ID;

  if (!userId) {
    throw new Error('Thiếu EMAILJS_USER_ID trong .env');
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f172a; color: #e2e8f0;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #22d3ee; font-size: 24px; margin: 0;">🛡️ Shopphamlong Admin</h1>
        <p style="color: #94a3b8; margin: 8px 0 0;">Xác minh đăng nhập</p>
      </div>
      <div style="background: #1e293b; border-radius: 12px; padding: 32px; text-align: center; border: 1px solid #334155;">
        <p style="margin: 0 0 16px; color: #cbd5e1;">Xin chào <strong style="color: #22d3ee;">${toName}</strong>,</p>
        <p style="margin: 0 0 24px; color: #94a3b8;">Mã xác minh của bạn là:</p>
        <div style="background: #0f172a; border: 2px dashed #22d3ee; border-radius: 8px; padding: 16px 32px; display: inline-block; margin-bottom: 24px;">
          <span style="font-size: 36px; font-weight: bold; color: #22d3ee; letter-spacing: 8px;">${otpCode}</span>
        </div>
        <p style="margin: 0 0 8px; color: #94a3b8; font-size: 14px;">⏱️ Mã có hiệu lực trong <strong style="color: #fbbf24;">5 phút</strong></p>
        <p style="margin: 0; color: #64748b; font-size: 12px;">Nếu bạn không yêu cầu đăng nhập, vui lòng bỏ qua email này.</p>
      </div>
      <div style="text-align: center; margin-top: 24px; color: #475569; font-size: 12px;">
        © ${new Date().getFullYear()} Shopphamlong. All rights reserved.
      </div>
    </div>
  `;

  const payload = {
    service_id: process.env.EMAILJS_SERVICE_ID || 'placeholder',
    template_id: process.env.EMAILJS_TEMPLATE_ID || 'placeholder',
    user_id: userId,
    template_params: {
      to_email: toEmail,
      to_name: toName,
      otp_code: otpCode,
      from_name: 'Shopphamlong Admin',
      reply_to: 'noreply@shopphamlong.com',
    },
  };

  // Thử gửi qua EmailJS
  const response = await fetch(EMAILJS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`EmailJS API error: ${response.status} — ${text}`);
  }

  console.log(`[EmailSender] ✅ OTP email (fallback) sent to ${toEmail}`);
}

export { sendOtpEmail, sendOtpEmailFallback };
