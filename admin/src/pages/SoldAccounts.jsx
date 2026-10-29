import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import api, { getImageUrl } from '../utils/api';
import toast from 'react-hot-toast';
import {
  FiSearch, FiRefreshCw, FiEye, FiX, FiCopy, FiCheck,
  FiShoppingBag, FiDollarSign, FiUsers, FiClock,
  FiTrendingUp, FiGrid, FiShoppingCart, FiAward
} from 'react-icons/fi';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, BarChart, Bar, PieChart, Pie, Cell, Legend, Line
} from 'recharts';

const CHART_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6'];

const SOURCE_LABELS = {
  order: 'Đơn hàng',
  spin: 'Xổ số',
  unknown: 'Không rõ',
};

const SOURCE_BADGE = {
  order: 'badge-success',
  spin: 'badge-warning',
  unknown: 'badge-info',
};

const SORT_OPTIONS = [
  { value: 'soldAt_desc', label: 'Mới nhất' },
  { value: 'soldAt_asc', label: 'Cũ nhất' },
  { value: 'price_desc', label: 'Giá cao → thấp' },
  { value: 'price_asc', label: 'Giá thấp → cao' },
];

export default function SoldAccounts() {
  // ==================== FILTER STATE ====================
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortBy, setSortBy] = useState('soldAt_desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [detail, setDetail] = useState(null);

  // Debounce ô tìm kiếm 500ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Đổi bất kỳ filter nào cũng reset về trang 1
  useEffect(() => {
    setPage(1);
  }, [selectedCategory, selectedSubcategory, dateFrom, dateTo, minPrice, maxPrice, sourceFilter, sortBy]);

  // ==================== QUERY PARAMS ====================
  const buildParams = () => {
    const params = new URLSearchParams();
    params.set('page', page);
    params.set('limit', limit);
    params.set('sort', sortBy);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedCategory) params.set('category', selectedCategory);
    if (selectedSubcategory) params.set('subcategory', selectedSubcategory);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (minPrice !== '') params.set('minPrice', minPrice);
    if (maxPrice !== '') params.set('maxPrice', maxPrice);
    if (sourceFilter !== 'all') params.set('source', sourceFilter);
    return params;
  };

  // ==================== DATA ====================
  const { data: soldData, isLoading, isFetching } = useQuery({
    queryKey: ['sold-accounts', buildParams().toString()],
    queryFn: async () => {
      const { data } = await api.get(`/admin/sold-accounts?${buildParams().toString()}`);
      return data;
    },
    keepPreviousData: true,
  });

  const { data: statsData } = useQuery({
    queryKey: ['sold-accounts-stats', buildParams().toString()],
    queryFn: async () => {
      const { data } = await api.get(`/admin/sold-accounts/stats?${buildParams().toString()}`);
      return data;
    },
    keepPreviousData: true,
  });

  const { data: categoriesWithSub } = useQuery({
    queryKey: ['categories-all'],
    queryFn: async () => {
      const { data } = await api.get('/categories/all');
      return data;
    },
  });

  const subcategories = useMemo(() => {
    if (!selectedCategory || !categoriesWithSub) return [];
    const cat = categoriesWithSub.find((c) => c._id === selectedCategory);
    return cat?.subcategories || [];
  }, [selectedCategory, categoriesWithSub]);

  // ==================== HANDLERS ====================
  const handleRefresh = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedCategory('');
    setSelectedSubcategory('');
    setDateFrom('');
    setDateTo('');
    setMinPrice('');
    setMaxPrice('');
    setSourceFilter('all');
    setSortBy('soldAt_desc');
    setPage(1);
    toast.success('Đã làm mới dữ liệu');
  };

  const activeFiltersCount = [
    debouncedSearch,
    selectedCategory,
    selectedSubcategory,
    dateFrom,
    dateTo,
    minPrice !== '' ? minPrice : '',
    maxPrice !== '' ? maxPrice : '',
    sourceFilter !== 'all' ? sourceFilter : '',
  ].filter(Boolean).length;

  // ==================== CHART DATA ====================
  const soldByDayData = (statsData?.soldByDay || []).map((d) => ({
    date: format(new Date(d.date), 'dd/MM'),
    soAcc: d.count,
    doanhThu: d.revenue,
  }));

  const byCategoryData = (statsData?.byCategory || []).map((c) => ({
    name: c.name,
    soAcc: c.count,
    doanhThu: c.revenue,
  }));

  const bySourceData = (statsData?.bySource || []).map((s) => ({
    name: SOURCE_LABELS[s.source] || s.source,
    value: s.count,
  }));

  const topBuyersData = (statsData?.topBuyers || []).map((b) => ({
    name: b.username,
    soAcc: b.count,
    tongChi: b.totalSpent,
  }));

  // ==================== RENDER ====================
  const stats = statsData?.summary;

  const statCards = [
    {
      title: 'Tổng acc đã bán',
      value: stats?.totalAccounts ?? '—',
      icon: FiShoppingBag,
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/30',
      textColor: 'text-cyan-400',
    },
    {
      title: 'Tổng giá trị bán ra',
      value: stats ? `${stats.totalRevenue.toLocaleString('vi-VN')}đ` : '—',
      icon: FiDollarSign,
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
      textColor: 'text-purple-400',
    },
    {
      title: 'Số khách đã mua',
      value: stats?.totalBuyers ?? '—',
      icon: FiUsers,
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      textColor: 'text-blue-400',
    },
    {
      title: 'Bán trong 30 ngày',
      value: stats?.recentAccounts ?? '—',
      icon: FiClock,
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30',
      textColor: 'text-green-400',
    },
  ];

  return (
    <div className="space-y-4">
      {/* ==================== HEADER ==================== */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Tài khoản đã bán</h1>
          <p className="text-slate-400 mt-1">
            Theo dõi acc đã bán: người mua, thông tin acc, ngày bán và thống kê
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="btn-secondary flex items-center gap-2">
            <FiRefreshCw /> Làm mới
          </button>
          <Link to="/accounts" className="btn-primary flex items-center gap-2">
            <FiShoppingBag /> Quản lý tài khoản
          </Link>
        </div>
      </div>

      {/* ==================== KPI CARDS ==================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => (
          <div key={index} className={`card ${card.bgColor} border ${card.borderColor}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">{card.title}</p>
                <p className={`text-2xl font-bold ${card.textColor}`}>{card.value}</p>
              </div>
              <div className={`p-3 ${card.bgColor} rounded-xl ${card.borderColor} border`}>
                <card.icon className={`text-2xl ${card.textColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ==================== CHARTS ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Số acc bán theo ngày */}
        <div className="card">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-4">
            <FiTrendingUp className="text-cyan-400" />
            Số acc bán theo ngày
          </h2>
          <div className="h-64">
            {soldByDayData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={soldByDayData}>
                  <defs>
                    <linearGradient id="soldAccGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#e2e8f0'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="soAcc"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fill="url(#soldAccGradient)"
                    name="Số acc"
                  />
                  <Line
                    type="monotone"
                    dataKey="doanhThu"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    name="Giá trị bán ra"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                Chưa có dữ liệu
              </div>
            )}
          </div>
        </div>

        {/* Top danh mục */}
        <div className="card">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-4">
            <FiGrid className="text-purple-400" />
            Danh mục bán nhiều nhất
          </h2>
          <div className="h-64">
            {byCategoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategoryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#e2e8f0'
                    }}
                  />
                  <Bar dataKey="soAcc" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Số acc" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                Chưa có dữ liệu
              </div>
            )}
          </div>
        </div>

        {/* Nguồn bán */}
        <div className="card">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-4">
            <FiAward className="text-amber-400" />
            Nguồn bán hàng
          </h2>
          <div className="h-64">
            {bySourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={bySourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {bySourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#e2e8f0'
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                Chưa có dữ liệu
              </div>
            )}
          </div>
        </div>

        {/* Top người mua */}
        <div className="card">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-4">
            <FiUsers className="text-blue-400" />
            Người mua nhiều nhất
          </h2>
          <div className="h-64">
            {topBuyersData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topBuyersData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#e2e8f0'
                    }}
                  />
                  <Bar dataKey="soAcc" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Số acc" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                Chưa có dữ liệu
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== FILTERS ==================== */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {/* Tìm kiếm */}
          <div className="flex-1 min-w-60 relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm mã acc, tiêu đề, tên người mua, mã đơn hàng..."
              className="input-field pl-11 w-full"
            />
          </div>

          {/* Danh mục */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedSubcategory('');
            }}
            className="input-field w-52"
          >
            <option value="">Tất cả danh mục</option>
            {categoriesWithSub?.map((cat) => (
              <option key={cat._id} value={cat._id}>
                {cat.name}
              </option>
            ))}
          </select>

          {/* Danh mục con */}
          <select
            value={selectedSubcategory}
            onChange={(e) => setSelectedSubcategory(e.target.value)}
            className="input-field w-44"
            disabled={!selectedCategory || subcategories.length === 0}
          >
            <option value="">Tất cả danh mục con</option>
            {subcategories.map((sub) => (
              <option key={sub._id} value={sub._id}>
                {sub.name}
              </option>
            ))}
          </select>

          {/* Nguồn bán */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="input-field w-40"
          >
            <option value="all">Tất cả nguồn</option>
            <option value="order">Đơn hàng</option>
            <option value="spin">Xổ số</option>
            <option value="unknown">Không rõ</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          {/* Khoảng ngày */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Ngày bán từ</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field w-44"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Đến ngày</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field w-44"
            />
          </div>

          {/* Khoảng giá */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Giá thấp nhất</label>
            <input
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="0"
              min="0"
              className="input-field w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Giá cao nhất</label>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Không giới hạn"
              min="0"
              className="input-field w-40"
            />
          </div>

          {/* Sắp xếp */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Sắp xếp</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="input-field w-44"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Số bản ghi / trang */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Số bản ghi</label>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="input-field w-32"
            >
              <option value={10}>10 / trang</option>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
              <option value={100}>100 / trang</option>
            </select>
          </div>

          {activeFiltersCount > 0 && (
            <button
              onClick={handleRefresh}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-all"
            >
              Xóa bộ lọc ({activeFiltersCount})
            </button>
          )}
        </div>
      </div>

      {/* ==================== TABLE ==================== */}
      <div className={`table-container ${isFetching ? 'opacity-60 pointer-events-none' : ''}`}>
        <table className="table">
          <thead>
            <tr>
              <th className="w-16">Hình</th>
              <th>Mã</th>
              <th>Tiêu đề</th>
              <th>Danh mục</th>
              <th>Tài khoản / Mật khẩu</th>
              <th className="w-24">Giá bán</th>
              <th>Người mua</th>
              <th>Liên hệ</th>
              <th className="w-24">Nguồn</th>
              <th>Mã đơn</th>
              <th className="w-32">Ngày bán</th>
              <th className="w-16">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {soldData?.accounts?.length > 0 ? (
              soldData.accounts.map((account) => (
                <tr key={account._id} className="align-top">
                  {/* Hình */}
                  <td>
                    {account.images?.[0] ? (
                      <img
                        src={getImageUrl(account.images[0])}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover border border-slate-700"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-500">
                        <FiShoppingBag size={18} />
                      </div>
                    )}
                  </td>

                  {/* Mã */}
                  <td>
                    <span className="text-xs font-mono text-slate-400 whitespace-nowrap" title={account.code || ''}>
                      {account.code || '-'}
                    </span>
                  </td>

                  {/* Tiêu đề */}
                  <td className="font-medium text-slate-100 max-w-xs">
                    <div className="truncate" title={account.title}>{account.title}</div>
                  </td>

                  {/* Danh mục */}
                  <td className="text-sm">
                    <div className="text-slate-300">{account.category?.name || '-'}</div>
                    {account.subcategory?.name && (
                      <div className="text-xs text-slate-500">{account.subcategory.name}</div>
                    )}
                  </td>

                  {/* TK / MK */}
                  <td className="text-sm min-w-40">
                    <div className="text-slate-300 truncate" title={account.username || ''}>
                      TK: {account.username || '-'}
                    </div>
                    <div className="text-slate-400 truncate" title={account.password || ''}>
                      MK: {account.password || '-'}
                    </div>
                  </td>

                  {/* Giá bán */}
                  <td>
                    <span className="font-semibold text-cyan-400 text-sm whitespace-nowrap">
                      {(account.soldPrice ?? account.price ?? 0).toLocaleString('vi-VN')}đ
                    </span>
                  </td>

                  {/* Người mua */}
                  <td className="text-sm min-w-32">
                    {account.buyer ? (
                      <>
                        <div className="text-slate-200 truncate" title={account.buyer.username}>
                          {account.buyer.username}
                        </div>
                        <div className="text-xs text-slate-500 truncate" title={account.buyer.fullName}>
                          {account.buyer.fullName || '-'}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-600">Không rõ</span>
                    )}
                  </td>

                  {/* Liên hệ */}
                  <td className="text-sm min-w-36">
                    {account.buyer?.email ? (
                      <div className="text-slate-400 truncate" title={account.buyer.email}>
                        {account.buyer.email}
                      </div>
                    ) : null}
                    {account.buyer?.phone ? (
                      <div className="text-slate-400 truncate" title={account.buyer.phone}>
                        {account.buyer.phone}
                      </div>
                    ) : null}
                    {!account.buyer?.email && !account.buyer?.phone && (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>

                  {/* Nguồn */}
                  <td>
                    <span className={`badge ${SOURCE_BADGE[account.buyerSource] || 'badge-info'}`}>
                      {SOURCE_LABELS[account.buyerSource] || 'Không rõ'}
                    </span>
                  </td>

                  {/* Mã đơn */}
                  <td>
                    <span className="text-xs font-mono text-slate-400">
                      {account.orderNumber || '-'}
                    </span>
                  </td>

                  {/* Ngày bán */}
                  <td className="text-slate-400 text-sm whitespace-nowrap">
                    {account.soldDate
                      ? format(new Date(account.soldDate), 'dd/MM/yyyy HH:mm', { locale: vi })
                      : '-'}
                  </td>

                  {/* Thao tác */}
                  <td>
                    <button
                      onClick={() => setDetail(account)}
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
                <td colSpan="12" className="text-center text-slate-400 py-8">
                  {isLoading ? 'Đang tải dữ liệu...' : 'Không có tài khoản đã bán nào phù hợp'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ==================== PAGINATION ==================== */}
      {soldData?.pagination && soldData.pagination.total > 0 && (
        <div className="flex items-center justify-between gap-4 pt-2 flex-wrap">
          <div className="text-slate-400 text-sm">
            Hiển thị {((page - 1) * limit) + 1} -{' '}
            {Math.min(page * limit, soldData.pagination.total)} trong tổng số{' '}
            <span className="text-cyan-400 font-semibold">{soldData.pagination.total}</span> tài khoản
          </div>

          {soldData.pagination.pages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
              >
                Trước
              </button>

              <div className="flex items-center gap-1">
                {(() => {
                  const totalPages = soldData.pagination.pages;
                  const current = page;
                  const pages = [1];
                  let start = Math.max(2, current - 1);
                  let end = Math.min(totalPages - 1, current + 1);

                  if (start > 2) pages.push('...');
                  for (let i = start; i <= end; i++) pages.push(i);
                  if (end < totalPages - 1) pages.push('...');
                  if (totalPages > 1) pages.push(totalPages);

                  return pages.map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} className="px-2 text-slate-500">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`min-w-10 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          p === current
                            ? 'bg-cyan-500 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  );
                })()}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(soldData.pagination.pages, p + 1))}
                disabled={page === soldData.pagination.pages}
                className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
              >
                Sau
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================== DETAIL MODAL ==================== */}
      {detail && (
        <SoldAccountDetailModal account={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

// ==================== MODAL CHI TIẾT ====================
function SoldAccountDetailModal({ account, onClose }) {
  const [copied, setCopied] = useState(null);

  const handleCopy = async (text, key) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('Không thể sao chép');
    }
  };

  const CopyButton = ({ value, field }) =>
    value ? (
      <button
        onClick={() => handleCopy(value, field)}
        className="ml-2 p-1 text-slate-500 hover:text-cyan-400 transition-all"
        title="Sao chép"
      >
        {copied === field ? <FiCheck size={13} className="text-green-400" /> : <FiCopy size={13} />}
      </button>
    ) : null;

  const Row = ({ label, value, mono, copy }) => (
    <div className="flex items-start gap-2 py-1">
      <span className="text-sm text-slate-400 shrink-0 w-36">{label}</span>
      <span className={`text-sm text-slate-100 break-all ${mono ? 'font-mono' : ''}`}>
        {value || '-'}
      </span>
      {copy && <CopyButton value={value} field={copy} />}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="card max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">Chi tiết tài khoản đã bán</h2>
            <p className="text-slate-400 mt-1">
              <span className="font-mono text-cyan-400">{account.code || account.title}</span>
              {account.soldDate && (
                <> · Bán ngày {format(new Date(account.soldDate), 'dd/MM/yyyy HH:mm', { locale: vi })}</>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-all"
          >
            <FiX />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* --------- THÔNG TIN TÀI KHOẢN --------- */}
          <div className="card bg-slate-800/50 border border-slate-700 p-3">
            <h3 className="text-lg font-bold text-cyan-400 mb-3 flex items-center gap-2">
              <FiShoppingBag /> Thông tin tài khoản
            </h3>

            {account.images?.length > 0 && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {account.images.slice(0, 4).map((img, i) => (
                  <img
                    key={i}
                    src={getImageUrl(img)}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover border border-slate-700"
                  />
                ))}
              </div>
            )}

            <Row label="Mã" value={account.code} mono copy="code" />
            <Row label="Tiêu đề" value={account.title} />
            <Row label="Danh mục" value={account.category?.name} />
            <Row label="Danh mục con" value={account.subcategory?.name} />
            <Row label="Username" value={account.username} mono copy="username" />
            <Row label="Password" value={account.password} mono copy="password" />
            {account.password2 && (
              <Row label="Password 2" value={account.password2} mono copy="password2" />
            )}
            <Row label="Giá gốc" value={account.originalPrice ? `${account.originalPrice.toLocaleString('vi-VN')}đ` : '-'} />
            <Row
              label="Giảm giá"
              value={
                account.adminDiscountPercent > 0
                  ? `${account.adminDiscountPercent}%`
                  : '-'
              }
            />
            <Row label="Giá bán" value={`${(account.soldPrice ?? account.price ?? 0).toLocaleString('vi-VN')}đ`} />
            <Row label="Số điện thoại" value={account.phone} copy="phone" />
            <Row label="Email" value={account.email} copy="email" />
            <Row label="CCCD" value={account.cccd} />
            <Row label="Đội hàng" value={account.teamValue} />
            <Row label="BP" value={account.bp} />
            <Row label="Mô tả" value={account.description} />
          </div>

          {/* --------- NGƯỜI MUA & GIAO DỊCH --------- */}
          <div className="flex flex-col gap-4">
            <div className="card bg-slate-800/50 border border-slate-700 p-3">
              <h3 className="text-lg font-bold text-blue-400 mb-3 flex items-center gap-2">
                <FiUsers /> Người mua
              </h3>

              {account.buyer ? (
                <>
                  <div className="flex items-center gap-3 pb-3 mb-2 border-b border-slate-700">
                    <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center text-slate-900 font-bold text-lg">
                      {account.buyer.username?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-100 truncate">
                        {account.buyer.username}
                      </p>
                      <p className="text-sm text-slate-400 truncate">
                        {account.buyer.fullName || '-'}
                      </p>
                    </div>
                    <span className={`badge ml-auto ${SOURCE_BADGE[account.buyerSource] || 'badge-info'}`}>
                      {SOURCE_LABELS[account.buyerSource] || 'Không rõ'}
                    </span>
                  </div>

                  <Row label="Email" value={account.buyer.email} copy="buyerEmail" />
                  <Row label="Số điện thoại" value={account.buyer.phone} copy="buyerPhone" />
                  <Row label="Ngày đăng ký" value={
                    account.buyer.createdAt
                      ? format(new Date(account.buyer.createdAt), 'dd/MM/yyyy', { locale: vi })
                      : '-'
                  } />
                  <Row label="Tổng đã nạp" value={`${(account.buyer.totalDeposited || 0).toLocaleString('vi-VN')}đ`} />
                  <Row label="Tổng chi tiêu" value={`${(account.buyer.totalSpent || 0).toLocaleString('vi-VN')}đ`} />
                  <Row label="Số dư hiện tại" value={`${(account.buyer.balance || 0).toLocaleString('vi-VN')}đ`} />
                  <Row label="Acc đã mua" value={account.buyer.purchasedAccountsCount ?? '-'} />
                </>
              ) : (
                <p className="text-slate-400 text-sm py-4 text-center">
                  Không xác định được người mua cho tài khoản này.
                </p>
              )}
            </div>

            <div className="card bg-slate-800/50 border border-slate-700 p-3">
              <h3 className="text-lg font-bold text-purple-400 mb-3 flex items-center gap-2">
                <FiShoppingCart /> Giao dịch
              </h3>
              <Row label="Mã đơn hàng" value={account.orderNumber} mono />
              <Row label="Ngày đặt" value={
                account.orderInfo?.createdAt
                  ? format(new Date(account.orderInfo.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })
                  : '-'
              } />
              <Row label="Giá trong đơn" value={
                account.orderInfo?.items?.price != null
                  ? `${account.orderInfo.items.price.toLocaleString('vi-VN')}đ`
                  : '-'
              } />
              <Row label="Tổng thanh toán" value={
                account.orderInfo?.totalAmount != null
                  ? `${account.orderInfo.totalAmount.toLocaleString('vi-VN')}đ`
                  : '-'
              } />
              <Row label="Trạng thái đơn" value={
                account.orderInfo?.status === 'completed' ? 'Hoàn thành' : (account.orderInfo?.status || '-')
              } />
              <Row label="Thời điểm bán" value={
                account.soldDate
                  ? format(new Date(account.soldDate), 'dd/MM/yyyy HH:mm:ss', { locale: vi })
                  : '-'
              } />
            </div>

            <div className="flex gap-2">
              <Link
                to={`/accounts/edit/${account._id}`}
                onClick={onClose}
                className="flex-1 btn-primary text-center"
              >
                Sửa tài khoản
              </Link>
              <button onClick={onClose} className="flex-1 btn-secondary">
                Đóng
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
