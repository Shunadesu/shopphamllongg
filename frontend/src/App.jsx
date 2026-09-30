import { Routes, Route, useLocation, Navigate, useParams } from 'react-router-dom';
import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import ContactFixed from './components/ContactFixed';
import BottomStatusBar from './components/BottomStatusBar';
import ProtectedRoute from './components/ProtectedRoute';
import NotificationModal from './components/NotificationModal';
import SEOHead from './components/SEOHead';
import Loading from './components/Loading';
import { useThemeStore } from './store/themeStore';
import { useSettingsStore } from './store/data/settingsStore';
import { useCartStore } from './store/cartStore';
import { getImageUrl } from './utils/api';

// Pages — Home is lazy-loaded to reduce initial bundle
const Home = lazy(() => import('./pages/Home'));
import Shop from './pages/Shop';
import AccountDetail from './pages/AccountDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Profile from './pages/Profile';
import SpinWheel from './pages/SpinWheel';
import SpinHistory from './pages/SpinHistory';
import Guide from './pages/Guide';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import FAQ from './pages/FAQ';
import AccountSecurity from './pages/AccountSecurity';
import CardDeposit from './pages/CardDeposit';

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }, [pathname]);

  return null;
}

// Forward dynamic path params into query string (for backward-compat routes)
function RedirectWithParams({ paramName, view = 'order-detail', extraParams = {} }) {
  const params = useParams();
  const value = params[paramName];
  const search = new URLSearchParams({ view, ...extraParams });
  if (value) search.set(paramName, value);
  return <Navigate to={`/profile?${search.toString()}`} replace />;
}

function App() {
  const applyDefaultTheme = useThemeStore((s) => s.applyDefault);
  const settings = useSettingsStore((s) => s.settings);

  // Dọn cache cũ trong localStorage (phiên bản trước dùng persist có thể đã lưu
  // state với shape không đúng — vd. socialLinks là object thay vì array —
  // gây lỗi '.map is not a function' khi render). Chỉ chạy 1 lần.
  useEffect(() => {
    if (!localStorage.getItem('app-storage-cleaned-v2')) {
      // catalog-storage: đã bỏ persist ở catalogStore.js
      localStorage.removeItem('catalog-storage');
      // deposit-storage: vẫn dùng persist nhưng reset để đảm bảo shape đúng
      localStorage.removeItem('deposit-storage');
      // settings-storage: bump version để migrate xóa field corrupted
      localStorage.removeItem('settings-storage');
      localStorage.setItem('app-storage-cleaned-v2', '1');
    }
  }, []);

  // ── Favicon sync ──────────────────────────────────────────────────────────
  // Fallback to /favicon.jpg (committed in public/) whenever admin has not
  // uploaded a custom favicon. The static <link id="favicon-link"> in
  // index.html also points here, so the tab icon is never blank.
  const DEFAULT_FAVICON = '/favicon.jpg';

  // Track the last applied favicon value to avoid redundant DOM work.
  // Using refs (not state) avoids a stale-closure issue where the effect
  // captures the old `settings` value even after a re-render.
  const prevFavicon = useRef(null);

  // Track the last seen source ("API" vs "HARD-CODED") so we log a source
  // change ONCE per transition instead of every effect run. Without this,
  // the 10 s settings poll would re-print "HARD-CODED" on every tick.
  const prevFaviconSource = useRef(null);

  // Update favicon whenever settings change.
  //
  // Implementation notes:
  //  1. We REMOVE the old link and APPEND a new one (instead of replaceChild)
  //     so the browser treats it as a brand-new <link> element. Just mutating
  //     .href on the existing element can be ignored by Chrome's dedicated
  //     favicon cache when the URL is the same origin/path.
  //  2. We derive type from the URL extension because index.html sets
  //     type="image/svg+xml" (for /favicon.svg), but admin uploads are usually
  //     .jpg/.png/.webp. A MIME mismatch can silently break rendering.
  //  3. We look up the old link by id first, then fall back to any
  //     link[rel="icon"] so the code is resilient to template changes.
  //  4. Cache-bust query param is appended via ?t= or &t= so the URL is always
  //     unique even when getImageUrl() returns a URL that already has ?query=.
  //  5. When settings.favicon is missing/empty, we still re-apply the default
  //     favicon so the tab icon never silently disappears.
  useEffect(() => {
    const next = settings?.favicon || DEFAULT_FAVICON;

    // ── Source tracking ────────────────────────────────────────────────────
    // Track the favicon SOURCE (API vs HARD-CODED) independently from the URL
    // so the source is logged ONCE per change instead of on every effect run.
    // Without this, the 10 s settings poll would spam "API" / "HARD-CODED"
    // repeatedly, drowning out the actually-useful "URL changed" event.
    const isFromApi = !!settings?.favicon;
    const source = isFromApi ? 'API' : 'HARD-CODED';
    if (source !== prevFaviconSource.current) {
      const prevSource = prevFaviconSource.current || '(initial)';
      const sourceColor = isFromApi
        ? 'background:#10b981;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;'
        : 'background:#f59e0b;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;';
      console.log(
        `%c[Favicon]%c source → %c${source}%c (${prevSource} → ${source})`,
        'background:#2563eb;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
        'color:inherit',
        sourceColor,
        'color:inherit'
      );
      prevFaviconSource.current = source;
    }

    // ── URL apply ─────────────────────────────────────────────────────────
    // Only run the DOM mutation when the URL actually changes. Same source +
    // same URL = no-op (no console spam from the 10 s polling).
    if (next === prevFavicon.current) return;
    const prev = prevFavicon.current;
    prevFavicon.current = next;

    const ts = Date.now();
    const baseHref = getImageUrl(next);
    const newHref = baseHref.includes('?')
      ? `${baseHref}&t=${ts}`
      : `${baseHref}?t=${ts}`;

    // Detect MIME type from the path (strip query/fragment first).
    const pathOnly = baseHref.split('?')[0].split('#')[0].toLowerCase();
    let mimeType = null;
    if (pathOnly.endsWith('.svg')) mimeType = 'image/svg+xml';
    else if (pathOnly.endsWith('.png')) mimeType = 'image/png';
    else if (pathOnly.endsWith('.jpg') || pathOnly.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (pathOnly.endsWith('.webp')) mimeType = 'image/webp';
    else if (pathOnly.endsWith('.ico')) mimeType = 'image/x-icon';
    else if (pathOnly.endsWith('.gif')) mimeType = 'image/gif';

    console.log(
      `%c[Favicon]%c url changed\n  prev: ${prev || '(none)'}\n  next: ${newHref}\n  type: ${mimeType || '(auto)'}`,
      'background:#2563eb;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
      'color:inherit'
    );

    // Locate the existing favicon link (by id first, then by rel).
    const oldLink =
      document.getElementById('favicon-link') ||
      document.querySelector('link[rel="icon"]');

    // Build the replacement <link> BEFORE removing the old one so we don't
    // briefly end up with no favicon link in the DOM.
    const newLink = document.createElement('link');
    newLink.rel = 'icon';
    newLink.id = 'favicon-link';
    if (mimeType) newLink.type = mimeType;
    newLink.href = newHref;

    if (oldLink && oldLink.parentNode) {
      oldLink.parentNode.removeChild(oldLink);
    }
    document.head.appendChild(newLink);

    console.log(
      `%c[Favicon]%c ✅ applied to <link id="favicon-link">`,
      'background:#10b981;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;',
      'color:inherit'
    );
  }, [settings?.favicon, settings]);

  // ── Real-time settings sync ───────────────────────────────────────────────
  // Three signals can trigger a fresh settings fetch on the frontend:
  //   1. Polling every 10 s (cheap fallback for any signal we miss)
  //   2. visibilitychange — when the user returns to the tab
  //   3. BroadcastChannel 'settings-updated' (instant cross-tab signal from admin)
  //   4. window 'storage' event (fallback for older browsers)
  //
  // On every trigger we clear the TTL cache and force a refetch so the
  // new favicon / seoTitle / etc. show up immediately instead of waiting
  // up to 30 minutes (the store's stale threshold).
  useEffect(() => {
    const fetchFresh = () => {
      useSettingsStore.getState().clearCache();
      useSettingsStore.getState().fetchSettings(true).catch(() => {});
    };

    // 1. Polling fallback
    const pollId = setInterval(fetchFresh, 10_000);

    // 2. Visibility — when user returns to the tab
    const onVisibility = () => {
      if (!document.hidden) fetchFresh();
    };

    // 3. BroadcastChannel — instant cross-tab push from admin
    let bc = null;
    try {
      bc = new BroadcastChannel('settings-updated');
      bc.onmessage = (e) => {
        if (e?.data?.type === 'settings-updated') fetchFresh();
      };
    } catch (_) {
      // Browser doesn't support BroadcastChannel — fine, we have storage event fallback.
    }

    // 4. localStorage 'storage' event — works in older browsers and as a fallback
    const onStorage = (e) => {
      if (e.key === 'settings-updated') fetchFresh();
    };

    // Custom event for in-tab admin → frontend (e.g. preview iframe)
    const onSettingsEvent = () => fetchFresh();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    window.addEventListener('settings-updated', onSettingsEvent);

    return () => {
      clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('settings-updated', onSettingsEvent);
      if (bc) bc.close();
    };
  }, []);

  // Drawer state
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [authInitialView, setAuthInitialView] = useState('login');

  // Warm cache for hot data on mount (silent on error).
  // settings/socialLinks/sliders/notifications persist via localStorage so F5 stays instant.
  // cart is fetched fresh on mount and on auth changes.
  useEffect(() => {
    useSettingsStore.getState().fetchSettings(true).catch(() => {});
    useSettingsStore.getState().fetchSocialLinks().catch(() => {});
    useSettingsStore.getState().fetchSliders().catch(() => {});
    useSettingsStore.getState().fetchNotifications().catch(() => {});
    useCartStore.getState().fetchCart().catch(() => {});
  }, []);

  // Apply admin default theme on first load (only if user has no preference)
  useEffect(() => {
    if (settings) {
      applyDefaultTheme(settings.defaultTheme || 'light');
    }
  }, [settings, applyDefaultTheme]);

  // Drawer handlers
  const handleOpenAuth = useCallback((view = 'login') => {
    setAuthInitialView(view);
    setIsAuthOpen(true);
  }, []);

  const handleCloseAuth = useCallback(() => {
    setIsAuthOpen(false);
  }, []);

  const handleOpenCart = useCallback(() => {
    setIsCartOpen(true);
  }, []);

  const handleCloseCart = useCallback(() => {
    setIsCartOpen(false);
  }, []);

  // Listen for openAuthDrawer event (from ProtectedRoute)
  useEffect(() => {
    const handleOpenAuthDrawer = (e) => {
      const view = e.detail?.view || 'login';
      handleOpenAuth(view);
    };

    window.addEventListener('openAuthDrawer', handleOpenAuthDrawer);
    return () => window.removeEventListener('openAuthDrawer', handleOpenAuthDrawer);
  }, [handleOpenAuth]);

  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      {/* Default SEO Head - reads settings from useSettingsStore automatically,
          so admin SEO settings flow all the way through to the tab title.
          Individual pages can still override via props (e.g. AccountDetail). */}
      <SEOHead />
      {/* Pass drawer handlers to Header */}
      <Header
        onOpenAuth={handleOpenAuth}
        onOpenCart={handleOpenCart}
        isAuthOpen={isAuthOpen}
        isCartOpen={isCartOpen}
        onCloseAuth={handleCloseAuth}
        onCloseCart={handleCloseCart}
        authInitialView={authInitialView}
      />

      <main className="flex-grow my-4">
        <Routes>
          {/* Redirect old orders routes (root-level /orders/:id) to Profile?view=order-detail */}
          <Route path="/orders/:id" element={<RedirectWithParams paramName="orderId" />} />

          {/* Public Routes */}
          <Route path="/" element={<Suspense fallback={<Loading />}><Home /></Suspense>} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/shop/:categorySlug" element={<Shop />} />
          <Route path="/account/:id" element={<AccountDetail onOpenAuth={handleOpenAuth} />} />

          {/* Cart - Public (no auth required to add/view cart) */}
          <Route path="/cart" element={<Cart onOpenAuth={handleOpenAuth} />} />

          {/* Info Pages */}
          <Route path="/guide" element={<Guide />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/account-security" element={<AccountSecurity />} />

          {/* Protected Routes */}
          <Route
            path="/checkout"
            element={
              <ProtectedRoute>
                <Checkout />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/spin"
            element={<SpinWheel />}
          />
          <Route
            path="/spin/history"
            element={
              <ProtectedRoute>
                <SpinHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/deposit/card"
            element={
              <ProtectedRoute>
                <CardDeposit />
              </ProtectedRoute>
            }
          />
          {/* Redirect backward-compat routes to Profile query params */}
          <Route path="/profile/orders" element={<Navigate to="/profile?view=orders" replace />} />
          <Route
            path="/profile/orders/:id"
            element={<RedirectWithParams paramName="orderId" />}
          />
          <Route path="/profile/deposits" element={<Navigate to="/profile?view=deposits" replace />} />
          <Route path="/profile/purchased-accounts" element={<Navigate to="/profile?view=purchased-accounts" replace />} />
          <Route path="/profile/policies" element={<Navigate to="/profile?view=policies" replace />} />
        </Routes>
      </main>

      <Footer />
      <ContactFixed />
      <BottomStatusBar />
      <NotificationModal />
    </div>
  );
}

export default App;
