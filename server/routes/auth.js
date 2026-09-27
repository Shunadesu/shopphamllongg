import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
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

// ==================== ADMIN OTP AUTH ====================

// Email nhận OTP — cố định cho admin
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'phamlongfco2623@gmail.com';

// POST /api/auth/admin/send-otp — Gửi OTP đến email admin cố định
router.post('/admin/send-otp', async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập' });
    }

    const normalizedUsername = username.toLowerCase().trim();

    // Vẫn kiểm tra admin tồn tại để tránh brute-force
    const user = await User.findOne({ username: normalizedUsername, role: 'admin' });
    if (!user) {
      // Không tiết lộ user có tồn tại hay không
      return res.status(200).json({
        message: 'Nếu tài khoản tồn tại, mã OTP đã được gửi đến phamlongfco2623@gmail.com.',
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
    try {
      await sendOtpEmail(ADMIN_EMAIL, normalizedUsername, otp, 5);
    } catch (emailError) {
      console.error('[OTP] Email send failed:', emailError.message);
      // Vẫn trả thành công để tránh brute-force
      console.log(`[OTP] ⚠️  Email failed for ${normalizedUsername} to ${ADMIN_EMAIL}: ${emailError.message}`);
      console.log(`[OTP] OTP for ${normalizedUsername}: ${otp}`); // TODO: remove in production
    }

    res.json({
      message: 'Mã OTP đã được gửi đến phamlongfco2623@gmail.com.',
      expiresInSeconds: Math.floor((expiresAt - Date.now()) / 1000),
    });
  } catch (error) {
    if (error.status === 429) {
      return res.status(429).json({ message: error.message });
    }
    console.error('Send OTP error:', error);
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
