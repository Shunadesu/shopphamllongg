import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { FiUser, FiLock, FiEye, FiEyeOff, FiMail, FiArrowLeft, FiRefreshCw } from 'react-icons/fi';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  // Flow: 'username' → 'otp'
  const [step, setStep] = useState('username');
  const [username, setUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputRefs = useRef([]);

  // Countdown timer for OTP expiry (5 min)
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Cooldown timer for resend button (60s)
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // ─── Step 1: Gửi OTP ───────────────────────────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error('Vui lòng nhập tên đăng nhập');
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/admin/send-otp', {
        username: username.trim().toLowerCase(),
      });

      setCountdown(300); // 5 phút
      setResendCooldown(60); // 60s trước khi gửi lại
      setStep('otp');

      // Focus ô OTP đầu tiên
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);

      toast.success(data.message || 'Mã OTP đã được gửi đến phamlongfco2623@gmail.com.');
    } catch (error) {
      const msg = error.response?.data?.message || 'Không thể gửi mã OTP';
      toast.error(msg);
      if (error.response?.data?.waitSeconds) {
        setResendCooldown(error.response.data.waitSeconds);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Step 2: Xác minh OTP ──────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.trim().length !== 6) {
      toast.error('Vui lòng nhập đủ 6 chữ số của mã OTP');
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/admin/verify-otp', {
        username: username.trim().toLowerCase(),
        otp: otp.trim(),
      });

      login(data.user, data.token);
      toast.success(data.message || 'Đăng nhập thành công!');
      navigate('/');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Mã OTP không hợp lệ');
      setOtp('');
      otpInputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Gửi lại OTP ────────────────────────────────────────────────────
  const handleResend = async () => {
    setOtp('');
    setResendCooldown(60);
    try {
      const { data } = await api.post('/auth/admin/send-otp', {
        username: username.trim().toLowerCase(),
      });
      setCountdown(300);
      setResendCooldown(60);
      toast.success(data.message || 'Đã gửi lại mã OTP.');
    } catch (error) {
      const msg = error.response?.data?.message || 'Không thể gửi lại mã OTP';
      toast.error(msg);
      if (error.response?.data?.waitSeconds) {
        setResendCooldown(error.response.data.waitSeconds);
      }
    }
  };

  // ─── OTP input handling ───────────────────────────────────────────────
  const handleOtpChange = (index, value) => {
    // Chỉ cho nhập số
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = otp.split('');
    newOtp[index] = digit;
    const updated = newOtp.join('');
    setOtp(updated);

    // Auto-focus ô tiếp theo
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit khi đủ 6 số
    if (updated.length === 6) {
      setTimeout(() => {
        document.getElementById('otp-form')?.requestSubmit();
      }, 50);
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    setOtp(pasted);
    // Focus đến ô cuối cùng được điền
    const nextIndex = Math.min(pasted.length, 5);
    setTimeout(() => otpInputRefs.current[Math.min(pasted.length - 1, 5)]?.focus(), 0);
    if (pasted.length === 6) {
      setTimeout(() => document.getElementById('otp-form')?.requestSubmit(), 50);
    }
  };

  // ─── Quay lại bước nhập username ────────────────────────────────────
  const handleBack = () => {
    setStep('username');
    setOtp('');
    setCountdown(0);
    setResendCooldown(0);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/30 mb-4">
            {step === 'username' ? (
              <FiLock className="text-4xl text-cyan-400" />
            ) : (
              <FiMail className="text-4xl text-cyan-400" />
            )}
          </div>
          <h1 className="text-3xl font-bold text-slate-100 mb-2">
            Admin Panel
          </h1>
          <p className="text-slate-400">
            {step === 'username'
              ? 'Nhập tên đăng nhập để nhận mã OTP'
              : 'Nhập mã OTP đã được gửi qua email'}
          </p>
        </div>

        {/* Card */}
        <div className="card">
          {/* ── Step 1: Username ── */}
          {step === 'username' && (
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Tên đăng nhập
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <FiUser className="text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input-field pl-11"
                    placeholder="admin"
                    autoComplete="username"
                    required
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Mã xác minh sẽ được gửi đến phamlongfco2623@gmail.com.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <FiMail size={18} />
                )}
                {isLoading ? 'Đang gửi...' : 'Gửi mã xác minh'}
              </button>
            </form>
          )}

          {/* ── Step 2: OTP ── */}
          {step === 'otp' && (
            <form id="otp-form" onSubmit={handleVerifyOtp} className="space-y-5">
              {/* Masked email + countdown */}
              <div className="text-center mb-4">
                <p className="text-sm text-slate-400 mb-1">
                  Mã OTP đã gửi đến
                </p>
                <p className="text-cyan-400 font-medium flex items-center justify-center gap-2">
                  <FiMail size={16} />
                  phamlongfco2623@gmail.com
                </p>
                {countdown > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Mã hết hạn sau <span className="text-yellow-400 font-mono">{formatTime(countdown)}</span>
                  </p>
                )}
                {countdown === 0 && (
                  <p className="text-xs text-red-400 mt-1">Mã đã hết hạn — vui lòng gửi lại</p>
                )}
              </div>

              {/* OTP digit inputs */}
              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <input
                    key={i}
                    ref={(el) => (otpInputRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={otp[i] || ''}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-2xl font-bold bg-slate-800 border border-slate-600 rounded-lg text-cyan-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30 outline-none transition-all"
                  />
                ))}
              </div>

              {/* Hidden actual OTP input for form submit */}
              <input
                type="hidden"
                name="otp"
                value={otp}
              />

              {/* Actions row */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <FiArrowLeft size={16} />
                  Đổi tài khoản
                </button>

                <div className="flex-1" />

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || countdown === 0}
                  className="flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors disabled:text-slate-600 disabled:cursor-not-allowed"
                >
                  <FiRefreshCw size={14} className={resendCooldown > 0 ? 'animate-spin' : ''} />
                  {resendCooldown > 0
                    ? `Đợi ${resendCooldown}s`
                    : countdown === 0
                    ? 'Hết hạn — gửi lại'
                    : 'Gửi lại'}
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || otp.length !== 6}
                className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <FiLock size={18} />
                )}
                {isLoading ? 'Đang xác minh...' : 'Xác minh và đăng nhập'}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-slate-400 mt-6">
          © {new Date().getFullYear()} Shopphamlong. All rights reserved.
        </p>
      </div>
    </div>
  );
}
