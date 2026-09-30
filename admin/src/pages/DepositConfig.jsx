import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  FiSave,
  FiPercent,
  FiPhone,
  FiCheckCircle,
  FiXCircle,
  FiInfo,
} from 'react-icons/fi';
import { FormSkeleton } from '../components/SkeletonLoader';

/**
 * Trang cấu hình tỷ lệ quy đổi cho nạp thẻ cào.
 *
 * Quản lý 4 SiteSetting keys:
 *   - card_enabled          (boolean 'true' | 'false') — bật/tắt tính năng
 *   - card_rate_viettel     (number 0–100, %) — user nhận = mệnh giá * value / 100
 *   - card_rate_mobifone    (number 0–100, %)
 *   - card_rate_vinaphone   (number 0–100, %)
 *
 * Nạp ATM không cấu hình ở đây — luôn 1:1 (100%).
 */

const DEFAULT_RATES = {
  card_enabled: 'true',
  card_rate_viettel: '80',
  card_rate_mobifone: '75',
  card_rate_vinaphone: '75',
};

const CARD_TYPES = [
  {
    key: 'card_rate_viettel',
    label: 'Viettel',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/30',
  },
  {
    key: 'card_rate_mobifone',
    label: 'Mobifone',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/30',
  },
  {
    key: 'card_rate_vinaphone',
    label: 'Vinaphone',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/30',
  },
];

// Tính số tiền user nhận được từ 1 mệnh giá mẫu 100K (chỉ để admin xem nhanh).
function previewFor(faceAmount, ratePercent) {
  return Math.round((faceAmount * ratePercent) / 100);
}

export default function DepositConfig() {
  const queryClient = useQueryClient();

  // ── Fetch settings (admin auth) ──────────────────────────────────────────
  const { data: settingsArr, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/settings');
      return data;
    },
  });

  // SiteSetting.find() trả về mảng các doc {key, value, type, description}.
  // Quy đổi sang object {key: value} để dễ thao tác.
  const settingsMap = (settingsArr || []).reduce((acc, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {});

  // ── Form state ───────────────────────────────────────────────────────────
  const [cardEnabled, setCardEnabled] = useState(DEFAULT_RATES.card_enabled);
  const [rates, setRates] = useState({
    card_rate_viettel: DEFAULT_RATES.card_rate_viettel,
    card_rate_mobifone: DEFAULT_RATES.card_rate_mobifone,
    card_rate_vinaphone: DEFAULT_RATES.card_rate_vinaphone,
  });

  // Khởi tạo form từ settings khi load xong
  useEffect(() => {
    if (!settingsArr) return;
    setCardEnabled(settingsMap.card_enabled ?? DEFAULT_RATES.card_enabled);
    setRates({
      card_rate_viettel: settingsMap.card_rate_viettel ?? DEFAULT_RATES.card_rate_viettel,
      card_rate_mobifone: settingsMap.card_rate_mobifone ?? DEFAULT_RATES.card_rate_mobifone,
      card_rate_vinaphone: settingsMap.card_rate_vinaphone ?? DEFAULT_RATES.card_rate_vinaphone,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsArr]);

  // ── Mutation: lưu tất cả 4 key cùng lúc ─────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () =>
      api.put('/admin/settings', {
        card_enabled: cardEnabled,
        card_rate_viettel: String(parseInt(rates.card_rate_viettel, 10) || 0),
        card_rate_mobifone: String(parseInt(rates.card_rate_mobifone, 10) || 0),
        card_rate_vinaphone: String(parseInt(rates.card_rate_vinaphone, 10) || 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-settings']);
      queryClient.invalidateQueries(['settings']);
      toast.success('Đã lưu cấu hình nạp thẻ');

      // Bắn broadcast để frontend tab khác (và admin panel) refetch settings
      const ts = Date.now().toString();
      try {
        const bc = new BroadcastChannel('settings-updated');
        bc.postMessage({ type: 'settings-updated', ts });
        bc.close();
      } catch (_) {}
      localStorage.setItem('settings-updated', ts);
      window.dispatchEvent(new Event('settings-updated'));
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate: mỗi rate phải trong [0, 100]
    for (const t of CARD_TYPES) {
      const v = parseInt(rates[t.key], 10);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        toast.error(`Tỷ lệ ${t.label} phải nằm trong khoảng 0–100%`);
        return;
      }
    }

    saveMutation.mutate();
  };

  const updateRate = (key, value) => {
    // Chỉ cho nhập số nguyên, kẹp 0–100
    const cleaned = String(value).replace(/[^0-9]/g, '');
    const n = Math.min(100, Math.max(0, parseInt(cleaned, 10) || 0));
    setRates((s) => ({ ...s, [key]: String(n) }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-9 bg-slate-700 rounded w-72 animate-pulse" />
          <div className="h-5 bg-slate-800 rounded w-96 mt-2 animate-pulse" />
        </div>
        <FormSkeleton />
      </div>
    );
  }

  const isEnabled = cardEnabled === 'true';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
          <FiPercent className="text-cyan-400" />
          Cấu hình nạp tiền
        </h1>
        <p className="text-slate-400 mt-1">
          Tỷ lệ quy đổi thẻ cào và bật/tắt tính năng nạp thẻ.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card: bật/tắt nạp thẻ cào */}
        <div className="card">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <FiPhone />
                Nạp thẻ cào
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Tắt để tạm ngưng tính năng nạp thẻ cào — user vẫn nạp được qua ngân hàng.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCardEnabled(isEnabled ? 'false' : 'true')}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                isEnabled ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
              aria-label={isEnabled ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật'}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="mt-3">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border ${
                isEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/15 border-red-500/30 text-red-300'
              }`}
            >
              {isEnabled ? <FiCheckCircle /> : <FiXCircle />}
              {isEnabled ? 'Đang bật' : 'Đang tắt'}
            </span>
          </div>
        </div>

        {/* Card: tỷ lệ quy đổi */}
        <div className="card">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <FiPercent className="text-amber-400" />
                Tỷ lệ quy đổi thẻ cào
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Nhập số phần trăm user nhận được khi nạp thẻ (0–100%). VD: 80 nghĩa là thẻ 100K → user nhận 80K.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CARD_TYPES.map((t) => {
              const rate = parseInt(rates[t.key], 10) || 0;
              const faceSample = 100000;
              const receivedSample = previewFor(faceSample, rate);
              return (
                <div key={t.key} className={`p-4 rounded-xl border ${t.bg}`}>
                  <label className={`block font-bold text-sm mb-2 ${t.color}`}>
                    {t.label}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={rates[t.key]}
                      onChange={(e) => updateRate(t.key, e.target.value)}
                      className="w-full h-12 pr-12 pl-4 text-2xl font-black text-center bg-slate-900 border-2 border-slate-700 rounded-lg focus:border-cyan-500 focus:ring-0 text-white transition-colors"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                      %
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={rate}
                    onChange={(e) => updateRate(t.key, e.target.value)}
                    className="w-full mt-3 accent-cyan-500"
                  />
                  <div className="mt-3 px-3 py-2 bg-slate-900/60 rounded-md border border-slate-800">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide">
                      Mệnh giá 100,000đ
                    </p>
                    <p className="font-bold text-slate-100">
                      User nhận:{' '}
                      <span className="text-cyan-400">
                        {receivedSample.toLocaleString('vi-VN')}đ
                      </span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-3 bg-slate-900/50 border border-slate-800 rounded-lg flex items-start gap-2">
            <FiInfo className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-400 space-y-1">
              <p>
                • Tỷ lệ áp dụng ngay khi user gửi yêu cầu nạp thẻ và được lưu lại cùng giao dịch (audit).
              </p>
              <p>
                • Thay đổi tỷ lệ <strong>không ảnh hưởng</strong> các yêu cầu đã gửi trước đó.
              </p>
              <p>
                • Nạp chuyển khoản ATM <strong>luôn nhận 100%</strong> giá trị (không qua bảng này).
              </p>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <FiSave />
            {saveMutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
          <span className="text-xs text-slate-400">
            Frontend sẽ tự động cập nhật bảng tỷ lệ trong vài giây.
          </span>
        </div>
      </form>
    </div>
  );
}