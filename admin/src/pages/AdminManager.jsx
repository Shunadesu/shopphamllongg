import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { FiUserPlus, FiTrash2, FiX, FiShield } from 'react-icons/fi';
import { TableSkeleton } from '../components/SkeletonLoader';

export default function AdminManager() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '', fullName: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Fetch all admins
  const { data: admins, isLoading } = useQuery({
    queryKey: ['admins'],
    queryFn: async () => {
      const { data } = await api.get('/admin/admins');
      return data;
    },
  });

  // Create admin mutation
  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/admin/admins', payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['admins']);
      setShowModal(false);
      setFormData({ username: '', password: '', fullName: '' });
      toast.success('Tạo admin thành công');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    },
  });

  // Delete admin mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/admins/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['admins']);
      setDeleteTarget(null);
      toast.success('Đã xóa admin thành công');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.password) {
      toast.error('Vui lòng nhập đầy đủ username và password');
      return;
    }
    if (formData.password.length < 6) {
      toast.error('Password phải có ít nhất 6 ký tự');
      return;
    }
    createMutation.mutate(formData);
  };

  const handleDelete = (admin) => {
    if (window.confirm(`Xác nhận xóa admin "${admin.username}"? Hành động này không thể hoàn tác.`)) {
      deleteMutation.mutate(admin._id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <FiShield className="text-cyan-400" />
            Quản lý Admin
          </h1>
          <p className="text-slate-400 mt-1">Tạo và xóa tài khoản quản trị viên</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-slate-900 font-semibold rounded-lg transition-all"
        >
          <FiUserPlus size={18} />
          Thêm Admin
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <p className="text-amber-400 font-medium">
          Chỉ admin mới có thể truy cập trang này. Không thể xóa chính mình.
        </p>
      </div>

      {/* Admins Table */}
      <div className="table-container">
        {isLoading ? (
          <TableSkeleton rows={5} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Họ tên</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {admins?.length > 0 ? (
                admins.map((admin) => (
                  <tr key={admin._id}>
                    <td className="font-medium text-cyan-400">{admin.username}</td>
                    <td className="text-slate-300">{admin.fullName || '—'}</td>
                    <td>
                      <span className="badge badge-success">Admin</span>
                    </td>
                    <td>
                      {admin.isActive ? (
                        <span className="badge badge-success">Hoạt động</span>
                      ) : (
                        <span className="badge badge-danger">Bị khóa</span>
                      )}
                    </td>
                    <td className="text-slate-400 text-sm">
                      {format(new Date(admin.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDelete(admin)}
                        className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
                        title="Xóa admin"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center text-slate-400 py-8">
                    Chưa có admin nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Admin Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="card max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <FiShield className="text-cyan-400" />
                Tạo Admin mới
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setFormData({ username: '', password: '', fullName: '' });
                }}
                className="text-slate-400 hover:text-white"
              >
                <FiX size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Username *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase() })}
                  placeholder="Nhập username"
                  className="input-field w-full"
                  autoFocus
                  minLength={3}
                  maxLength={20}
                  pattern="[a-z0-9_]+"
                  title="Chỉ chứa chữ thường, số và dấu gạch dưới"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Họ tên</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Nhập họ tên (tùy chọn)"
                  className="input-field w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Password *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Nhập password (ít nhất 6 ký tự)"
                  className="input-field w-full"
                  minLength={6}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setFormData({ username: '', password: '', fullName: '' });
                  }}
                  className="flex-1 btn-secondary"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 btn-primary"
                >
                  {createMutation.isPending ? 'Đang tạo...' : 'Tạo Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="card max-w-sm w-full">
            <h2 className="text-xl font-bold text-red-400 mb-4">Xác nhận xóa</h2>
            <p className="text-slate-300 mb-6">
              Bạn có chắc muốn xóa admin <strong className="text-white">{deleteTarget.username}</strong>?
              Hành động này không thể hoàn tác.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 btn-secondary"
              >
                Hủy
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget._id)}
                disabled={deleteMutation.isPending}
                className="flex-1 btn-danger"
              >
                {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
