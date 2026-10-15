import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { FiSearch, FiEye, FiUserCheck, FiUserX, FiDollarSign, FiEdit, FiLock, FiTrash2 } from 'react-icons/fi';
import { TableSkeleton } from '../components/SkeletonLoader';

export default function Users() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [purchaseFilter, setPurchaseFilter] = useState('all');

  // Debounce search term (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to page 1 when searching
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: usersData, isLoading, isFetching } = useQuery({
    queryKey: ['admin-users', debouncedSearchTerm, currentPage, limit, statusFilter, roleFilter, purchaseFilter],
    queryFn: async () => {
      let url = `/admin/users?page=${currentPage}&limit=${limit}`;
      if (debouncedSearchTerm) url += `&search=${debouncedSearchTerm}`;
      if (statusFilter !== 'all') url += `&status=${statusFilter}`;
      if (roleFilter !== 'all') url += `&role=${roleFilter}`;
      if (purchaseFilter !== 'all') url += `&hasPurchases=${purchaseFilter}`;
      const { data } = await api.get(url);
      return data;
    },
    keepPreviousData: true,
  });

  const toggleAdminMutation = useMutation({
    mutationFn: ({ id, isAdmin }) => api.put(`/admin/users/${id}`, { isAdmin }),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-users']);
      toast.success('Cập nhật quyền thành công');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    },
  });

  // State for balance adjustment
  const [adjustMode, setAdjustMode] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');

  // State for inline balance editing
  const [inlineEditUser, setInlineEditUser] = useState(null);
  const [inlineEditAmount, setInlineEditAmount] = useState('');

  // State for inline spins editing
  const [inlineEditSpinsUser, setInlineEditSpinsUser] = useState(null);
  const [inlineEditSpins, setInlineEditSpins] = useState('');

  // State for password change modal
  const [passwordChangeUser, setPasswordChangeUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  
  // State for delete confirmation modal
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);

  // State for purchased accounts modal
  const [purchasedAccountsData, setPurchasedAccountsData] = useState(null);
  const [loadingPurchasedAccounts, setLoadingPurchasedAccounts] = useState(false);

  const changePasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }) =>
      api.patch(`/admin/users/${id}/password`, { newPassword }),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['admin-users']);
      setPasswordChangeUser(null);
      setNewPassword('');
      toast.success('Đã đổi mật khẩu thành công');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    },
  });

  const adjustSpinsMutation = useMutation({
    mutationFn: ({ id, spins }) =>
      api.put(`/admin/users/${id}/spins`, { spins }),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-users']);
      setInlineEditSpinsUser(null);
      setInlineEditSpins('');
      toast.success('Đã cập nhật lượt quay thành công');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId) => api.delete(`/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-users']);
      setDeleteConfirmUser(null);
      toast.success('Đã xóa người dùng thành công');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    },
  });

  const adjustBalanceMutation = useMutation({
    mutationFn: ({ id, amount, action }) =>
      api.put(`/admin/users/${id}/adjust-balance`, { amount, action }),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['admin-users']);
      setSelectedUser(response.data.user);
      setAdjustMode(false);
      setAdjustAmount('');
      toast.success('Đã điều chỉnh số dư thành công');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    },
  });

  const inlineAdjustMutation = useMutation({
    mutationFn: ({ id, amount }) =>
      api.put(`/admin/users/${id}/adjust-balance`, {
        amount: parseInt(amount),
        action: 'set'
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-users']);
      setInlineEditUser(null);
      setInlineEditAmount('');
      toast.success('Đã cập nhật số dư');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    },
  });

  // Open inline edit for a user
  const openInlineEdit = (user, e) => {
    e.stopPropagation();
    setInlineEditUser(user);
    setInlineEditAmount('');
  };

  // Handle inline balance adjustment (set directly)
  const handleInlineAdjust = (user) => {
    const amount = parseInt(inlineEditAmount);
    if (inlineEditAmount === '' || isNaN(amount) || amount < 0) {
      toast.error('Nhập số dư hợp lệ (≥ 0)');
      return;
    }
    inlineAdjustMutation.mutate({ id: user._id, amount });
  };

  // Handle password change
  const handleChangePassword = () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    changePasswordMutation.mutate({ 
      id: passwordChangeUser._id, 
      newPassword 
    });
  };

  // Close inline edit when clicking outside
  const inlineEditRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inlineEditRef.current && !inlineEditRef.current.contains(event.target)) {
        setInlineEditUser(null);
      }
    };
    if (inlineEditUser) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inlineEditUser]);

  // Fetch purchased accounts
  const fetchPurchasedAccounts = async (user) => {
    setLoadingPurchasedAccounts(true);
    try {
      const { data } = await api.get(`/admin/users/${user._id}/purchased-accounts`);
      setPurchasedAccountsData(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể tải danh sách tài khoản');
    } finally {
      setLoadingPurchasedAccounts(false);
    }
  };

  // Calculate active filters count
  const activeFiltersCount = [
    statusFilter !== 'all',
    roleFilter !== 'all',
    purchaseFilter !== 'all'
  ].filter(Boolean).length;

  // Reset all filters
  const handleResetFilters = () => {
    setStatusFilter('all');
    setRoleFilter('all');
    setPurchaseFilter('all');
    setCurrentPage(1);
  };

  const handleToggleAdmin = (userId, currentStatus) => {
    if (window.confirm(`Xác nhận ${currentStatus ? 'gỡ' : 'cấp'} quyền admin?`)) {
      toggleAdminMutation.mutate({ id: userId, isAdmin: !currentStatus });
    }
  };

  if (isLoading && !usersData) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div>
          <div className="h-9 bg-slate-700 rounded w-32 animate-pulse" />
          <div className="h-5 bg-slate-800 rounded w-28 mt-2 animate-pulse" />
        </div>
        
        {/* Search Skeleton */}
        <div className="h-10 bg-slate-800 rounded-lg w-full max-w-md animate-pulse" />
        
        {/* Table Skeleton */}
        <TableSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Người dùng</h1>
        <p className="text-slate-400 mt-1">Quản lý người dùng</p>
      </div>

      {/* Search */}
      <div className="relative">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm kiếm người dùng..."
          className="input-field pl-11"
        />
      </div>

      {/* Filter Controls - Compact */}
      <div className="flex flex-wrap items-center gap-2 py-3 px-3 bg-slate-800/50 border border-slate-700 rounded-lg text-sm">
        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className={`px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer border ${
            statusFilter !== 'all'
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
              : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
          }`}
          title="Lọc theo trạng thái"
        >
          <option value="all">Tất cả</option>
          <option value="active">Hoạt động</option>
          <option value="inactive">Bị khóa</option>
        </select>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setCurrentPage(1);
          }}
          className={`px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer border ${
            roleFilter !== 'all'
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
              : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
          }`}
          title="Lọc theo quyền"
        >
          <option value="all">Tất cả</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>

        {/* Purchase Filter */}
        <select
          value={purchaseFilter}
          onChange={(e) => {
            setPurchaseFilter(e.target.value);
            setCurrentPage(1);
          }}
          className={`px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer border ${
            purchaseFilter !== 'all'
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
              : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
          }`}
          title="Lọc theo mua hàng"
        >
          <option value="all">Tất cả</option>
          <option value="yes">Có mua</option>
          <option value="no">Chưa mua</option>
        </select>

        {/* Active Filters Badge & Reset Button */}
        {activeFiltersCount > 0 && (
          <>
            <div className="w-full h-px bg-slate-700 my-1"></div>
            <span className="px-2 py-1 bg-cyan-500/30 border border-cyan-500/50 text-cyan-400 rounded text-xs font-semibold">
              {activeFiltersCount} bộ lọc
            </span>
            <button
              onClick={handleResetFilters}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs font-medium transition-all ml-auto"
            >
              Xóa bộ lọc
            </button>
          </>
        )}
      </div>

      {/* Users Table */}
      <div className={`table-container ${isFetching ? 'opacity-60 pointer-events-none' : ''}`} ref={inlineEditRef}>
        <table className="table">
          <thead>
            <tr>
              <th>Tên đăng nhập</th>
              <th>Họ tên</th>
              {/* <th>Số điện thoại</th> */}
              <th>Mật khẩu</th>
              <th>Số dư</th>
              <th>Tổng nạp</th>
              <th>Lượt quay</th>
              <th>Số acc đã mua</th>
              <th>Quyền</th>
              <th>Ngày tạo</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {usersData?.users?.length > 0 ? (
              usersData.users.map((user) => (
                <tr key={user._id}>
                  <td className="font-medium">{user.username}</td>
                  <td className="text-slate-400">{user.fullName || 'N/A'}</td>
                  {/* <td className="text-slate-400">{user.phone || 'Chưa cập nhật'}</td> */}
                  <td className="relative">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400 truncate max-w-[120px]" 
                            title={user.password || 'N/A'}>
                        {user.password ? user.password.substring(0, 10) + '...' : 'N/A'}
                      </span>
                      <button
                        onClick={() => setPasswordChangeUser(user)}
                        className="p-1 hover:bg-orange-500/30 text-orange-400 rounded transition-all"
                        title="Đổi mật khẩu"
                      >
                        <FiLock size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="relative font-semibold text-cyan-400">
                    <div className="flex items-center gap-2">
                      <span>{user.balance?.toLocaleString('vi-VN')}đ</span>
                      <button
                        onClick={(e) => openInlineEdit(user, e)}
                        className="p-1 hover:bg-cyan-500/30 text-cyan-400 rounded transition-all"
                        title="Sửa số dư"
                      >
                        <FiEdit size={14} />
                      </button>
                    </div>
                    {/* Inline Edit Popover */}
                    {inlineEditUser?._id === user._id && (
                      <div
                        className="absolute z-50 mt-2 p-4 bg-slate-800 border border-cyan-500/50 rounded-xl shadow-2xl w-72"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-semibold text-cyan-400 flex items-center gap-2">
                            <FiDollarSign /> Sửa số dư
                          </span>
                          <button
                            onClick={() => setInlineEditUser(null)}
                            className="text-slate-400 hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="text-sm text-slate-400 mb-2">
                          Số dư hiện tại: <span className="text-cyan-400 font-semibold">{user.balance?.toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div className="text-xs text-slate-500 mb-2">
                          Nhập số dư mới → số dư sẽ thành đúng số đó
                        </div>
                        <input
                          type="number"
                          value={inlineEditAmount}
                          onChange={(e) => setInlineEditAmount(e.target.value)}
                          placeholder="Nhập số dư mới..."
                          min="0"
                          step="1000"
                          className="input-field w-full mb-3 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && inlineEditAmount !== '' && parseInt(inlineEditAmount) >= 0) {
                              handleInlineAdjust(user);
                            }
                          }}
                        />
                        {inlineEditAmount !== '' && parseInt(inlineEditAmount) >= 0 && (
                          <div className="text-sm text-slate-400 mb-3 p-2 bg-slate-700/50 rounded">
                            Số dư mới: <span className="font-bold text-cyan-400">
                              {parseInt(inlineEditAmount).toLocaleString('vi-VN')}đ
                            </span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setInlineEditUser(null)}
                            className="flex-1 py-2 px-3 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition-all"
                          >
                            Hủy
                          </button>
                          <button
                            onClick={() => handleInlineAdjust(user)}
                            disabled={inlineAdjustMutation.isPending}
                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all bg-cyan-500 hover:bg-cyan-600 text-white ${
                              inlineAdjustMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            {inlineAdjustMutation.isPending ? '...' : 'Xác nhận'}
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="font-semibold text-purple-400">
                    {(user.totalDeposited || 0).toLocaleString('vi-VN')}đ
                  </td>
                  <td>
                    <div className="flex items-center gap-2 relative">
                      <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full font-semibold text-sm">
                        🎡 {user.spins || 0}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInlineEditSpinsUser(user);
                          setInlineEditSpins('');
                        }}
                        className="p-1 hover:bg-blue-500/30 text-blue-400 rounded transition-all"
                        title="Sửa lượt quay"
                      >
                        <FiEdit size={14} />
                      </button>

                      {/* Inline Edit Popover */}
                      {inlineEditSpinsUser?._id === user._id && (
                        <div
                          className="absolute z-50 mt-2 p-4 bg-slate-800 border border-blue-500/50 rounded-xl shadow-2xl w-72 top-full left-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-semibold text-blue-400 flex items-center gap-2">
                              🎡 Sửa lượt quay
                            </span>
                            <button
                              onClick={() => setInlineEditSpinsUser(null)}
                              className="text-slate-400 hover:text-slate-200 text-lg leading-none"
                            >
                              ✕
                            </button>
                          </div>

                          <input
                            type="number"
                            min="0"
                            value={inlineEditSpins}
                            onChange={(e) => setInlineEditSpins(e.target.value)}
                            placeholder="Nhập số lượt quay mới..."
                            className="input-field w-full mb-3"
                            autoFocus
                          />

                          <div className="flex gap-2">
                            <button
                              onClick={() => setInlineEditSpinsUser(null)}
                              className="flex-1 py-2 px-3 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition-all"
                            >
                              Hủy
                            </button>
                            <button
                              onClick={() => {
                                const spins = parseInt(inlineEditSpins);
                                if (inlineEditSpins === '' || isNaN(spins) || spins < 0) {
                                  toast.error('Nhập số lượt quay hợp lệ (≥ 0)');
                                  return;
                                }
                                adjustSpinsMutation.mutate({ id: user._id, spins });
                              }}
                              disabled={adjustSpinsMutation.isPending}
                              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all bg-blue-500 hover:bg-blue-600 text-white ${
                                adjustSpinsMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                            >
                              {adjustSpinsMutation.isPending ? '...' : 'Xác nhận'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 font-semibold">
                        {user.purchasedAccountsCount || 0}
                      </span>
                      {user.purchasedAccountsCount > 0 && (
                        <button
                          onClick={() => fetchPurchasedAccounts(user)}
                          className="p-1 hover:bg-cyan-500/30 text-cyan-400 rounded transition-all"
                          title="Xem danh sách tài khoản đã mua"
                        >
                          <FiEye size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    {user.isAdmin ? (
                      <span className="badge badge-success">Admin</span>
                    ) : (
                      <span className="badge badge-info">User</span>
                    )}
                  </td>
                  <td className="text-slate-400 text-sm">
                    {format(new Date(user.createdAt), 'dd/MM/yyyy', { locale: vi })}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="p-2 hover:bg-cyan-500/20 text-cyan-400 rounded-lg transition-all"
                        title="Xem chi tiết"
                      >
                        <FiEye />
                      </button>
                      <button
                        onClick={() => handleToggleAdmin(user._id, user.isAdmin)}
                        className={`p-2 rounded-lg transition-all ${
                          user.isAdmin
                            ? 'hover:bg-blue-500/20 text-blue-400'
                            : 'hover:bg-green-500/20 text-green-400'
                        }`}
                        title={user.isAdmin ? 'Gỡ quyền admin' : 'Cấp quyền admin'}
                      >
                        {user.isAdmin ? <FiUserX /> : <FiUserCheck />}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmUser(user)}
                        disabled={user.isAdmin}
                        className={`p-2 rounded-lg transition-all ${
                          user.isAdmin 
                            ? 'opacity-30 cursor-not-allowed text-slate-600'
                            : 'hover:bg-red-500/20 text-red-400'
                        }`}
                        title={user.isAdmin ? 'Không thể xóa admin' : 'Xóa người dùng'}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="11" className="text-center text-slate-400 py-4">
                  Chưa có người dùng nào
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {usersData && (
          <div className="mt-6 flex items-center justify-between px-4 py-4 border-t border-slate-700">
            {/* Left: Items info */}
            <div className="text-sm text-slate-400">
              Hiển thị <span className="text-cyan-400 font-semibold">
                {usersData.users?.length > 0 
                  ? ((usersData.pagination.currentPage - 1) * usersData.pagination.limit + 1) 
                  : 0
              }
              </span>
              {' '}-{' '}
              <span className="text-cyan-400 font-semibold">
                {Math.min(usersData.pagination.currentPage * usersData.pagination.limit, usersData.pagination.totalUsers)}
              </span>
              {' '}của{' '}
              <span className="text-cyan-400 font-semibold">{usersData.pagination.totalUsers}</span> người dùng
            </div>

            {/* Middle: Page numbers */}
            <div className="flex items-center gap-1">
              {/* Previous Button */}
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={!usersData.pagination.hasPrevPage}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  usersData.pagination.hasPrevPage
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50'
                }`}
              >
                ◀ Trước
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: usersData.pagination.totalPages }, (_, i) => i + 1).map((page) => {
                  // Show first 3 pages, last 3 pages, current page ± 1
                  const isVisible = 
                    page <= 3 || 
                    page > usersData.pagination.totalPages - 3 ||
                    Math.abs(page - usersData.pagination.currentPage) <= 1;

                  if (!isVisible) return null;

                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-9 h-9 rounded-lg font-medium transition-all ${
                        page === usersData.pagination.currentPage
                          ? 'bg-cyan-500 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>

              {/* Next Button */}
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, usersData.pagination.totalPages))}
                disabled={!usersData.pagination.hasNextPage}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  usersData.pagination.hasNextPage
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50'
                }`}
              >
                Sau ▶
              </button>
            </div>

            {/* Right: Items per page selector */}
            <select
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value));
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-slate-700 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition-all cursor-pointer"
            >
              <option value={10}>10 / trang</option>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
              <option value={100}>100 / trang</option>
            </select>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="!mt-0 !mt-0 fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-slate-100 mb-6">Thông tin người dùng</h2>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-700">
                <div className="w-16 h-16 bg-cyan-500 rounded-full flex items-center justify-center text-slate-900 font-bold text-2xl">
                  {selectedUser.username?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-100">{selectedUser.username}</h3>
                  <p className="text-slate-400">{selectedUser.fullName}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="card bg-cyan-500/10 border-cyan-500/30">
                  <p className="text-sm text-slate-400 mb-1">Số dư tài khoản</p>
                  <p className="text-2xl font-bold text-cyan-400">
                    {selectedUser.balance?.toLocaleString('vi-VN')}đ
                  </p>
                </div>
                <div className="card bg-purple-500/10 border-purple-500/30">
                  <p className="text-sm text-slate-400 mb-1">Tổng đã nạp</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {(selectedUser.totalDeposited || 0).toLocaleString('vi-VN')}đ
                  </p>
                </div>
                <div className="card bg-blue-500/10 border-blue-500/30">
                  <p className="text-sm text-slate-400 mb-1">Lượt quay còn lại</p>
                  <p className="text-2xl font-bold text-blue-400">
                    🎡 {selectedUser.spins || 0}
                  </p>
                </div>
                <div className="card bg-green-500/10 border-green-500/30">
                  <p className="text-sm text-slate-400 mb-1">Acc đã mua</p>
                  <p className="text-2xl font-bold text-green-400">
                    {selectedUser.purchasedAccountsCount || 0}
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-700">
                <div>
                  <p className="text-sm text-slate-400">Quyền</p>
                  <p className="text-slate-100">
                    {selectedUser.isAdmin ? (
                      <span className="badge badge-success">Admin</span>
                    ) : (
                      <span className="badge badge-info">User</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Số điện thoại</p>
                  <p className="text-slate-100">{selectedUser.phone || 'Chưa cập nhật'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Ngày đăng ký</p>
                  <p className="text-slate-100">
                    {format(new Date(selectedUser.createdAt), 'dd/MM/yyyy HH:mm:ss', { locale: vi })}
                  </p>
                </div>
                {selectedUser.lastLogin && (
                  <div>
                    <p className="text-sm text-slate-400">Đăng nhập gần nhất</p>
                    <p className="text-slate-100">
                      {format(new Date(selectedUser.lastLogin), 'dd/MM/yyyy HH:mm:ss', { locale: vi })}
                    </p>
                  </div>
                )}
              </div>

              {/* Balance Adjustment Section */}
              {adjustMode ? (
                <div className="card bg-slate-800/50 border border-cyan-500/30 mt-4">
                  <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                    <FiDollarSign />
                    Đặt số dư
                  </h3>

                  {/* Current Balance */}
                  <div className="mb-4">
                    <p className="text-sm text-slate-400">Số dư hiện tại</p>
                    <p className="text-2xl font-bold text-cyan-400">
                      {(selectedUser.balance || 0).toLocaleString('vi-VN')}đ
                    </p>
                  </div>

                  {/* Amount Input */}
                  <div className="mb-4">
                    <label className="text-sm text-slate-400 block mb-2">
                      Số dư mới (VND)
                    </label>
                    <input
                      type="number"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      placeholder="Nhập số dư mới..."
                      min="0"
                      step="1000"
                      className="input-field w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Nhập số dư mới → số dư sẽ được đặt thành đúng số đó
                    </p>
                  </div>

                  {/* New Balance Preview */}
                  {adjustAmount !== '' && parseInt(adjustAmount) >= 0 && (
                    <div className="mb-4 p-3 bg-slate-700/50 rounded-lg">
                      <p className="text-sm text-slate-400">Số dư sẽ thành</p>
                      <p className="text-xl font-bold text-cyan-400">
                        {parseInt(adjustAmount).toLocaleString('vi-VN')}đ
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setAdjustMode(false);
                        setAdjustAmount('');
                      }}
                      className="flex-1 btn-secondary"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={() => {
                        const amount = parseInt(adjustAmount);
                        if (adjustAmount === '' || isNaN(amount) || amount < 0) {
                          toast.error('Vui lòng nhập số dư hợp lệ (≥ 0)');
                          return;
                        }
                        adjustBalanceMutation.mutate({
                          id: selectedUser._id,
                          amount,
                          action: 'set'
                        });
                      }}
                      disabled={adjustBalanceMutation.isPending}
                      className="flex-1 btn-primary"
                    >
                      {adjustBalanceMutation.isPending ? 'Đang xử lý...' : 'Xác nhận'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAdjustMode(true)}
                  className="w-full mt-4 btn-primary flex items-center justify-center gap-2"
                >
                  <FiDollarSign />
                  Đặt số dư
                </button>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleToggleAdmin(selectedUser._id, selectedUser.isAdmin)}
                  className={selectedUser.isAdmin ? 'flex-1 btn-danger' : 'flex-1 btn-primary'}
                >
                  {selectedUser.isAdmin ? 'Gỡ quyền admin' : 'Cấp quyền admin'}
                </button>
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setAdjustMode(false);
                    setAdjustAmount('');
                  }}
                  className="flex-1 btn-secondary"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {passwordChangeUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="card max-w-md w-full">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <FiLock className="text-orange-400" size={24} />
              </div>
              <h2 className="text-2xl font-bold text-slate-100">Đổi mật khẩu</h2>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <p className="text-sm text-slate-400 mb-2">Người dùng</p>
                <p className="text-lg font-semibold text-slate-100">
                  {passwordChangeUser.username}
                </p>
              </div>

              <div>
                <label className="text-sm text-slate-400 block mb-2">
                  Mật khẩu mới (tối thiểu 6 ký tự)
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới..."
                  className="input-field w-full"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newPassword.length >= 6) {
                      handleChangePassword();
                    }
                  }}
                />
                {newPassword && (
                  <p className={`text-xs mt-2 ${
                    newPassword.length < 6 
                      ? 'text-red-400' 
                      : 'text-green-400'
                  }`}>
                    {newPassword.length < 6 
                      ? `${6 - newPassword.length} ký tự nữa` 
                      : '✓ Mật khẩu hợp lệ'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPasswordChangeUser(null);
                  setNewPassword('');
                }}
                className="flex-1 btn-secondary"
              >
                Hủy
              </button>
              <button
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending || newPassword.length < 6}
                className={`flex-1 btn-primary ${
                  changePasswordMutation.isPending || newPassword.length < 6
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              >
                {changePasswordMutation.isPending ? 'Đang xử lý...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmUser && (
        <div className="!mt-0 fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="card max-w-md w-full">
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-500/20 rounded-lg">
                  <FiTrash2 className="text-red-400" size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-100">Xác nhận xóa</h3>
                  <p className="text-sm text-slate-400">Hành động này không thể hoàn tác</p>
                </div>
              </div>

              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-slate-300">
                  Bạn có chắc muốn xóa người dùng <span className="font-bold text-red-400">{deleteConfirmUser.username}</span>?
                </p>
                <p className="text-sm text-slate-400 mt-2">
                  Tất cả dữ liệu liên quan (đơn hàng, nạp tiền, lịch sử quay) sẽ bị xóa vĩnh viễn.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmUser(null)}
                className="flex-1 btn-secondary"
              >
                Hủy
              </button>
              <button
                onClick={() => deleteUserMutation.mutate(deleteConfirmUser._id)}
                disabled={deleteUserMutation.isPending}
                className={`flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-lg transition-all ${
                  deleteUserMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {deleteUserMutation.isPending ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchased Accounts Modal */}
      {purchasedAccountsData && (
        <div className="!mt-0 fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="card max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-100">Danh sách tài khoản đã mua</h2>
                <p className="text-slate-400 mt-1">
                  <span className="font-semibold text-cyan-400">{purchasedAccountsData.username}</span>
                  {' '}-{' '}
                  <span className="text-slate-300">{purchasedAccountsData.fullName}</span>
                </p>
              </div>
              <button
                onClick={() => setPurchasedAccountsData(null)}
                className="p-2 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>

            {loadingPurchasedAccounts ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-slate-400">Đang tải...</div>
              </div>
            ) : purchasedAccountsData.accounts?.length > 0 ? (
              <div className="space-y-3">
                {purchasedAccountsData.accounts.map((account, index) => (
                  <div
                    key={account._id}
                    className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-slate-600 transition-all"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Tên tài khoản</p>
                        <p className="font-mono text-cyan-400 font-semibold">{account.accountName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Mật khẩu</p>
                        <p className="font-mono text-slate-300">{account.accountPassword}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Server</p>
                        <p className="text-slate-300">{account.serverName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Khu vực</p>
                        <p className="text-slate-300">{account.region}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Giá mua</p>
                        <p className="text-purple-400 font-semibold">{account.price?.toLocaleString('vi-VN')}đ</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Ngày mua</p>
                        <p className="text-slate-300">
                          {new Date(account.purchasedAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400">Không có tài khoản nào</p>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between">
                <p className="text-slate-400">
                  Tổng cộng: <span className="text-cyan-400 font-semibold">{purchasedAccountsData.totalPurchased}</span> tài khoản
                </p>
                <button
                  onClick={() => setPurchasedAccountsData(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-all"
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
