import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { format, subDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { FiSearch, FiEye, FiRefreshCw, FiActivity, FiCopy } from 'react-icons/fi';
import { TableSkeleton } from '../components/SkeletonLoader';

export default function WebhookLogs() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedLog, setSelectedLog] = useState(null);
  const [page, setPage] = useState(1);

  // Fetch webhook logs
  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['webhook-logs', statusFilter, searchTerm, dateFrom, dateTo, page],
    queryFn: async () => {
      let url = `/admin/webhook-logs?page=${page}&limit=50`;
      if (statusFilter) url += `&processingStatus=${statusFilter}`;
      if (searchTerm) url += `&search=${searchTerm}`;
      if (dateFrom) url += `&dateFrom=${dateFrom}`;
      if (dateTo) url += `&dateTo=${dateTo}`;
      const { data } = await api.get(url);
      return data;
    },
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['webhook-logs-stats', dateFrom, dateTo],
    queryFn: async () => {
      let url = '/admin/webhook-logs-stats?';
      if (dateFrom) url += `dateFrom=${dateFrom}&`;
      if (dateTo) url += `dateTo=${dateTo}&`;
      const { data } = await api.get(url);
      return data;
    },
  });

  const getStatusBadge = (status) => {
    const statusMap = {
      processing: { text: 'Đang xử lý', class: 'bg-blue-500/20 text-blue-400' },
      success: { text: 'Thành công', class: 'bg-emerald-500/20 text-emerald-400' },
      ignored: { text: 'Bỏ qua', class: 'bg-amber-500/20 text-amber-400' },
      error: { text: 'Lỗi', class: 'bg-red-500/20 text-red-400' },
      duplicate: { text: 'Trùng lặp', class: 'bg-slate-500/20 text-slate-400' },
    };
    return statusMap[status] || statusMap.processing;
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`Đã copy ${label}`);
  };

  const truncate = (str, length = 30) => {
    if (!str) return 'N/A';
    return str.length > length ? str.substring(0, length) + '...' : str;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
          <FiActivity className="w-8 h-8 text-cyan-400" />
          Webhook Logs - Shop Phạm Long
        </h1>
        <p className="text-slate-400 mt-1">Theo dõi lịch sử webhook từ SePay</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-sm text-slate-400 mb-1">Tổng requests</p>
            <p className="text-2xl font-bold text-slate-100">{stats.total}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-400 mb-1">Thành công</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.successCount}</p>
            <p className="text-xs text-slate-500 mt-1">({stats.successRate}%)</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-400 mb-1">Tổng tiền xử lý</p>
            <p className="text-2xl font-bold text-cyan-400">
              {stats.totalAmountProcessed?.toLocaleString('vi-VN')}đ
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-400 mb-1">Bỏ qua / Lỗi</p>
            <p className="text-2xl font-bold text-amber-400">
              {(stats.statusCounts?.ignored || 0) + (stats.statusCounts?.error || 0)}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Date From */}
        <div className="flex flex-col">
          <label className="text-xs text-slate-400 mb-1">Từ ngày</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input-field w-40"
          />
        </div>

        {/* Date To */}
        <div className="flex flex-col">
          <label className="text-xs text-slate-400 mb-1">Đến ngày</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input-field w-40"
          />
        </div>

        {/* Status Filter */}
        <div className="flex flex-col flex-1 min-w-[180px]">
          <label className="text-xs text-slate-400 mb-1">Trạng thái</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field"
          >
            <option value="">Tất cả</option>
            <option value="success">Thành công</option>
            <option value="ignored">Bỏ qua</option>
            <option value="error">Lỗi</option>
            <option value="duplicate">Trùng lặp</option>
            <option value="processing">Đang xử lý</option>
          </select>
        </div>

        {/* Search */}
        <div className="flex flex-col flex-1 min-w-[200px]">
          <label className="text-xs text-slate-400 mb-1">Tìm kiếm</label>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Transaction ID, STK, nội dung..."
              className="input-field pl-10"
            />
          </div>
        </div>

        {/* Refresh */}
        <div className="flex flex-col justify-end">
          <button
            onClick={() => refetch()}
            className="btn-secondary flex items-center gap-2 px-4"
            title="Làm mới"
          >
            <FiRefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Webhook Logs Table */}
      {isLoading ? (
        <TableSkeleton rows={10} />
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Transaction ID</th>
                  <th>Số tiền</th>
                  <th>Gateway / STK</th>
                  <th>Nội dung</th>
                  <th>Trạng thái</th>
                  <th>Deposit</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {logsData?.logs?.length > 0 ? (
                  logsData.logs.map((log) => (
                    <tr key={log._id}>
                      <td className="text-sm text-slate-400">
                        {format(new Date(log.receivedAt), 'dd/MM/yyyy HH:mm:ss', { locale: vi })}
                      </td>
                      <td className="font-mono text-xs">
                        <span title={log.sepayTransactionId}>
                          {truncate(log.sepayTransactionId, 12)}
                        </span>
                      </td>
                      <td className="font-semibold text-cyan-400">
                        {log.amount?.toLocaleString('vi-VN')}đ
                      </td>
                      <td>
                        <div className="text-sm">
                          <p className="text-slate-200">{log.gateway || 'N/A'}</p>
                          <p className="text-xs text-slate-400 font-mono">{log.accountNumber || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="text-sm text-slate-300" title={log.content}>
                        {truncate(log.content, 30)}
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadge(log.processingStatus).class}`}>
                          {getStatusBadge(log.processingStatus).text}
                        </span>
                      </td>
                      <td>
                        {log.matchedDepositId ? (
                          <div className="text-sm">
                            <p className="text-cyan-400 font-mono">
                              #{log.matchedDepositId._id?.toString().slice(-8).toUpperCase()}
                            </p>
                            <p className="text-xs text-slate-400">
                              {log.matchedDepositId.userId?.username || 'N/A'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-sm">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-2 hover:bg-cyan-500/20 text-cyan-400 rounded-lg transition-all"
                          title="Xem chi tiết"
                        >
                          <FiEye />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="text-center text-slate-400 py-8">
                      Không có webhook log nào
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {logsData?.pagination && logsData.pagination.pages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Trước
              </button>
              <span className="text-slate-400">
                Trang {page} / {logsData.pagination.pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(logsData.pagination.pages, p + 1))}
                disabled={page === logsData.pagination.pages}
                className="btn-secondary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sau
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="card max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-2">
              <FiActivity className="text-cyan-400" />
              Chi tiết Webhook Log
            </h2>
            
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Transaction ID</p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-slate-100 bg-slate-800 px-3 py-2 rounded flex-1">
                      {selectedLog.sepayTransactionId || 'N/A'}
                    </p>
                    {selectedLog.sepayTransactionId && (
                      <button
                        onClick={() => copyToClipboard(selectedLog.sepayTransactionId, 'Transaction ID')}
                        className="btn-secondary px-3 py-2"
                      >
                        <FiCopy />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Trạng thái</p>
                  <span className={`badge ${getStatusBadge(selectedLog.processingStatus).class} inline-block px-4 py-2`}>
                    {getStatusBadge(selectedLog.processingStatus).text}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Số tiền</p>
                  <p className="text-xl font-bold text-cyan-400">
                    {selectedLog.amount?.toLocaleString('vi-VN')}đ
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Source IP</p>
                  <p className="font-mono text-slate-100">{selectedLog.sourceIp}</p>
                </div>
              </div>

              {/* Transaction Details */}
              <div className="border-t border-slate-700 pt-4">
                <h3 className="font-semibold text-slate-100 mb-3">Thông tin giao dịch</h3>
                <div className="space-y-2 text-sm">
                  <p><span className="text-slate-400">Gateway:</span> <span className="text-slate-200">{selectedLog.gateway || 'N/A'}</span></p>
                  <p><span className="text-slate-400">Số tài khoản:</span> <span className="text-slate-200 font-mono">{selectedLog.accountNumber || 'N/A'}</span></p>
                  <p><span className="text-slate-400">Nội dung:</span> <span className="text-slate-200">{selectedLog.content || 'N/A'}</span></p>
                  <p><span className="text-slate-400">Thời gian nhận:</span> <span className="text-slate-200">{format(new Date(selectedLog.receivedAt), 'dd/MM/yyyy HH:mm:ss', { locale: vi })}</span></p>
                </div>
              </div>

              {/* Processing Note */}
              {selectedLog.processingNote && (
                <div className="border-t border-slate-700 pt-4">
                  <h3 className="font-semibold text-slate-100 mb-3">Ghi chú xử lý</h3>
                  <p className="text-sm text-slate-300 bg-slate-800 p-3 rounded">
                    {selectedLog.processingNote}
                  </p>
                </div>
              )}

              {/* Matched Deposit */}
              {selectedLog.matchedDepositId && (
                <div className="border-t border-slate-700 pt-4">
                  <h3 className="font-semibold text-slate-100 mb-3">Deposit được match</h3>
                  <div className="bg-slate-800 p-4 rounded space-y-2 text-sm">
                    <p><span className="text-slate-400">Deposit ID:</span> <span className="text-cyan-400 font-mono">#{selectedLog.matchedDepositId._id?.toString().slice(-8).toUpperCase()}</span></p>
                    <p><span className="text-slate-400">User:</span> <span className="text-slate-200">{selectedLog.matchedDepositId.userId?.username || 'N/A'}</span></p>
                    <p><span className="text-slate-400">Email:</span> <span className="text-slate-200">{selectedLog.matchedDepositId.userId?.email || 'N/A'}</span></p>
                    <p><span className="text-slate-400">Số tiền:</span> <span className="text-cyan-400 font-semibold">{selectedLog.matchedDepositId.amount?.toLocaleString('vi-VN')}đ</span></p>
                    <p><span className="text-slate-400">Trạng thái:</span> <span className="text-emerald-400">{selectedLog.matchedDepositId.status}</span></p>
                  </div>
                </div>
              )}

              {/* Raw Payload */}
              <div className="border-t border-slate-700 pt-4">
                <h3 className="font-semibold text-slate-100 mb-3">Raw Payload</h3>
                <pre className="bg-slate-950 p-4 rounded text-xs text-slate-300 overflow-x-auto border border-slate-700">
                  {JSON.stringify(selectedLog.rawPayload, null, 2)}
                </pre>
              </div>

              {/* Close Button */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="flex-1 btn-secondary"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
