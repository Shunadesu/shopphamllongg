import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSliders, useCategories, useAccountList, useHasSubcategories } from '../hooks';
import { FiChevronRight, FiChevronLeft, FiSearch, FiX } from 'react-icons/fi';
import SEOHead from '../components/SEOHead';
import AccountCard from '../components/AccountCard';
import { AccountCardSkeleton } from '../components/SkeletonLoader';
import BuyNowModal from '../components/BuyNowModal';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import { getResponsiveImageUrl } from '../utils/api';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import { toYoutubeEmbedUrl } from '../utils/banner';
import toast from 'react-hot-toast';
import LazyImage from '../components/LazyImage';
import CategoryAccountSection from '../components/CategoryAccountSection';
import SubcategoryGrid from '../components/SubcategoryGrid';
import PaginationNav from '../components/Pagination';

// Skeleton loader for category cards
const SkeletonCategoryCard = () => (
  <div className="card animate-pulse">
    <div className="w-full h-40 bg-slate-200 dark:bg-slate-700 rounded-t-lg mb-2" />
    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mx-auto mb-1" />
    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mx-auto" />
  </div>
);

// YouTube iframe that only loads when user clicks play — saves ~500KB of JS
const YouTubeLazyEmbed = ({ embedUrl }) => {
  const [playing, setPlaying] = useState(false);
  // Derive thumbnail from YouTube video ID
  const videoId = embedUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)?.[1];
  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null;

  if (playing) {
    return (
      <iframe
        src={`${embedUrl}&autoplay=1`}
        title="YouTube video"
        className="w-full h-full"
        style={{ aspectRatio: '16/9' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      className="relative w-full overflow-hidden rounded-md bg-slate-900 group cursor-pointer"
      style={{ aspectRatio: '16/9' }}
      aria-label="Phát video YouTube"
    >
      {thumbnailUrl && (
        <LazyImage
          src={thumbnailUrl}
          alt="YouTube video thumbnail"
          className="absolute inset-0 w-full h-full"
          eager
          skeletonClassName="bg-slate-800"
          imgStyle={{ objectFit: 'cover', width: '100%', height: '100%' }}
        />
      )}
      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
        <div className="w-14 h-14 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-white ml-1" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </button>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const [selectedParent, setSelectedParent] = useState(null); // Category cha đang chọn (để hiển thị subcategories)
  const [selectedSubcategory, setSelectedSubcategory] = useState(null); // Danh mục con đang chọn (để lọc accounts)
  const accountsRef = useRef(null);
  const { isAuthenticated } = useAuthStore();
  
  // Buy Now Modal state
  const [showBuyNowModal, setShowBuyNowModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [buyingNow, setBuyingNow] = useState(false);

  // Accounts display limit — show 12 at a time, reset on filter change
  const [displayLimit, setDisplayLimit] = useState(12);
  const PAGE_SIZE = 12;

  // Filter state
  const [filters, setFilters] = useState({
    priceRange: 'all',
    sortBy: 'default',
    searchName: '',
    searchCode: '',
  });

  // Temporary input states (before clicking "Tìm kiếm")
  const [tempSearchName, setTempSearchName] = useState('');
  const [tempSearchCode, setTempSearchCode] = useState('');

  // Fetch sliders
  const { data: sliders } = useSliders();

  // Preload hero banner images — inject <link rel="preload"> into <head>
  // so the browser fetches them at highest priority alongside HTML parsing
  useEffect(() => {
    if (!sliders) return;
    const images = [];
    if (sliders.leftSliders) {
      sliders.leftSliders.forEach((s) => { if (s.image) images.push(s.image); });
    }
    if (sliders.rightBanner?.image) {
      images.push(sliders.rightBanner.image);
    }
    images.forEach((img) => {
      const resolved = getResponsiveImageUrl(img, [640, 1280]);
      // Extract base URL without srcSet widths for preload (use largest width)
      const baseUrl = resolved.split(' ')[0];
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = baseUrl;
      document.head.appendChild(link);
    });
  }, [sliders]);

  // Fetch categories
  const { data: categories, loading: categoriesLoading } = useCategories();

  // Fetch all accounts (for grouping by category)
  const { accounts: allAccounts, loading: accountsLoading } = useAccountList({ limit: 100 });

  // Determine data to display
  // Categories: skeleton during initial load, real data when loaded, empty state when no data
  const categoriesLoaded = !categoriesLoading && Array.isArray(categories);
  const displayCategories = categoriesLoaded ? categories : [];

  // All accounts: skeleton during initial load, real data when loaded
  const accountsLoaded = !accountsLoading && Array.isArray(allAccounts);
  const displayAllAccounts = accountsLoaded ? allAccounts : [];

  // Group accounts by category
  const accountsByCategory = useMemo(() => {
    const grouped = {};
    displayAllAccounts.forEach((account) => {
      const catId = account.category?._id;
      if (catId) {
        if (!grouped[catId]) grouped[catId] = [];
        grouped[catId].push(account);
      }
    });
    return grouped;
  }, [displayAllAccounts]);

  // Filter accounts based on selected subcategory and filters
  const filteredAccounts = useMemo(() => {
    let result = displayAllAccounts;

    // Filter by category hierarchy
    if (selectedSubcategory) {
      // Lọc theo subcategory (ưu tiên cao nhất)
      result = result.filter(account => account.category?._id === selectedSubcategory._id);
    } else if (selectedParent) {
      // Lọc theo parent category khi không chọn subcategory
      const parentId = selectedParent._id;
      const subcategoryIds = selectedParent.subcategories?.map(sub => sub._id) || [];
      
      result = result.filter(account => {
        const accountCatId = account.category?._id;
        // Lấy accounts thuộc danh mục cha hoặc bất kỳ danh mục con nào
        return accountCatId === parentId || subcategoryIds.includes(accountCatId);
      });
    }

    // Filter by price range
    if (filters.priceRange !== 'all') {
      const priceRanges = {
        'under_50k': { min: 0, max: 50000 },
        '50k_100k': { min: 50000, max: 100000 },
        '100k_500k': { min: 100000, max: 500000 },
        'over_500k': { min: 500000, max: Infinity }
      };
      const range = priceRanges[filters.priceRange];
      if (range) {
        result = result.filter(acc => acc.price >= range.min && acc.price <= range.max);
      }
    }

    // Filter by search name
    if (filters.searchName) {
      result = result.filter(acc =>
        acc.title.toLowerCase().includes(filters.searchName.toLowerCase())
      );
    }

    // Filter by search code
    if (filters.searchCode) {
      result = result.filter(acc =>
        acc.code?.toLowerCase().includes(filters.searchCode.toLowerCase())
      );
    }

    // Sort
    if (filters.sortBy !== 'default') {
      const sorted = [...result];
      switch(filters.sortBy) {
        case 'price_asc':
          sorted.sort((a, b) => a.price - b.price);
          break;
        case 'price_desc':
          sorted.sort((a, b) => b.price - a.price);
          break;
        case 'name_asc':
          sorted.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'name_desc':
          sorted.sort((a, b) => b.title.localeCompare(a.title));
          break;
        default:
          break;
      }
      return sorted;
    }

    return result;
  }, [selectedParent, selectedSubcategory, displayAllAccounts, filters]);

  // Handle category click - check if has subcategories
  const handleCategoryClick = useCallback((category) => {
    setDisplayLimit(PAGE_SIZE); // reset to first page on category change
    const hasSubs = category.subcategories && category.subcategories.length > 0;

    if (hasSubs) {
      setSelectedParent(category);
      setSelectedSubcategory(null);
      setTimeout(() => {
        window.scrollTo({ top: window.innerHeight * 0.6, behavior: 'smooth' });
      }, 100);
    } else {
      setSelectedParent(category);
      setSelectedSubcategory(null);
      setTimeout(() => {
        accountsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, []);

  // Handle subcategory selection
  const handleSubcategoryClick = useCallback((subcategory) => {
    setDisplayLimit(PAGE_SIZE);
    setSelectedSubcategory(subcategory);
    setTimeout(() => {
      accountsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, []);

  // Filter handlers — stable references so child components don't re-render unnecessarily
  const handleApplyFilters = useCallback(() => {
    setDisplayLimit(PAGE_SIZE); // reset to first page on new filter
    setFilters((prev) => ({
      ...prev,
      searchName: tempSearchName,
      searchCode: tempSearchCode,
    }));
    setTimeout(() => {
      accountsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [tempSearchName, tempSearchCode]);

  const handleResetFilters = useCallback(() => {
    setDisplayLimit(PAGE_SIZE);
    setFilters({
      priceRange: 'all',
      sortBy: 'default',
      searchName: '',
      searchCode: '',
    });
    setTempSearchName('');
    setTempSearchCode('');
  }, []);

  const handleBuyNow = useCallback(async (e, account) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent('openAuthDrawer', { detail: { view: 'login' } }));
      sessionStorage.setItem('buyNowAccount', JSON.stringify(account));
      return;
    }

    setSelectedAccount(account);
    setShowBuyNowModal(true);
  }, [isAuthenticated]);

  const handleConfirmBuyNow = async () => {
    if (!selectedAccount) return;

    setBuyingNow(true);
    try {
      const response = await api.post('/orders/buy-now', {
        accountId: selectedAccount._id
      });
      
      toast.success('Mua hàng thành công!');
      
      // Update balance in store
      if (response.data.newBalance !== undefined) {
        useAuthStore.getState().updateBalance(response.data.newBalance);
      }
      
      setShowBuyNowModal(false);
      navigate(`/orders/${response.data.order._id}`);
    } catch (error) {
      const message = error.response?.data?.message || 'Không thể mua hàng';
      toast.error(message);
    } finally {
      setBuyingNow(false);
    }
  };

  return (
    <div className="min-h-screen pt-16">
      <SEOHead
        title="Mua Bán Tài Khoản FC Online, FIFA Online 4 Giá Rẻ Uy Tín"
        description="Shop chuyên mua bán tài khoản FC Online (FIFA Online 4) giá rẻ, uy tín, chất lượng. Tài khoản FO4 đã có sẵn VPL, VLBD, cày rank, đủ mức giá, giao dịch nhanh, bảo hành an toàn."
        keywords="mua tai khoan fc online, fco, mua tai khoan fifa online 4, tai khoan fo4 gia re, ban tai khoan fc online, fifa online 4 gia re, fc online uy tin, tai khoan fo4 vpl, bp trang"
        type="website"
      />

      {/* Hero Section - Banner: Cột trái Swiper + Cột phải Ảnh/YouTube (tỷ lệ động) */}
      <section>
        {sliders?.leftSliders?.length > 0 || sliders?.rightBanner ? (
          <div className="container-custom">
            {(() => {
              const leftWidth = sliders?.leftSliders?.[0]?.width ?? 33;
              const rightWidth = 100 - leftWidth;
              return (
                <div
                  className="flex flex-col md:grid gap-1 rounded-md overflow-hidden banner-grid"
                  style={{ gridTemplateColumns: `${leftWidth}fr ${rightWidth}fr` }}
                >
                  {/* Cột Trái — Swiper nhiều ảnh */}
                  <div className="w-full overflow-hidden rounded-md">
                    <Swiper
                      modules={[Autoplay, Pagination]}
                      autoplay={{ delay: 4000, disableOnInteraction: false }}
                      pagination={{ clickable: true }}
                      loop={sliders.leftSliders.length > 1}
                      className="banner-swiper h-full [&_.swiper-pagination-bullet-active]:!bg-primary [&_.swiper-pagination-bullet]:!bg-white/60"
                    >
                      {sliders.leftSliders.map((slide) => (
                        <SwiperSlide key={slide._id} className="!h-auto">
                          {slide.link ? (
                            <a href={slide.link} target="_blank" rel="noopener noreferrer" className="block h-full">
                              <LazyImage
                                src={slide.image}
                                alt="Banner trái"
                                className="w-full h-full object-cover"
                                eager
                                srcSet={getResponsiveImageUrl(slide.image, [640, 1280, 1920])}
                                sizes="(max-width: 768px) 100vw, 33vw"
                              />
                            </a>
                          ) : (
                            <LazyImage
                              src={slide.image}
                              alt="Banner trái"
                              className="w-full h-full object-cover"
                              eager
                              srcSet={getResponsiveImageUrl(slide.image, [640, 1280, 1920])}
                              sizes="(max-width: 768px) 100vw, 33vw"
                            />
                          )}
                        </SwiperSlide>
                      ))}
                    </Swiper>
                  </div>

                  {/* Cột Phải — Ảnh hoặc YouTube */}
                  <div className="relative w-full overflow-hidden rounded-md">
                    {sliders.rightBanner?.type === 'youtube' && toYoutubeEmbedUrl(sliders.rightBanner.youtubeUrl) ? (
                      <YouTubeLazyEmbed
                        embedUrl={toYoutubeEmbedUrl(sliders.rightBanner.youtubeUrl)}
                      />
                    ) : sliders.rightBanner?.image ? (
                      sliders.rightBanner.link ? (
                        <a href={sliders.rightBanner.link} target="_blank" rel="noopener noreferrer" className="block h-full">
                          <LazyImage
                            src={sliders.rightBanner.image}
                            alt="Banner phải"
                            className="w-full h-full object-cover"
                            eager
                            srcSet={getResponsiveImageUrl(sliders.rightBanner.image, [640, 1280, 1920])}
                            sizes="(max-width: 768px) 100vw, 67vw"
                          />
                        </a>
                      ) : (
                        <LazyImage
                          src={sliders.rightBanner.image}
                          alt="Banner phải"
                          className="w-full h-full object-cover"
                          eager
                          srcSet={getResponsiveImageUrl(sliders.rightBanner.image, [640, 1280, 1920])}
                          sizes="(max-width: 768px) 100vw, 67vw"
                        />
                      )
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary-dark via-primary to-accent min-h-[200px]" />
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="container-custom">
            <div className="w-full bg-gradient-to-br from-primary-dark via-primary to-accent rounded-md" style={{ minHeight: '200px' }} />
          </div>
        )}
      </section>

      <div className="pt-4">
        {/* Categories */}
        <section className="py-2">
          <div className="container-custom">
            <div className="section-title-banner">
              <span className="section-title-banner__text">
                <span className="accent">Danh mục</span> Game
              </span>
            </div>

            {/* "Tất cả" button - reset to default view */}
            {(selectedParent || selectedSubcategory) && (
              <div className="mb-2">
                <button
                  onClick={() => {
                    setSelectedParent(null);
                    setSelectedSubcategory(null);
                  }}
                  className="text-sm text-primary hover:text-primary-light font-medium flex items-center gap-1"
                >
                  <FiChevronRight className="w-4 h-4 rotate-180" />
                  <span>Tất cả danh mục</span>
                </button>
              </div>
            )}

            {/* Show skeleton while loading, real data when loaded, empty state if no categories */}
            {categoriesLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonCategoryCard key={i} />
                ))}
              </div>
            ) : displayCategories.length === 0 ? (
              <div className="card text-center py-4">
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  Chưa có danh mục nào. Vui lòng quay lại sau.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 items-stretch">
                {displayCategories.map((category) => {
                  const count = (accountsByCategory[category._id] || []).length;
                  const hasSubs = category.subcategories && category.subcategories.length > 0;
                  const isActive = selectedParent?._id === category._id;
                  
                  // Tính tổng số sản phẩm thuộc tất cả danh mục con
                  const totalProductsInSubs = hasSubs 
                    ? category.subcategories.reduce((total, sub) => {
                        return total + (accountsByCategory[sub._id] || []).length;
                      }, 0)
                    : 0;
                  
                  return (
                    <button
                      key={category._id}
                      onClick={() => handleCategoryClick(category)}
                      className={`category-card ${isActive ? 'ring-2 ring-primary shadow-lg' : ''}`}
                    >
                      {/* Image container - chiều cao cố định 120px từ CSS */}
                      <div className="category-card__image">
                        {category.thumbnail ? (
                          <LazyImage
                            src={category.thumbnail}
                            alt={category.name}
                            className="w-full h-full"
                            objectFit="contain"
                            skeletonClassName="rounded-lg"
                            srcSet={getResponsiveImageUrl(category.thumbnail, [320, 640, 960])}
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 320px"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-blue-700 via-blue-600 to-sky-300 flex items-center justify-center">
                            <span className="text-white text-2xl font-bold opacity-50">
                              {category.name.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Content container */}
                      <div className="category-card__content">
                        {/* Title */}
                        <h3 className="category-card__title">
                          {category.name}
                        </h3>

                        {/* Description */}
                        <p className="category-card__description">
                          {category.description || '\u00A0'}
                        </p>

                        {/* Count */}
                        <div className="category-count">
                          {hasSubs ? (
                            // Danh mục cha có subcategories
                            <div className="flex items-center gap-1">
                              <div className="flex items-center gap-1">
                                <span className="category-count__num">{category.subcategories.length}</span>
                                <span className="category-count__label">danh mục</span>
                              </div>
                              <div>-</div>
                              <div className="flex items-center gap-1">
                                <span className="category-count__num text-xs">{totalProductsInSubs}</span>
                                <span className="category-count__label">sản phẩm</span>
                              </div>
                            </div>
                          ) : count > 0 ? (
                            // Danh mục không có sub nhưng có sản phẩm
                            <>
                              <span className="category-count__num">{count}</span>
                              <span className="category-count__label">tài khoản</span>
                            </>
                          ) : (
                            // Danh mục trống
                            <span className="category-count__label">Sắp có</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Badge - absolute positioned */}
                      {hasSubs && (
                        <div className="category-card__badge">
                          {category.subcategories.length} danh mục
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Filter Bar - Chỉ hiển thị khi không chọn danh mục cha */}
        {!(selectedParent && !selectedSubcategory) && (
        <section className="py-2">
          <div className="container-custom">
            <div className="card p-2">
              <div className="flex flex-wrap items-end gap-2">
                {/* Dropdown Khoảng giá */}
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Khoảng giá
                  </label>
                  <select
                    value={filters.priceRange}
                    onChange={(e) => setFilters(prev => ({ ...prev, priceRange: e.target.value }))}
                    className="input-field w-full text-sm py-1"
                  >
                    <option value="all">Tất cả</option>
                    <option value="under_50k">Dưới 50.000đ</option>
                    <option value="50k_100k">50.000đ - 100.000đ</option>
                    <option value="100k_500k">100.000đ - 500.000đ</option>
                    <option value="over_500k">Trên 500.000đ</option>
                  </select>
                </div>

                {/* Dropdown Sắp xếp */}
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Sắp xếp
                  </label>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                    className="input-field w-full text-sm py-1"
                  >
                    <option value="default">Mặc định</option>
                    <option value="price_asc">Giá: Thấp → Cao</option>
                    <option value="price_desc">Giá: Cao → Thấp</option>
                    <option value="name_asc">Tên: A → Z</option>
                    <option value="name_desc">Tên: Z → A</option>
                  </select>
                </div>

                {/* Tìm kiếm tên */}
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tìm tên sản phẩm
                  </label>
                  <input
                    type="text"
                    value={tempSearchName}
                    onChange={(e) => setTempSearchName(e.target.value)}
                    placeholder="Nhập tên tài khoản..."
                    className="input-field w-full text-sm py-1"
                  />
                </div>

                {/* Mã tài khoản */}
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Mã tài khoản
                  </label>
                  <input
                    type="text"
                    value={tempSearchCode}
                    onChange={(e) => setTempSearchCode(e.target.value)}
                    placeholder="VD: ACC123"
                    className="input-field w-full text-sm py-1"
                  />
                </div>

                {/* Nút Tìm kiếm */}
                <button
                  onClick={handleApplyFilters}
                  className="btn-primary px-3 py-1 text-sm flex items-center gap-1 whitespace-nowrap"
                >
                  <FiSearch className="w-3 h-3" />
                  <span>Tìm kiếm</span>
                </button>

                {/* Nút Hủy bỏ */}
                <button
                  onClick={handleResetFilters}
                  className="btn-secondary px-3 py-1 text-sm flex items-center gap-1 whitespace-nowrap"
                >
                  <FiX className="w-3 h-3" />
                  <span>Hủy bỏ</span>
                </button>
              </div>

              {/* Active filters indicator */}
              {(filters.priceRange !== 'all' || filters.sortBy !== 'default' || filters.searchName || filters.searchCode) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {filters.priceRange !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/20 text-primary text-xs rounded">
                      Giá: {filters.priceRange.replace('_', ' ')}
                    </span>
                  )}
                  {filters.sortBy !== 'default' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/20 text-primary text-xs rounded">
                      Sắp xếp: {filters.sortBy.replace('_', ' ')}
                    </span>
                  )}
                  {filters.searchName && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/20 text-primary text-xs rounded">
                      Tên: "{filters.searchName}"
                    </span>
                  )}
                  {filters.searchCode && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/20 text-primary text-xs rounded">
                      Mã: "{filters.searchCode}"
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
        )}
      </div>

      {/* Subcategory Grid - Hiển thị khi đã chọn category cha có danh mục con */}
      {selectedParent && !selectedSubcategory && selectedParent.subcategories?.length > 0 && (
        <SubcategoryGrid
          parentCategory={selectedParent}
          subcategories={selectedParent.subcategories}
          onSelectSubcategory={handleSubcategoryClick}
          accountsByCategory={accountsByCategory}
        />
      )}

      {/* Filtered Accounts Section - Hiển thị khi: không chọn gì, chọn subcategory, hoặc chọn parent không có subcategories */}
      {!(selectedParent && selectedParent.subcategories?.length > 0 && !selectedSubcategory) ? (
      <section className="py-2" ref={accountsRef}>
        <div className="container-custom">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {selectedSubcategory ? (
                <>
                  {selectedSubcategory.thumbnail && (
                    <LazyImage
                      src={selectedSubcategory.thumbnail}
                      alt={selectedSubcategory.name}
                      className="w-6 h-6 rounded object-cover"
                      eager
                      width={24}
                      height={24}
                    />
                  )}
                  {selectedSubcategory.name}
                  {/* Breadcrumb - click parent to go back to subcategory grid */}
                  {selectedParent && (
                    <button
                      onClick={() => setSelectedSubcategory(null)}
                      className="text-xs text-primary hover:text-primary-light ml-2 flex items-center gap-1"
                    >
                      <FiChevronLeft className="w-3 h-3" />
                      <span>{selectedParent.name}</span>
                    </button>
                  )}
                </>
              ) : selectedParent ? (
                <>
                  {selectedParent.thumbnail && (
                    <LazyImage
                      src={selectedParent.thumbnail}
                      alt={selectedParent.name}
                      className="w-6 h-6 rounded object-cover"
                      eager
                      width={24}
                      height={24}
                    />
                  )}
                  {selectedParent.name}
                </>
              ) : (
                'Tất cả tài khoản'
              )}
            </h2>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {filteredAccounts.length > displayLimit
                ? `Hiển thị ${displayLimit} / ${filteredAccounts.length} tài khoản`
                : `${filteredAccounts.length} tài khoản`}
            </div>
          </div>

          {/* Accounts Grid */}
          {accountsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <AccountCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="card text-center py-4">
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Danh mục này chưa có tài khoản nào.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {filteredAccounts.slice(0, displayLimit).map((account) => (
                  <AccountCard
                    key={account._id}
                    account={account}
                    onBuyNow={(e) => handleBuyNow(e, account)}
                  />
                ))}
              </div>

              {/* Load more / Pagination */}
              {filteredAccounts.length > displayLimit && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <PaginationNav
                    currentPage={Math.ceil(displayLimit / PAGE_SIZE)}
                    totalPages={Math.ceil(filteredAccounts.length / PAGE_SIZE)}
                    onPageChange={(page) => setDisplayLimit(page * PAGE_SIZE)}
                    siblingsCount={1}
                  />
                  <button
                    onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
                    className="btn-secondary text-sm px-6 py-2"
                  >
                    Xem thêm ({Math.min(PAGE_SIZE, filteredAccounts.length - displayLimit)} tiếp)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
      ) : null}



      {/* Buy Now Modal */}
      <BuyNowModal
        isOpen={showBuyNowModal}
        account={selectedAccount}
        loading={buyingNow}
        onClose={() => setShowBuyNowModal(false)}
        onConfirm={handleConfirmBuyNow}
      />
    </div>
  );
};

export default Home;
