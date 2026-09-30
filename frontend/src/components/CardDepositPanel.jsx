import { useState, useEffect } from 'react';
import { FiCreditCard, FiHash, FiKey, FiAlertCircle, FiCheck, FiPhone, FiPercent } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { useDepositStore } from '../store/data/depositStore';
import { useSettingsStore } from '../store/data/settingsStore';

const CARD_TYPES = [
  { value: '', label: 'Chọn loại thẻ', disabled: true },
  { value: 'viettel', label: 'Viettel', color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30' },
  { value: 'mobifone', label: 'Mobifone', color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/30' },
  { value: 'vinaphone', label: 'Vinaphone', color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/30' },
];

const AMOUNTS = [
  { value: 0, label: 'Chọn mệnh giá', disabled: true },
  { value: 10000, label: '10,000đ' },
  { value: 20000, label: '20,000đ' },
  { value: 30000, label: '30,000đ' },
  { value: 50000, label: '50,000đ' },
  { value: 100000, label: '100,000đ' },
  { value: 200000, label: '200,000đ' },
  { value: 300000, label: '300,000đ' },
  { value: 500000, label: '500,000đ' },
];

const DEFAULT_RATES = { viettel: 80, mobifone: 75, vinaphone: 75 };

export default function CardDepositPanel() {
  const createCardDeposit = useDepositStore((s) => s.createCardDeposit);
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  const [cardType, setCardType] = useState('');
  const [amount, setAmount] = useState(0);
  const [cardSerial, setCardSerial] = useState('');
  const [cardCode, setCardCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Đảm bảo settings đã được fetch (dù cache có thể stale)
  useEffect(() => {
    if (!settings) {
      fetchSettings(true).catch(() => {});
    }
  }, [settings, fetchSettings]);

  // Đọc tỷ lệ từ settings; fallback mặc định nếu admin chưa cấu hình
  const parseRate = (key, fallback) => {
    const v = parseInt(settings?.[key], 10);
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : fallback;
  };
  const rates = {
    viettel: parseRate('card_rate_viettel', DEFAULT_RATES.viettel),
    mobifone: parseRate('card_rate_mobifone', DEFAULT_RATES.mobifone),
    vinaphone: parseRate('card_rate_vinaphone', DEFAULT_RATES.vinaphone),
  };
  const cardEnabled = settings?.card_enabled !== 'false';

  const currentRate = cardType ? rates[cardType] : 0;
  const previewReceived = amount > 0 && currentRate > 0
    ? Math.round((amount * currentRate) / 100)
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!cardType) {
      toast.error('Vui lòng chọn loại thẻ');
      return;
    }
    if (!amount || amount === 0) {
      toast.error('Vui lòng chọn mệnh giá');
      return;
    }
    if (!cardSerial || cardSerial.trim().length < 8) {
      toast.error('Số serial phải có ít nhất 8 ký tự');
      return;
    }
    if (!cardCode || cardCode.trim().length < 8) {
      toast.error('Mã thẻ phải có ít nhất 8 ký tự');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createCardDeposit({
        amount,
        cardType,
        cardSerial: cardSerial.trim(),
        cardCode: cardCode.trim(),
      });

      const received = res?.receivedAmount ?? previewReceived;
      const face = res?.faceAmount ?? amount;
      toast.success(
        `Đã gửi yêu cầu! Nhận ${received.toLocaleString('vi-VN')}đ từ thẻ mệnh giá ${face.toLocaleString('vi-VN')}đ`
      );

      // Reset form
      setCardType('');
      setAmount(0);
      setCardSerial('');
      setCardCode('');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = cardType && amount > 0 && cardSerial.trim().length >= 8 && cardCode.trim().length >= 8;

  return (
    <>
      {/* Hero Section - giống các tab khác */}
      <div className="bg-white dark:bg-dark-light border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-500 flex items-center justify-center shrink-0">
              <FiPhone className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-1">Nạp tiền bằng thẻ cào</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Hỗ trợ Viettel, Mobifone, Vinaphone</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/30 rounded-xl">
            <FiPercent className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
              Tỷ lệ quy đổi theo từng loại thẻ
            </span>
          </div>
        </div>
      </div>

      {/* Thông báo tỷ lệ quy đổi */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <div className="text-sm text-amber-800 dark:text-amber-300 space-y-2">
          <p>
            Xử lý thẻ thì vui lòng liên hệ admin để ib zalo hoặc fb:
          </p>
          <p className="font-bold">
            ⚠️ NẠP CHUYỂN KHOẢN ATM MỤC 1 ĐỂ NHẬN 100% GIÁ TRỊ QUY ĐỔI.
          </p>
          <div className="space-y-1 text-xs">
            <p>⏩ VIETTEL nhận {rates.viettel}% giá trị thẻ</p>
            <p>⏩ MOBIFONE nhận {rates.mobifone}% giá trị thẻ</p>
            <p>⏩ VINAPHONE nhận {rates.vinaphone}% giá trị thẻ</p>
          </div>
        </div>
      </div>

      {/* Banner tắt nạp thẻ (admin đã disable) */}
      {!cardEnabled && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-start gap-3">
          <FiAlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800 dark:text-red-200">
            <p className="font-semibold mb-1">Nạp thẻ cào hiện đang tạm ngưng</p>
            <p className="text-xs">Vui lòng quay lại sau hoặc nạp qua ngân hàng để nhận 100% giá trị.</p>
          </div>
        </div>
      )}

      {/* Form Card */}
      <div className={`card ${!cardEnabled ? 'opacity-60 pointer-events-none' : ''}`}>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card Type Select */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Loại thẻ <span className="text-red-500">*</span>
            </label>
            <select
              value={cardType}
              onChange={(e) => setCardType(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            >
              {CARD_TYPES.map((type) => (
                <option key={type.value} value={type.value} disabled={type.disabled}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Amount Select */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Mệnh giá <span className="text-red-500">*</span>
            </label>
            <select
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            >
              {AMOUNTS.map((amt) => (
                <option key={amt.value} value={amt.value} disabled={amt.disabled}>
                  {amt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Card Serial */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Số serial <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <FiHash className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={cardSerial}
                onChange={(e) => setCardSerial(e.target.value)}
                placeholder="Nhập số serial trên thẻ"
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Tối thiểu 8 ký tự
            </p>
          </div>

          {/* Card Code */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Mã thẻ <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <FiKey className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={cardCode}
                onChange={(e) => setCardCode(e.target.value)}
                placeholder="Nhập mã thẻ cào"
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Tối thiểu 8 ký tự
            </p>
          </div>

          {/* Warning Notice */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex gap-3">
              <FiAlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-300 space-y-2">
                <p className="font-semibold">Lưu ý quan trọng:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Thẻ phải chưa sử dụng, còn nguyên mệnh giá</li>
                  <li>Nhập đúng số serial và mã thẻ, không có dấu cách</li>
                  {/* <li>Không nạp thẻ đã bị trầy xước hoặc hỏng</li> */}
                  {/* <li>Admin sẽ kiểm tra và duyệt trong vòng 5-30 phút</li> */}
                  <li>Không thể hoàn tiền nếu thẻ sai hoặc đã sử dụng</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Summary - chỉ hiện khi đã nhập đủ thông tin */}
          {isFormValid && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                <FiCheck className="w-4 h-4 text-primary" />
                Thông tin nạp thẻ
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">Loại thẻ:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100 capitalize">
                    {CARD_TYPES.find((t) => t.value === cardType)?.label}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">Mệnh giá thẻ:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100 text-base">
                    {amount.toLocaleString('vi-VN')}đ
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">Tỷ lệ quy đổi:</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold">
                    <FiPercent className="w-3 h-3" />
                    {currentRate}% ({CARD_TYPES.find((t) => t.value === cardType)?.label})
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">Bạn nhận được:</span>
                  <span className="font-black text-primary text-lg">
                    {previewReceived.toLocaleString('vi-VN')}đ
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-600 dark:text-slate-400">Serial:</span>
                  <span className="font-mono text-xs text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                    {cardSerial}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isFormValid || submitting}
            className="w-full py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30"
          >
            {submitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang gửi yêu cầu...
              </>
            ) : (
              <>
                <FiCheck className="w-5 h-5" />
                Gửi yêu cầu nạp thẻ
              </>
            )}
          </button>
        </form>
      </div>
    </>
  );
}
