import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiImage, FiExternalLink, FiYoutube, FiLayers, FiX } from 'react-icons/fi';
import UploadImage from '../components/UploadImage';

export default function Sliders() {
  const queryClient = useQueryClient();

  // Left sliders (Swiper) modal
  const [leftModalOpen, setLeftModalOpen] = useState(false);
  const [editingLeftSlider, setEditingLeftSlider] = useState(null);
  const [leftForm, setLeftForm] = useState({
    title: '',
    image: '',
    link: '',
    order: 0,
    isActive: true,
    slot: 'left',
    type: 'image',
    youtubeUrl: '',
  });

  // Right banner state
  const [rightModalOpen, setRightModalOpen] = useState(false);
  const [editingRightBanner, setEditingRightBanner] = useState(null);
  const [rightForm, setRightForm] = useState({
    title: '',
    image: '',
    link: '',
    order: 0,
    isActive: true,
    slot: 'right',
    type: 'image',
    youtubeUrl: '',
  });

  const { data: sliders, isLoading } = useQuery({
    queryKey: ['sliders'],
    queryFn: async () => {
      const { data } = await api.get('/admin/sliders');
      return data;
    },
  });

  const leftSliders = Array.isArray(sliders) ? sliders.filter((s) => s.slot === 'left') : [];
  const rightBanner = Array.isArray(sliders)
    ? sliders.find((s) => s.slot === 'right')
    : null;

  // Helper: parse server error message
  const parseError = (err, action = 'thao tác') => {
    const data = err.response?.data;
    // Server trả về message trực tiếp
    if (data?.message) return data.message;
    // Server trả về mảng lỗi validation: { errors: ["msg1", "msg2"] }
    if (Array.isArray(data?.errors)) return data.errors.join(' · ');
    // Server trả về object lỗi: { errors: { field: "msg" } }
    if (data?.errors && typeof data.errors === 'object') {
      return Object.values(data.errors).join(' · ');
    }
    // Server trả về { error: "..." }
    if (data?.error) return data.error;
    // Lỗi mạng / không xác định
    return `Không thể ${action}. Vui lòng thử lại.`;
  };

  // Mutations for left sliders
  const createLeftMutation = useMutation({
    mutationFn: (data) => api.post('/admin/sliders', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['sliders']);
      toast.success('Thêm ảnh Swiper thành công');
      closeLeftModal();
    },
    onError: (err) => toast.error(parseError(err, 'thêm ảnh')),
  });

  const updateLeftMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/admin/sliders/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['sliders']);
      toast.success('Cập nhật thành công');
      closeLeftModal();
    },
    onError: (err) => toast.error(parseError(err, 'cập nhật')),
  });

  const deleteLeftMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/sliders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['sliders']);
      toast.success('Xóa thành công');
    },
    onError: (err) => toast.error(parseError(err, 'xóa ảnh')),
  });

  // Mutations for right banner
  const upsertRightMutation = useMutation({
    mutationFn: (data) => {
      if (editingRightBanner?._id) {
        return api.put(`/admin/sliders/${editingRightBanner._id}`, data);
      }
      return api.post('/admin/sliders', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['sliders']);
      toast.success('Lưu banner phải thành công');
      closeRightModal();
    },
    onError: (err) => toast.error(parseError(err, 'lưu banner')),
  });

  const deleteRightMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/sliders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['sliders']);
      toast.success('Xóa banner phải thành công');
    },
    onError: (err) => toast.error(parseError(err, 'xóa banner')),
  });

  // Left modal handlers
  const openLeftModal = (slider = null) => {
    if (slider) {
      setEditingLeftSlider(slider);
      setLeftForm({
        title: slider.title || '',
        image: slider.image || '',
        link: slider.link || '',
        order: slider.order ?? 0,
        isActive: slider.isActive ?? true,
        slot: 'left',
        type: slider.type || 'image',
        youtubeUrl: slider.youtubeUrl || '',
      });
    } else {
      setEditingLeftSlider(null);
      setLeftForm({
        title: '',
        image: '',
        link: '',
        order: 0,
        isActive: true,
        slot: 'left',
        type: 'image',
        youtubeUrl: '',
      });
    }
    setLeftModalOpen(true);
  };

  const closeLeftModal = () => {
    setLeftModalOpen(false);
    setEditingLeftSlider(null);
  };

  const submitLeftForm = (e) => {
    e.preventDefault();
    if (!leftForm.image) {
      toast.error('Vui lòng upload hình ảnh');
      return;
    }
    if (editingLeftSlider) {
      updateLeftMutation.mutate({ id: editingLeftSlider._id, data: leftForm });
    } else {
      createLeftMutation.mutate(leftForm);
    }
  };

  const handleDeleteLeft = (id) => {
    if (window.confirm('Xóa ảnh Swiper này?')) {
      deleteLeftMutation.mutate(id);
    }
  };

  // Right modal handlers
  const openRightModal = (banner = null) => {
    if (banner) {
      setEditingRightBanner(banner);
      setRightForm({
        title: banner.title || '',
        image: banner.image || '',
        link: banner.link || '',
        order: banner.order ?? 0,
        isActive: banner.isActive ?? true,
        slot: 'right',
        type: banner.type || 'image',
        youtubeUrl: banner.youtubeUrl || '',
      });
    } else {
      setEditingRightBanner(banner);
      setRightForm({
        title: '',
        image: '',
        link: '',
        order: 0,
        isActive: true,
        slot: 'right',
        type: 'image',
        youtubeUrl: '',
      });
    }
    setRightModalOpen(true);
  };

  const closeRightModal = () => {
    setRightModalOpen(false);
    setEditingRightBanner(null);
  };

  const submitRightForm = (e) => {
    e.preventDefault();
    if (rightForm.type === 'image' && !rightForm.image) {
      toast.error('Vui lòng upload hình ảnh');
      return;
    }
    if (rightForm.type === 'youtube' && !rightForm.youtubeUrl) {
      toast.error('Vui lòng nhập URL YouTube');
      return;
    }
    upsertRightMutation.mutate(rightForm);
  };

  const handleDeleteRight = (id) => {
    if (window.confirm('Xóa banner phải?')) {
      deleteRightMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-9 bg-slate-700 rounded w-64 animate-pulse" />
        <div className="h-5 bg-slate-800 rounded w-96 mt-2 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          <div className="card p-6"><div className="h-40 bg-slate-700 rounded animate-pulse" /></div>
          <div className="card p-6"><div className="h-40 bg-slate-700 rounded animate-pulse" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Banner Trang Chủ</h1>
        <p className="text-slate-400 mt-1">
          Cột trái: Swiper nhiều ảnh (50%) · Cột phải: Ảnh / YouTube (50%)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ===== CỘT TRÁI ===== */}
        <div className="space-y-3 border-r border-slate-700 pr-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <FiLayers className="text-cyan-400" />
                Cột trái — Swiper
              </h2>
              <p className="text-slate-400 text-sm mt-0.5">Nhiều ảnh, lướt tự động mỗi 4 giây</p>
            </div>
            <button onClick={() => openLeftModal()} className="btn-primary flex items-center gap-2">
              <FiPlus /> Thêm ảnh
            </button>
          </div>

          {/* Left sliders table */}
          {leftSliders.length === 0 ? (
            <div className="card text-center py-10">
              <FiImage className="text-4xl text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Chưa có ảnh nào cho Swiper</p>
            </div>
          ) : (
            <div className="card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Hình ảnh</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Tiêu đề</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium">Thứ tự</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium">Trạng thái</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {leftSliders.map((s) => (
                    <tr key={s._id} className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="w-16 h-10 rounded overflow-hidden bg-slate-700 flex-shrink-0">
                          {s.image && <img src={s.image} alt={s.title} className="w-full h-full object-cover" />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-100">{s.title || '—'}</span>
                        {s.link && (
                          <a href={s.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 mt-0.5">
                            <FiExternalLink size={11} /> Link
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="badge badge-info">#{s.order}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`badge ${s.isActive ? 'badge-success' : 'badge-danger'}`}>
                          {s.isActive ? 'Active' : 'Off'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openLeftModal(s)} className="p-1.5 rounded hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 transition-all" title="Sửa">
                            <FiEdit2 size={15} />
                          </button>
                          <button onClick={() => handleDeleteLeft(s._id)} className="p-1.5 rounded hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-all" title="Xóa">
                            <FiTrash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ===== CỘT PHẢI ===== */}
        <div className="space-y-3 pl-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <FiImage className="text-cyan-400" />
                Cột phải — Ảnh / YouTube
              </h2>
              <p className="text-slate-400 text-sm mt-0.5">Chọn hiển thị ảnh hoặc video YouTube</p>
            </div>
          </div>

          {/* Right banner table */}
          {rightBanner ? (
            <div className="card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Hình ảnh</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Tiêu đề</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium">Loại</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium">Trạng thái</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="w-20 h-12 rounded overflow-hidden bg-slate-700 flex-shrink-0">
                        {rightBanner.type === 'youtube' ? (
                          <div className="w-full h-full flex items-center justify-center bg-red-500/10">
                            <FiYoutube className="text-red-400 text-lg" />
                          </div>
                        ) : rightBanner.image ? (
                          <img src={rightBanner.image} alt={rightBanner.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <FiImage className="text-slate-500 text-sm" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-100">{rightBanner.title || '—'}</span>
                      {rightBanner.link && (
                        <a href={rightBanner.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 mt-0.5">
                          <FiExternalLink size={11} /> Link
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge ${rightBanner.type === 'youtube' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'badge-info'}`}>
                        {rightBanner.type === 'youtube' ? 'YouTube' : 'Hình ảnh'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge ${rightBanner.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {rightBanner.isActive ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openRightModal(rightBanner)} className="p-1.5 rounded hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 transition-all" title="Sửa">
                          <FiEdit2 size={15} />
                        </button>
                        <button onClick={() => handleDeleteRight(rightBanner._id)} className="p-1.5 rounded hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-all" title="Xóa">
                          <FiTrash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card text-center py-10">
              <FiImage className="text-4xl text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm mb-4">Chưa có banner cột phải</p>
              <button onClick={() => openRightModal(null)} className="btn-primary inline-flex items-center gap-2">
                <FiPlus /> Thêm banner phải
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== MODAL: Thêm/Sửa ẢNH SWIPER (cột trái) ===== */}
      {leftModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-100">
                {editingLeftSlider ? 'Sửa ảnh Swiper' : 'Thêm ảnh Swiper'}
              </h2>
              <button onClick={closeLeftModal} className="text-slate-400 hover:text-white">
                <FiX size={20} />
              </button>
            </div>
            <form onSubmit={submitLeftForm} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Tiêu đề</label>
                <input
                  type="text"
                  value={leftForm.title}
                  onChange={(e) => setLeftForm({ ...leftForm, title: e.target.value })}
                  className="input-field"
                  placeholder="VD: Khuyến mãi mùa hè"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Link (tùy chọn)</label>
                  <input
                    type="text"
                    value={leftForm.link}
                    onChange={(e) => setLeftForm({ ...leftForm, link: e.target.value })}
                    className="input-field"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Thứ tự</label>
                  <input
                    type="number"
                    value={leftForm.order}
                    onChange={(e) => setLeftForm({ ...leftForm, order: parseInt(e.target.value) || 0 })}
                    className="input-field"
                    min="0"
                  />
                </div>
              </div>
              <div>
                <UploadImage
                  label="Hình ảnh"
                  value={leftForm.image}
                  onChange={(url) => setLeftForm({ ...leftForm, image: url })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Trạng thái</label>
                <select
                  value={leftForm.isActive ? 'true' : 'false'}
                  onChange={(e) => setLeftForm({ ...leftForm, isActive: e.target.value === 'true' })}
                  className="input-field"
                >
                  <option value="true">Active — hiển thị</option>
                  <option value="false">Inactive — ẩn</option>
                </select>
              </div>
              {/* Live preview */}
              {leftForm.image && (
                <div className="rounded-lg overflow-hidden border border-slate-600">
                  <img src={leftForm.image} alt="Preview" className="w-full h-32 object-cover" />
                  <div className="bg-slate-800 p-2 text-xs text-slate-400">
                    Swiper — ảnh sẽ hiển thị ở cột trái
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="submit" className="flex-1 btn-primary">
                  {editingLeftSlider ? 'Cập nhật' : 'Thêm mới'}
                </button>
                <button type="button" onClick={closeLeftModal} className="flex-1 btn-secondary">
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL: Thêm/Sửa BANNER PHẢI ===== */}
      {rightModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="card max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-100">
                {editingRightBanner ? 'Sửa banner phải' : 'Thêm banner phải'}
              </h2>
              <button onClick={closeRightModal} className="text-slate-400 hover:text-white">
                <FiX size={20} />
              </button>
            </div>
            <form onSubmit={submitRightForm} className="space-y-3">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Loại hiển thị</label>
                <div className="flex gap-3">
                  <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${rightForm.type === 'image' ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                    <input
                      type="radio"
                      name="rightType"
                      value="image"
                      checked={rightForm.type === 'image'}
                      onChange={() => setRightForm({ ...rightForm, type: 'image', image: rightForm.image, youtubeUrl: '' })}
                      className="sr-only"
                    />
                    <FiImage size={18} />
                    <span className="text-sm font-medium">Hình ảnh</span>
                  </label>
                  <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${rightForm.type === 'youtube' ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                    <input
                      type="radio"
                      name="rightType"
                      value="youtube"
                      checked={rightForm.type === 'youtube'}
                      onChange={() => setRightForm({ ...rightForm, type: 'youtube', image: '', youtubeUrl: rightForm.youtubeUrl || '' })}
                      className="sr-only"
                    />
                    <FiYoutube size={18} />
                    <span className="text-sm font-medium">YouTube</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Tiêu đề</label>
                <input
                  type="text"
                  value={rightForm.title}
                  onChange={(e) => setRightForm({ ...rightForm, title: e.target.value })}
                  className="input-field"
                  placeholder="VD: Video giới thiệu shop"
                />
              </div>

              {rightForm.type === 'image' ? (
                <UploadImage
                  label="Hình ảnh banner"
                  value={rightForm.image}
                  onChange={(url) => setRightForm({ ...rightForm, image: url })}
                />
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">URL YouTube</label>
                  <input
                    type="text"
                    value={rightForm.youtubeUrl}
                    onChange={(e) => setRightForm({ ...rightForm, youtubeUrl: e.target.value })}
                    className="input-field"
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                  <p className="text-slate-500 text-xs mt-1">
                    Dán link YouTube (watch, youtu.be, hoặc embed URL đều được)
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Link khi click (tùy chọn)</label>
                  <input
                    type="text"
                    value={rightForm.link}
                    onChange={(e) => setRightForm({ ...rightForm, link: e.target.value })}
                    className="input-field"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Thứ tự</label>
                  <input
                    type="number"
                    value={rightForm.order}
                    onChange={(e) => setRightForm({ ...rightForm, order: parseInt(e.target.value) || 0 })}
                    className="input-field"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Trạng thái</label>
                <select
                  value={rightForm.isActive ? 'true' : 'false'}
                  onChange={(e) => setRightForm({ ...rightForm, isActive: e.target.value === 'true' })}
                  className="input-field"
                >
                  <option value="true">Active — hiển thị</option>
                  <option value="false">Inactive — ẩn</option>
                </select>
              </div>

              {/* Live preview */}
              <div className="border border-slate-600 rounded-lg overflow-hidden">
                <div className="grid gap-0.5" style={{ gridTemplateColumns: '33fr 67fr' }}>
                  <div className="bg-slate-800 flex items-center justify-center h-16">
                    <span className="text-xs text-slate-500">Swiper trái</span>
                  </div>
                  <div className="bg-slate-800 flex items-center justify-center h-16 overflow-hidden">
                    {rightForm.type === 'image' && rightForm.image ? (
                      <img src={rightForm.image} alt="Preview" className="w-full h-full object-cover" />
                    ) : rightForm.type === 'youtube' && rightForm.youtubeUrl ? (
                      <div className="flex flex-col items-center">
                        <FiYoutube size={20} className="text-red-400" />
                        <span className="text-xs text-slate-400 mt-1">YouTube</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Chưa có nội dung</span>
                    )}
                  </div>
                </div>
                <div className="bg-slate-800 p-2 text-xs text-slate-400 text-center">
                  Xem trước — 33% / 67%
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="submit" className="flex-1 btn-primary">
                  {editingRightBanner ? 'Cập nhật' : 'Lưu banner phải'}
                </button>
                <button type="button" onClick={closeRightModal} className="flex-1 btn-secondary">
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
