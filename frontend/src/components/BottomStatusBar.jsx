import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiHome, FiUser, FiCreditCard, FiUserCheck } from 'react-icons/fi';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';
import { useTopDepositors } from '../hooks/useDeposits';
import { useProtectedNavigate } from '../hooks/useProtectedNavigate';

const BottomStatusBar = ({ onOpenAuth }) => {
  const [isOnline, setIsOnline] = useState(false);
  const location = useLocation();
  const { isAuthenticated, user } = useAuthStore();
  const { data: topDepositors, monthLabel } = useTopDepositors({ limit: 20 });

  // Chặn điều hướng tới /profile?view=deposit khi chưa đăng nhập:
  // chỉ mở drawer đăng nhập, KHÔNG đổi URL (tránh màn hình trắng + URL sai).
  const { guardClick } = useProtectedNavigate(onOpenAuth);

  // Check API connection
  useEffect(() => {
    const checkConnection = async () => {
      try {
        await api.get('/health');
        setIsOnline(true);
      } catch (error) {
        setIsOnline(false);
      }
    };

    checkConnection();
    // Check connection every 30 seconds
    const interval = setInterval(checkConnection, 30000);

    return () => clearInterval(interval);
  }, []);

  // Dữ liệu thật từ server — server đã sort totalAmount giảm dần.
  // Không còn mock data: thanh này chỉ hiển thị người nạp thật.
  const topList = Array.isArray(topDepositors) ? topDepositors : [];

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
  };

  // Navigation items for mobile
  const navItems = [
    { path: '/', icon: FiHome, label: 'Trang chủ' },
    {
      path: '/profile?view=deposit',
      icon: FiCreditCard,
      label: 'Nạp tiền',
      // Chưa đăng nhập → chỉ mở drawer, không đổi URL.
      onClick: guardClick('/profile?view=deposit'),
    },
    { path: user ? '/profile' : '#', icon: FiUserCheck, label: user?.fullName || 'Đăng nhập' }
  ];

  // Check if current path matches
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Desktop - Bottom Status Bar */}
      <div className="hidden md:block fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-t border-gray-700/50">
        <div className="container mx-auto px-4 h-10 flex items-center justify-between gap-4">
          {/* Left side - Online status */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-300 font-medium">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Right side - Top depositors with marquee animation */}
          <div className="flex items-center space-x-4 overflow-hidden justify-start w-full">
            <span className="text-xs text-gray-400 flex-shrink-0">
              {monthLabel ? `Top nạp ${monthLabel}:` : 'Top nạp tháng:'}
            </span>
            {topList.length === 0 ? (
              <span className="text-xs text-gray-500 flex-shrink-0">
                Chưa có dữ liệu nạp trong tháng
              </span>
            ) : (
              <div className="relative overflow-hidden flex-1">
                {/* Gradient fade effects */}
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-900 to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-900 to-transparent z-10 pointer-events-none" />

                {/* Scrolling container */}
                <div className="marquee-container">
                  <div className="marquee-content">
                    {topList.map((depositor, index) => (
                      <span
                        key={depositor._id || `dep-${index}`}
                        className="inline-flex items-center"
                      >
                        <span className="text-xs text-gray-300">
                          {depositor.fullName}
                        </span>
                        <span className="text-xs font-semibold mx-1 text-green-400">
                          {formatCurrency(depositor.totalAmount)}
                        </span>
                        <span className="text-gray-600 mx-2">•</span>
                      </span>
                    ))}
                    {/* Duplicate for seamless loop */}
                    {topList.map((depositor, index) => (
                      <span
                        key={`dup-${depositor._id || index}`}
                        className="inline-flex items-center"
                      >
                        <span className="text-xs text-gray-300">
                          {depositor.fullName}
                        </span>
                        <span className="text-xs font-semibold mx-1 text-green-400">
                          {formatCurrency(depositor.totalAmount)}
                        </span>
                        <span className="text-gray-600 mx-2">•</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile - Footer Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            
            return (
              <Link
                key={item.path}
                to={item.path === '#' ? (isAuthenticated ? '/profile' : '/') : item.path}
                onClick={item.onClick}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                  active 
                    ? 'text-primary' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] mt-1 font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Marquee: CSS nằm trong src/index.css (.marquee-container / .marquee-content) */}
    </>
  );
};

export default BottomStatusBar;
