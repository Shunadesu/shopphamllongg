import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { FiActivity, FiSearch, FiFilter, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { TableSkeleton } from '../components/SkeletonLoader';

const METHOD_COLORS = {
  GET: 'bg-green-500/20 text-green-400',
  POST: 'bg-blue-500/20 text-blue-400',
  PUT: 'bg-amber-500/20 text-amber-400',
  PATCH: 'bg-purple-500/20 text-purple-400',
  DELETE: 'bg-red-500/20 text-red-400',
};

function StatusBadge({ code }) {
  if (!code) return <span className="text-slate-500">—</span>;
  if (code >= 200 && code < 300) return <span className="text-green-400 font-mono">{code}</span>;
  if (code >= 400 && code < 500) return <span className="text-amber-400 font-mono">{code}</span>;
  if (code >= 500) return <span className="text-red-400 font-mono">{code}</span>;
  return <span className="text-slate-400 font-mono">{code}</span>;
}

function MethodBadge({ method }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${METHOD_COLORS[method] || 'bg-slate-700 text-slate-400'}`}>
      {method}
    </span>
  );
}

export default function AdminAccessLog() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    adminId: '',
    method: '',
    path: '',
    date: '',
  });

  const limit = 30;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-access-logs', page, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', limit);
      if (filters.adminId) params.set('adminId', filters.adminId);
      if (filters.method) params.set('method', filters.method);
      if (filters.path) params.set('path', filters.path);
      if (filters.date) params.set('date', filters.date);
      const { data } = await api.get(`/admin/admins/access-logs?${params.toString()}`);
      return data;
    },
  });

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
    setPage(1);
  };

  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => {
    if (data?.pagination && page < data.pagination.pages) {
      setPage((p) => p + 1);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
          <FiActivity className="text-cyan-400" />
          Nhật ký truy cập Admin
        </h1>
        <p className="text-slate-400 mt-1">Theo dõi lịch sử truy cập của các admin</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Tìm path</label>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              value={filters.path}
              onChange={(e) => handleFilterChange('path', e.target.value)}
              placeholder="VD: /api/admin/accounts"
              className="input-field pl-9 text-sm w-52"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Method</label>
          <select
            value={filters.method}
            onChange={(e) => handleFilterChange('method', e.target.value)}
            className="input-field text-sm"
          >
            <option value="">Tất cả</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Ngày</label>
          <input
            type="date"
            value={filters.date}
            onChange={(e) => handleFilterChange('date', e.target.value)}
            className="input-field text-sm"
          />
        </div>

        <div>
          <button
            onClick={() => {
              setFilters({ adminId: '', method: '', path: '', date: '' });
              setPage(1);
            }}
            className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-all text-sm"
          >
            <FiFilter size={14} />
            Xóa lọc
          </button>
        </div>

        {data?.pagination && (
          <div className="ml-auto text-sm text-slate-400 self-center">
            Tổng: <span className="text-cyan-400 font-semibold">{data.pagination.total}</span> bản ghi
          </div>
        )}
      </div>

      {/* Logs Table */}
      <div className="table-container">
        {isLoading ? (
          <TableSkeleton rows={10} />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Admin</th>
                  <th>Method</th>
                  <th>Path</th>
                  <th>IP</th>
                  <th>Status</th>
                  <th>Phản hồi</th>
                </tr>
              </thead>
              <tbody>
                {data?.logs?.length > 0 ? (
                  data.logs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-800/50">
                      <td className="text-slate-400 text-xs whitespace-nowrap">
                        {format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm:ss', { locale: vi })}
                      </td>
                      <td className="text-cyan-400 text-sm font-medium">
                        {log.adminUsername}
                      </td>
                      <td>
                        <MethodBadge method={log.method} />
                      </td>
                      <td className="text-slate-300 text-xs max-w-xs truncate" title={log.path}>
                        {log.path}
                      </td>
                      <td className="text-slate-400 text-xs font-mono">
                        {log.ip || '—'}
                      </td>
                      <td>
                        <StatusBadge code={log.statusCode} />
                      </td>
                      <td className="text-slate-400 text-xs font-mono">
                        {log.responseTime != null ? `${log.responseTime}ms` : '—'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="text-center text-slate-400 py-8">
                      Không có bản ghi nào
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {data?.pagination && data.pagination.pages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-800">
                <span className="text-sm text-slate-400">
                  Trang {data.pagination.page} / {data.pagination.pages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handlePrev}
                    disabled={page === 1}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <FiChevronLeft size={16} />
                  </button>
                  <span className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm">
                    {data.pagination.page} / {data.pagination.pages}
                  </span>
                  <button
                    onClick={handleNext}
                    disabled={page >= data.pagination.pages}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <FiChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
