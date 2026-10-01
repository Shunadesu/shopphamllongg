import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useUserStore } from '../store/data/userStore';
import { useOrderStore } from '../store/data/orderStore';
import { useCartStore } from '../store/cartStore';
import { useAccountDetail, useAccountList } from '../hooks';
import { FiShoppingCart, FiImage, FiChevronDown, FiChevronUp, FiZoomIn, FiX } from 'react-icons/fi';
import { useState, useEffect, useMemo } from 'react';
import SEOHead from '../components/SEOHead';
import { useAccountDetailStore } from '../store/data/accountDetailStore';
import { AccountDetailSkeleton, RelatedAccountsSkeleton } from '../components/SkeletonLoader';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Zoom } from 'swiper/modules';
import BuyNowModal from '../components/BuyNowModal';
import api, { getImageUrl } from '../utils/api';
import LazyImage from '../components/LazyImage';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/zoom';

// Normalize image value (object → url string)
const resolveUrl = (img) => {
  const url = typeof img === 'string' ? img : (img?.url || img?.localUrl || '');
  return getImageUrl(url);
};

const AccountDetail = ({ onOpenAuth }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const incrementCart = useCartStore((s) => s.incrementCart);
  const [selectedImage, setSelectedImage] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [addToCartPending, setAddToCartPending] = useState(false);
  const [showBuyNowModal, setShowBuyNowModal] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);

  const { data: account, isLoading } = useAccountDetail(id);
  // Lấy trực tiếp entry từ store để biết đã có data chưa (tránh hiển thị "không tìm thấy" khi đang load)
  const accountEntry = useAccountDetailStore((s) => s.byId[id]);
  const { accounts: allRelated, isLoading: isRelatedLoading } = useAccountList({ limit: 20 });

  // ESC to close lightbox + lock body scroll
  useEffect(() => {
    if (!lightboxOpen) return;
    document.body.style.overflow = 'hidden';
    const handler = (e) => { if (e.key === 'Escape') setLightboxOpen(false); };
    document.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handler);
    };
  }, [lightboxOpen]);

  // ─── Related / Random Accounts ───────────────────────────

  const relatedAccounts = useMemo(() => {
    const all = (allRelated || []).filter(
      (a) => a._id !== account?._id && a.status === 'available',
    );
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, 4);
  }, [allRelated, account?._id]);

  const handleAddToCart = async () => {
    if (account.status !== 'available') {
      toast.error('Tài khoản không còn khả dụng');
      return;
    }
    setAddToCartPending(true);
    try {
      if (isAuthenticated) {
        await useCartStore.getState().addToCartAdd(id);
      } else {
        // Guest: pass full account object for local storage
        await useCartStore.getState().addToCart(account);
      }
      incrementCart();
      toast.success('Đã thêm vào giỏ hàng');
    } catch (error) {
      if (error?.__skipped || error.response?.status === 401) {
        toast.error('Vui lòng đăng nhập để thêm vào giỏ hàng');
        onOpenAuth?.('login');
      } else {
        toast.error(error.response?.data?.message || 'Không thể thêm vào giỏ hàng');
      }
    } finally {
      setAddToCartPending(false);
    }
  };

  const handleBuyNow = () => {
    if (!isAuthenticated) {
      toast.error('Vui lòng đăng nhập để mua');
      onOpenAuth?.('login');
      sessionStorage.setItem('buyNowAccount', JSON.stringify({ accountId: id }));
      return;
    }
    if (account.status !== 'available') {
      toast.error('Tài khoản không còn khả dụng');
      return;
    }
    setShowBuyNowModal(true);
  };

  const handleConfirmBuyNow = async () => {
    setBuyingNow(true);
    try {
      const { data } = await api.post('/orders/buy-now', {
        accountId: account._id
      });

      // Backend trả { order: {_id, orderNumber}, newBalance, spinsAwarded, message }
      const orderId = data.order?._id || data.orderId;

      // Cập nhật authStore

      // Cập nhật authStore (snapshot hiển thị ở 1 số chỗ cũ)
      useAuthStore.getState().updateBalance(data.newBalance);

      // Force refresh useUserStore.profile → Header.balance auto-update
      await useUserStore.getState().fetchProfile(true);

      // Invalidate orders cache → list/orders/purchased-accounts fetch lại
      useOrderStore.getState().invalidateOrders();

      toast.success(data.message);
      setShowBuyNowModal(false);

      // Điều hướng tới danh sách tài khoản đã mua (tab purchased-accounts)
      navigate('/profile?view=purchased-accounts');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setBuyingNow(false);
    }
  };

  if (isLoading || !accountEntry) return <AccountDetailSkeleton />;

  if (!account) {
    return (
      <div className="min-h-screen pt-16 pb-4 flex items-center justify-center">
        <p className="text-slate-500 dark:text-slate-400 text-sm">Không tìm thấy tài khoản</p>
      </div>
    );
  }

  const images = (account.images || [])
    .map(resolveUrl)
    .filter(Boolean);
  const heroImage = images[selectedImage] || '/placeholder.jpg';

  const discountPct = account.originalPrice && account.originalPrice > account.price
    ? Math.round((1 - account.price / account.originalPrice) * 100)
    : null;

  return (
    <div className="min-h-screen pt-16 pb-4">
      {/* Per-account SEO. ogImage must be an absolute URL or social
          crawlers (Facebook, Twitter) won't pick it up. getImageUrl() handles
          both dev (relative) and prod (full URL) automatically. */}
      <SEOHead
        title={account?.title || 'Chi Tiết Tài Khoản'}
        description={`Mua tài khoản ${account?.title} - Rank ${account?.rank} với giá chỉ ${account?.price?.toLocaleString('vi-VN')}đ. Tài khoản game chất lượng cao, bảo mật.`}
        keywords={`mua tai khoan ${account?.categoryId?.name || 'game'}, tai khoan ${account?.rank || 'game'}, ${account?.title}`}
        ogImage={getImageUrl(account?.images?.[0])}
        type="product"
      />
      <div className="container-custom">
        {/* Breadcrumb */}
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span
            className="hover:text-primary cursor-pointer transition-colors"
            onClick={() => navigate('/')}
          >
            Trang chủ
          </span>
          {' / '}
          <span
            className="hover:text-primary cursor-pointer transition-colors"
            onClick={() => navigate('/shop')}
          >
            Cửa hàng
          </span>
          {account.categoryId && (
            <>
              {' / '}
              <span
                className="hover:text-primary cursor-pointer transition-colors"
                onClick={() => navigate(`/shop/${account.categoryId.slug}`)}
              >
                {account.categoryId.name}
              </span>
            </>
          )}
          {' / '}
          <span className="text-slate-900 dark:text-white">{account.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-stretch">
          {/* Images */}
          <div>
            {/* Hero image with title/category overlay */}
            <div className="card p-1 mb-2 relative group">
              <LazyImage
                src={heroImage}
                alt={account.title}
                className="w-full h-72 object-cover rounded-lg cursor-zoom-in"
                eager
                skeletonClassName="rounded-lg"
                imgStyle={{ cursor: 'zoom-in' }}
                onClick={() => setLightboxOpen(true)}
              />

              {/* Zoom hint */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded-lg pointer-events-none">
                <FiZoomIn className="text-white text-2xl drop-shadow-lg" />
              </div>

              {/* Title + Category overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-2 rounded-b-lg">
                {account.categoryId && (
                  <span className="inline-block bg-primary/90 text-white text-xs font-bold px-2 py-0.5 rounded mb-1 tracking-wide">
                    {account.categoryId.name}
                  </span>
                )}
                <h1 className="text-base font-black text-white leading-tight drop-shadow-lg">
                  {account.title}
                </h1>
              </div>
            </div>

            {images.length > 1 && (
              <div className="flex gap-1 overflow-x-auto">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedImage(idx)}
                    className={`relative cursor-pointer border-2 rounded overflow-hidden transition-all flex-shrink-0 w-[calc(25%-0.1875rem)] ${
                      selectedImage === idx
                        ? 'border-primary'
                        : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
                    }`}
                  >
                    <LazyImage
                      src={img}
                      alt={`Preview ${idx + 1}`}
                      className="w-full h-16 object-cover"
                      skeletonClassName="rounded"
                    />
                    <div className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[10px] font-bold px-1 py-0.5 rounded leading-none">
                      {idx + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info — card, full height */}
          <div className="card p-3 flex flex-col gap-2">
            {/* Status Badge */}
            {account.status === 'sold' && (
              <div className="bg-red-500/20 border border-red-500 text-red-500 dark:text-red-400 px-2 py-1 rounded text-center text-xs font-semibold">
                TÀI KHOẢN ĐÃ BÁN
              </div>
            )}

            {/* Account Name */}
            <h1 className="text-base font-bold text-slate-900 dark:text-white">{account.title}</h1>

            {/* Price section */}
            <div className="relative bg-slate-100 dark:bg-slate-800/80 rounded p-4 border border-slate-200 dark:border-slate-700">
              {/* Pill badge — float top-right */}
              {discountPct && (
                <div className="absolute -top-2 -right-2 bg-gradient-to-r from-primary to-sky-400 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg shadow-primary/30">
                  -{discountPct}%
                </div>
              )}

              {/* Original price — struck through above */}
              {account.originalPrice > 0 && account.originalPrice > account.price && (
                <div className="text-center mb-1">
                  <span className="text-slate-400 dark:text-slate-500 text-sm line-through">
                    {account.originalPrice.toLocaleString('vi-VN')}đ
                  </span>
                </div>
              )}

              {/* Sale price — prominent */}
              <div className="text-center">
                <p className="text-slate-500 dark:text-slate-400 text-xs mb-0.5">Giá bán</p>
                <p className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 font-black text-3xl leading-none animate-gradient">
                  {account.price.toLocaleString('vi-VN')}đ
                </p>
              </div>
            </div>

            {/* Stats: teamValue + BP */}
            {(account.teamValue || account.bp) && (
              <div className="bg-slate-100 dark:bg-slate-800/50 rounded p-2 border border-slate-200 dark:border-slate-700 space-y-1">
                {account.teamValue && (
                  <div className="flex items-center justify-between">
                    <span className="text-primary font-semibold text-xs uppercase">Giá trị đội hình</span>
                    <span className="text-slate-900 dark:text-white font-bold text-sm">{account.teamValue}</span>
                  </div>
                )}
                {account.bp && (
                  <div className={`flex items-center justify-between ${account.teamValue ? 'pt-1 border-t border-slate-200 dark:border-slate-700' : ''}`}>
                    <span className="text-amber-500 font-semibold text-xs uppercase">BP</span>
                    <span className="text-slate-900 dark:text-white font-bold text-sm">{account.bp}</span>
                  </div>
                )}
              </div>
            )}

            {/* Contact Info: Phone, Email, CCCD */}
            {(account.phone || account.email || account.cccd) && (
              <div className="bg-slate-100 dark:bg-slate-800/50 rounded p-2 border border-slate-200 dark:border-slate-700 space-y-1">
                {account.phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400 font-medium text-xs">Số điện thoại</span>
                    <span className="text-slate-900 dark:text-white font-semibold text-xs">{account.phone}</span>
                  </div>
                )}
                {account.email && (
                  <div className={`flex items-center justify-between ${account.phone ? 'pt-1 border-t border-slate-200 dark:border-slate-700' : ''}`}>
                    <span className="text-slate-600 dark:text-slate-400 font-medium text-xs">Email</span>
                    <span className="text-slate-900 dark:text-white font-semibold text-xs break-all">{account.email}</span>
                  </div>
                )}
                {account.cccd && (
                  <div className={`flex items-center justify-between ${(account.phone || account.email) ? 'pt-1 border-t border-slate-200 dark:border-slate-700' : ''}`}>
                    <span className="text-slate-600 dark:text-slate-400 font-medium text-xs">CCCD</span>
                    <span className="text-slate-900 dark:text-white font-semibold text-xs">{account.cccd}</span>
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            {account.description && (
              <div>
                <h3 className="text-slate-900 dark:text-white font-semibold mb-1 text-xs">Mô tả</h3>
                <p className="text-slate-600 dark:text-slate-400 text-xs whitespace-pre-line">
                  {account.description}
                </p>
              </div>
            )}

            {/* Additional Info */}
            {account.additionalInfo && (
              <div>
                <h3 className="text-slate-900 dark:text-white font-semibold mb-1 text-xs">Thông tin thêm</h3>
                <p className="text-slate-600 dark:text-slate-400 text-xs whitespace-pre-line">
                  {account.additionalInfo}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-auto pt-2">
              {account.status === 'available' ? (
                <>
                  <button
                    onClick={handleAddToCart}
                    disabled={addToCartPending}
                    className="btn-secondary flex-1 flex items-center justify-center gap-2 py-3 text-sm"
                  >
                    <FiShoppingCart className="w-4 h-4" />
                    <span>
                      {addToCartPending
                        ? 'Đang xử lý...'
                        : 'Thêm vào giỏ hàng'}
                    </span>
                  </button>
                  <button
                    onClick={handleBuyNow}
                    disabled={addToCartPending}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold"
                  >
                    Mua ngay
                  </button>
                </>
              ) : (
                <button
                  disabled
                  className="btn-secondary w-full cursor-not-allowed opacity-50 text-xs py-1"
                >
                  Không khả dụng
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ─── Hình ảnh chi tiết ─── */}
        {images.length > 0 && (
          <div className="mt-4">
            {/* Toggle header */}
            <button
              onClick={() => setGalleryOpen((o) => !o)}
              className="w-full flex items-center justify-between bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded transition-colors mb-2"
            >
              <div className="flex items-center gap-2">
                <FiImage className="text-cyan-500 dark:text-cyan-400 text-base" />
                <div className="text-left">
                  <h2 className="text-slate-900 dark:text-white font-semibold text-sm">
                    Hình ảnh chi tiết
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 text-xs">
                    {images.length} hình
                  </p>
                </div>
              </div>
              {galleryOpen ? (
                <FiChevronUp className="text-slate-500 dark:text-slate-400" />
              ) : (
                <FiChevronDown className="text-slate-500 dark:text-slate-400" />
              )}
            </button>

            {/* Gallery grid */}
            {galleryOpen && (
              <div className="space-y-2 animate-fade-in">
                {images.map((url, idx) => (
                  <div
                    key={idx}
                    className="relative rounded overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="absolute top-1 left-1 z-10 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded">
                      {idx + 1} / {images.length}
                    </div>
                    <LazyImage
                      src={url}
                      alt={`Hình ${idx + 1}`}
                      className="w-full object-contain"
                      skeletonClassName="rounded"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.25s ease-out;
        }
      `}</style>

      {/* ─── Lightbox Modal ─── */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex flex-col"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-black/60 shrink-0">
            <p className="text-white text-sm font-medium">
              {selectedImage + 1} / {images.length}
            </p>
            <button
              onClick={() => setLightboxOpen(false)}
              className="text-white/70 hover:text-white transition-colors p-1"
            >
              <FiX size={24} />
            </button>
          </div>

          {/* Swiper */}
          <div
            className="flex-1 flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Swiper
              modules={[Pagination, Zoom]}
              zoom={{ maxRatio: 3 }}
              pagination={{ clickable: true }}
              initialSlide={selectedImage}
              onSlideChange={(swiper) => setSelectedImage(swiper.activeIndex)}
              className="!w-full !h-full [&_.swiper]:h-full [&_.swiper-slide]:flex [&_.swiper-slide]:items-center [&_.swiper-slide]:justify-center [&_.swiper-pagination]:!bottom-4"
            >
              {images.map((url, idx) => (
                <SwiperSlide key={idx}>
                  <div className="swiper-zoom-container">
                    <LazyImage
                      src={url}
                      alt={`Hình ${idx + 1}`}
                      className="max-w-full max-h-full object-contain"
                      imgStyle={{ maxHeight: 'calc(100vh - 120px)' }}
                    />
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        </div>
      )}

      {/* Buy Now Modal */}
      <BuyNowModal
        isOpen={showBuyNowModal}
        onClose={() => setShowBuyNowModal(false)}
        account={account}
        onConfirm={handleConfirmBuyNow}
        loading={buyingNow}
      />
    </div>
  );
};

export default AccountDetail;
