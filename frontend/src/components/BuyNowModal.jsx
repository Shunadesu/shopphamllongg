import { FiX, FiAlertCircle } from 'react-icons/fi';

export default function BuyNowModal({ isOpen, onClose, account, onConfirm, loading, userBalance }) {
  if (!isOpen) return null;

  const accountPrice = account?.price || 0;
  const balance = userBalance ?? 0;
  const insufficientBalance = balance < accountPrice;
  const shortfall = insufficientBalance ? accountPrice - balance : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Xác nhận mua tài khoản</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition disabled:opacity-50"
          >
            <FiX className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Account Info */}
          <div className="border border-primary/30 rounded-xl p-4 bg-gradient-to-br from-primary/5 to-primary/10">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{account?.title}</h3>
            <p className="text-3xl font-bold text-primary">
              {accountPrice.toLocaleString('vi-VN')}đ
            </p>
          </div>

          {/* Balance Info */}
          <div className={`flex gap-3 p-4 rounded-xl border ${
            insufficientBalance 
              ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30' 
              : 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30'
          }`}>
            
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                insufficientBalance 
                  ? 'text-red-800 dark:text-red-400' 
                  : 'text-green-800 dark:text-green-400'
              }`}>
                Số dư hiện tại: {balance.toLocaleString('vi-VN')}đ
              </p>
              {insufficientBalance && (
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                  ⚠️ Số dư không đủ. Thiếu: {shortfall.toLocaleString('vi-VN')}đ
                </p>
              )}
              {!insufficientBalance && (
                <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                  Sau mua: {(balance - accountPrice).toLocaleString('vi-VN')}đ
                </p>
              )}
            </div>
          </div>

          {/* Confirmation message */}
          {!insufficientBalance && (
            <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl">
              <FiAlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <p className="text-sm text-blue-800 dark:text-blue-400">
                Bạn có chắc chắn muốn mua tài khoản này?
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50"
          >
            {insufficientBalance ? 'Đóng' : 'Hủy'}
          </button>
          {insufficientBalance ? (
            <button
              onClick={() => {
                onClose();
                window.location.href = '/profile?view=deposit';
              }}
              className="flex-1 px-4 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition"
            >
              Nạp tiền
            </button>
          ) : (
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition disabled:opacity-50"
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận mua'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
