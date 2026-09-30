import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import SiteSetting from '../models/SiteSetting.js';
import { auth } from '../middleware/auth.js';
import { generateOTP, verifyOTP, getResendCooldown } from '../services/otpService.js';
import { sendOtpEmail } from '../services/emailSender.js';

const router = express.Router();

// Helper: tạo JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

// Helper: trả về thông tin user an toàn (không có password)
const safeUser = (user) => ({
  _id: user._id,
  username: user.username,
  fullName: user.fullName,
  phone: user.phone,
  balance: user.balance,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt
});

// POST /api/auth/register - Đăng ký tài khoản mới
router.post('/register', async (req, res) => {
  try {
    const { username, password, fullName, phone } = req.body;

    console.log(`[REGISTER] Attempt: username="${username}", fullName="${fullName}"`);

    // Validate cơ bản
    if (!username || !password || !fullName) {
      console.log('[REGISTER] Validation failed: missing required fields');
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });
    }

    // Kiểm tra username đã tồn tại
    const normalizedUsername = username.toLowerCase().trim();
    console.log(`[REGISTER] Checking if username exists: "${normalizedUsername}"`);
    
    const existingUser = await User.findOne({ username: normalizedUsername });
    if (existingUser) {
      console.log(`[REGISTER] Username already exists: "${normalizedUsername}" (id: ${existingUser._id})`);
      return res.status(400).json({ message: 'Tên đăng nhập đã được sử dụng' });
    }

    console.log(`[REGISTER] Username available, creating user...`);

    // Tạo user (pre-save hook sẽ hash password)
    const user = await User.create({
      username: normalizedUsername,
      password,
      fullName: fullName.trim(),
      phone: phone || ''
    });

    console.log(`[REGISTER] User created successfully: id=${user._id}, username="${user.username}"`);

    const token = generateToken(user._id);

    res.status(201).json({
      message: 'Đăng ký thành công',
      token,
      user: safeUser(user)
    });
  } catch (error) {
    console.error('[REGISTER] Error:', error);
    console.error('[REGISTER] Error details:', {
      code: error.code,
      codeName: error.codeName,
      message: error.message,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue
    });
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const value = error.keyValue ? error.keyValue[field] : 'unknown';
      console.error(`[REGISTER] Duplicate key error: field="${field}", value="${value}"`);
      return res.status(400).json({ message: 'Tên đăng nhập đã được sử dụng' });
    }
    if (error.name === 'ValidationError') {
      console.error('[REGISTER] Validation error:', error.message);
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// POST /api/auth/login - Đăng nhập
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Tài khoản đã bị khóa' });
    }

    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    const token = generateToken(user._id);

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: safeUser(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// GET /api/auth/me - Lấy thông tin user hiện tại
router.get('/me', auth, async (req, res) => {
  try {
    res.json(safeUser(req.user));
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// GET /api/auth/admin/otp-status - Cho Login page biết OTP có đang bật không
// Public (không cần auth) — chỉ trả boolean, không leak data nhạy cảm
router.get('/admin/otp-status', async (req, res) => {
  try {
    const setting = await SiteSetting.findOne({ key: 'admin_otp_enabled' });
    const enabled = !setting || setting.value !== 'false';
    res.json({ enabled });
  } catch (error) {
    console.error('[OTP-STATUS] Error:', error);
    res.json({ enabled: true });
  }
});

// ==================== ADMIN OTP AUTH ====================

// Email nhận OTP — cố định cho admin
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'phamlongfco2623@gmail.com';

// POST /api/auth/admin/send-otp — Gửi OTP đến email admin cố định
router.post('/admin/send-otp', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    const normalizedUsername = username.toLowerCase().trim();

    // Kiểm tra admin tồn tại và xác thực password
    const user = await User.findOne({ username: normalizedUsername, role: 'admin' });
    if (!user) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Tài khoản đã bị khóa' });
    }

    // Xác thực password trước khi gửi OTP
    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    // ── DEV BYPASS: nếu admin_otp_enabled=false thì trả token luôn ──
    const otpSetting = await SiteSetting.findOne({ key: 'admin_otp_enabled' });
    const otpBypassed = otpSetting && otpSetting.value === 'false';

    if (otpBypassed) {
      const token = generateToken(user._id);
      console.log(`[AUTH] ⚙️ OTP bypassed for admin ${normalizedUsername} (admin_otp_enabled=false)`);
      return res.json({
        message: 'Đăng nhập thành công (OTP bypassed for dev).',
        token,
        user: safeUser(user),
        bypassed: true,
      });
    }

    // Check resend cooldown
    const { canResend, waitSeconds } = getResendCooldown(normalizedUsername);
    if (!canResend) {
      return res.status(429).json({
        message: `Vui lòng đợi ${waitSeconds} giây trước khi gửi lại mã.`,
        waitSeconds,
      });
    }

    // Generate OTP
    const { otp, expiresAt } = generateOTP(normalizedUsername);

    // Gửi email qua EmailJS đến email admin cố định
    console.log(`\n[AUTH] 🔐 Bắt đầu gửi OTP cho admin: ${normalizedUsername}`);
    console.log(`[AUTH] 📧 Email đích: ${ADMIN_EMAIL}`);
    console.log(`[AUTH] 🔢 OTP: ${otp} (expires in 5 minutes)`);
    
    try {
      await sendOtpEmail(ADMIN_EMAIL, normalizedUsername, otp, 5);
      console.log(`[AUTH] ✅ Email OTP đã được gửi thành công`);
    } catch (emailError) {
      console.error(`[AUTH] ❌ GỬI EMAIL THẤT BẠI!`);
      console.error(`[AUTH] Error message: ${emailError.message}`);
      console.error(`[AUTH] Error stack:`, emailError.stack);
      
      // Log OTP vào console khi email fail (để test)
      console.log(`\n╔═══════════════════════════════════════╗`);
      console.log(`║  ⚠️  FALLBACK OTP (Email gửi thất bại) ║`);
      console.log(`╠═══════════════════════════════════════╣`);
      console.log(`║  Username: ${normalizedUsername.padEnd(25)} ║`);
      console.log(`║  OTP Code: ${otp.padEnd(25)} ║`);
      console.log(`║  Expires:  5 minutes ${' '.repeat(14)}║`);
      console.log(`╚═══════════════════════════════════════╝\n`);
      
      // Vẫn trả lỗi để user biết email không gửi được
      return res.status(500).json({ 
        message: 'Không thể gửi email OTP. Vui lòng kiểm tra cấu hình EmailJS hoặc xem console log để lấy OTP.',
        error: emailError.message 
      });
    }

    res.json({
      message: 'Mã OTP đã được gửi đến phamlongfco2623@gmail.com.',
      expiresInSeconds: Math.floor((expiresAt - Date.now()) / 1000),
    });
  } catch (error) {
    if (error.status === 429) {
      return res.status(429).json({ message: error.message });
    }
    console.error('[OTP] Send OTP error:', error);
    res.status(500).json({ message: 'Lỗi server khi gửi OTP', error: error.message });
  }
});

// POST /api/auth/admin/verify-otp — Xác minh OTP và trả JWT
router.post('/admin/verify-otp', async (req, res) => {
  try {
    const { username, otp } = req.body;

    if (!username || !otp) {
      return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập và mã OTP' });
    }

    const normalizedUsername = username.toLowerCase().trim();

    // Verify OTP
    const { valid, reason } = verifyOTP(normalizedUsername, otp);

    if (!valid) {
      return res.status(401).json({ message: reason });
    }

    // Fetch user after OTP validated
    const user = await User.findOne({ username: normalizedUsername, role: 'admin' });

    if (!user) {
      return res.status(401).json({ message: 'Tài khoản admin không tồn tại.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Tài khoản đã bị khóa.' });
    }

    // Generate JWT
    const token = generateToken(user._id);

    console.log(`[Admin OTP] ✅ ${normalizedUsername} logged in successfully`);

    res.json({
      message: 'Đăng nhập thành công!',
      token,
      user: safeUser(user),
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Lỗi server khi xác minh OTP', error: error.message });
  }
});

export default router;
