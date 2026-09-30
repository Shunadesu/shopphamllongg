import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { FiCode, FiToggleRight, FiToggleLeft, FiAlertTriangle, FiCheckCircle, FiXCircle } from 'react-icons/fi';

export default function DevTools() {
  const queryClient = useQueryClient();

  // Fetch dev settings
  const { data: devSettings, isLoading } = useQuery({
    queryKey: ['dev-settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/dev/settings');
      return data;
    },
  });

  // Toggle admin_otp_enabled
  const toggleOtp = useMutation({
    mutationFn: async (newValue) => {
      const { data } = await api.put('/admin/dev/settings', {
        admin_otp_enabled: newValue,
      });
      return data;
    },
    onSuccess: (data, newValue) => {
      queryClient.invalidateQueries(['dev-settings']);
      toast.success(
        newValue === 'false'
          ? 'Đã TẮT gửi OTP — login chỉ cần username + password'
          : 'Đã BẬT gửi OTP — login sẽ gửi mã qua email'
      );
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Cập nhật thất bại');
    },
  });

  const handleToggleOtp = () => {
    if (toggleOtp.isPending) return;
    const current = devSettings?.admin_otp_enabled ?? 'true';
    const next = current === 'true' ? 'false' : 'true';
    toggleOtp.mutate(next);
  };

  const otpEnabled = devSettings?.admin_otp_enabled !== 'false';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
          <FiCode className="text-amber-400" />
          Dev Tools
        </h1>
        <p className="text-slate-400 mt-1">
          Công cụ dành cho nhà phát triển — bật/tắt các tính năng nội bộ để test
        </p>
      </div>

      {/* Warning banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
        <FiAlertTriangle className="text-amber-400 mt-0.5 flex-shrink-0" size={20} />
        <div>
          <p className="text-amber-400 font-medium">Trang dành cho phát triển</p>
          <p className="text-slate-400 text-sm mt-1">
            Các toggle ở đây thay đổi hành vi của hệ thống. Nhớ bật lại về trạng thái mặc định trước khi lên production.
          </p>
        </div>
      </div>

      {/* OTP toggle card */}
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-lg font-semibold text-slate-100">
                Gửi OTP khi đăng nhập admin
              </h2>
              {isLoading ? (
                <span className="badge">Đang tải…</span>
              ) : otpEnabled ? (
                <span className="badge badge-success inline-flex items-center gap-1">
                  <FiCheckCircle size={12} />
                  Đang BẬT
                </span>
              ) : (
                <span className="badge badge-danger inline-flex items-center gap-1">
                  <FiXCircle size={12} />
                  Đang TẮT
                </span>
              )}
            </div>

            <p className="text-slate-400 text-sm mb-3">
              Khi <strong className="text-cyan-400">BẬT</strong>: sau khi nhập đúng username + password, hệ thống
              sẽ gửi mã OTP 6 số qua email <code className="text-cyan-400">phamlongfco2623@gmail.com</code>.
            </p>
            <p className="text-slate-400 text-sm">
              Khi <strong className="text-amber-400">TẮT</strong>: đăng nhập chỉ cần username + password, bỏ qua
              hoàn toàn bước OTP — phù hợp để test nhanh các tính năng khác.
            </p>
          </div>

          {/* Toggle button */}
          <button
            type="button"
            onClick={handleToggleOtp}
            disabled={isLoading || toggleOtp.isPending}
            className={`
              relative inline-flex items-center justify-center
              w-16 h-9 rounded-full transition-all duration-200 flex-shrink-0
              ${otpEnabled ? 'bg-cyan-500 hover:bg-cyan-600' : 'bg-slate-700 hover:bg-slate-600'}
              disabled:opacity-50 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-cyan-400/40
            `}
            title={otpEnabled ? 'Tắt OTP' : 'Bật OTP'}
          >
            <span
              className={`
                absolute top-1 w-7 h-7 bg-white rounded-full shadow-md
                transition-transform duration-200
                ${otpEnabled ? 'translate-x-4' : 'translate-x-1'}
              `}
            />
            <span className="sr-only">Toggle OTP</span>
          </button>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-700">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Key lưu trong DB:{' '}
              <code className="text-slate-400">SiteSetting[admin_otp_enabled]</code>
            </span>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries(['dev-settings'])}
              className="text-slate-400 hover:text-cyan-400 transition-colors"
            >
              ↻ Tải lại
            </button>
          </div>
        </div>
      </div>

      {/* Placeholder for future dev tools */}
      <div className="card border-dashed border-slate-700">
        <div className="text-center py-6">
          <FiCode className="mx-auto text-slate-600 mb-2" size={32} />
          <p className="text-slate-500 text-sm">
            Các dev tool khác sẽ được thêm vào đây trong tương lai
          </p>
        </div>
      </div>
    </div>
  );
}
