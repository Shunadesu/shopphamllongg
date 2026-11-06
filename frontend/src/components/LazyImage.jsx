import { useState, useEffect, useRef } from 'react';
import { getImageUrl } from '../utils/api';

/**
 * Optimized image component that:
 * - Lazy loads by default (IntersectionObserver + loading="lazy")
 * - Decodes asynchronously (decoding="async")
 * - Shows a skeleton placeholder while loading
 * - Resolves relative paths via getImageUrl automatically
 * - Supports srcSet/sizes for responsive images
 * - Supports rootMargin for fine-tuned preload distance
 */
export default function LazyImage({
  src,
  alt = '',
  className = '',
  style = {},
  // Explicit dimensions — use to set fixed size to avoid layout shift
  width,
  height,
  // Skeleton color (default: slate-200 / dark:slate-800)
  skeletonClassName = 'bg-slate-200 dark:bg-slate-800 animate-pulse',
  // Whether to force eager loading (e.g. hero/above-fold images)
  eager = false,
  // Extra inline style on the <img> tag
  imgStyle = {},
  // Responsive image srcset string (e.g. "url1 320w, url2 640w, url3 960w")
  srcSet,
  // Sizes string for responsive images (e.g. "(max-width: 640px) 50vw, 320px")
  sizes,
  // IntersectionObserver rootMargin — distance before viewport to start loading
  // Set to "200px" for near-visible images, "500px" for images further down
  rootMargin = '200px',
  // Object fit mode:
  //   'cover'       (mặc định) — phủ kín khung, có thể cắt ảnh
  //   'contain'     — ảnh vừa khung (max-w/max-h), không phóng to lên
  //   'contain-full' — ảnh phủ kín khung theo chiều dài nhất nhưng GIỮ
  //                   ĐÚNG TỶ LỆ (object-fit: contain) → không bị cắt, và
  //                   phần trống còn lại lấp nền theo màu container.
  objectFit = 'cover',
  ...rest
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [inView, setInView] = useState(eager); // Start eager images as "in view" immediately
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  // Resolve relative paths to full URLs
  const resolvedSrc = src ? getImageUrl(src) : null;

  // For eager images: mark as in view immediately
  useEffect(() => {
    if (eager) {
      setInView(true);
      return;
    }

    // For lazy images: use IntersectionObserver with rootMargin
    const el = imgRef.current;
    if (!el) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            // Once visible, disconnect — no need to keep observing
            observerRef.current?.disconnect();
          }
        });
      },
      { rootMargin }
    );

    observerRef.current.observe(el);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [eager, rootMargin]);

  // Determine final loading attribute
  // - eager images: load ngay (hero/banner above-the-fold)
  // - lazy images: giao cho trình duyệt tải khi sắp lọt khung nhìn.
  //   (Vẫn có IntersectionObserver phía trên để chủ động gắn src, nhưng
  //   loading="lazy" giúp trình duyệt ưu tiên đúng thứ tự tải.)
  const loadingAttr = eager ? 'eager' : 'lazy';

  // Build image className and style based on objectFit
  const isContain = objectFit === 'contain';
  const isContainFull = objectFit === 'contain-full';

  const imgClassName = isContain
    ? 'max-w-full max-h-full object-contain transition-opacity duration-300'
    : `w-full h-full ${isContainFull ? 'object-contain' : 'object-cover'} transition-opacity duration-300`;

  const imgInlineStyle = isContain
    ? { width: 'auto', height: 'auto', ...imgStyle }
    : imgStyle;

  // Build container className - if no width/height provided, take full parent size
  // Add flex centering for contain mode
  const containerClassName = isContain
    ? `relative overflow-hidden flex items-center justify-center ${className}`
    : `relative overflow-hidden ${className}`;
  const containerStyle = {
    width: width !== undefined ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height !== undefined ? (typeof height === 'number' ? `${height}px` : height) : undefined,
    // Khi biết cả width & height → đặt aspect-ratio để container giữ đúng
    // tỷ lệ ngay từ đầu, tránh nhảy layout khi ảnh tải xong.
    ...(width && height
      ? { aspectRatio: `${width} / ${height}` }
      : {}),
    ...style,
  };

  return (
    <div
      ref={imgRef}
      className={containerClassName}
      style={containerStyle}
    >
      {/* Skeleton placeholder — visible until image loads or errors */}
      {!loaded && !error && (
        <div
          className={`absolute inset-0 ${skeletonClassName}`}
          aria-hidden="true"
        />
      )}

      {/* Error fallback */}
      {error && (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800 ${skeletonClassName}`}
          aria-hidden="true"
        >
          <span className="text-slate-400 text-xs">Không tải được ảnh</span>
        </div>
      )}

      {/* Actual image — only render src when inView is true (lazy images)
          eager images always have src rendered immediately */}
      {resolvedSrc && (eager || inView) && (
        <img
          src={resolvedSrc}
          alt={alt}
          loading={loadingAttr}
          decoding="async"
          // width/height trực tiếp trên <img> để browser reserve chỗ
          // trước khi ảnh tải xong → giảm CLS. Trước đây chỉ đặt trên
          // wrapper <div> nên trình duyệt không biết intrinsic size.
          width={width}
          height={height}
          srcSet={srcSet || undefined}
          sizes={sizes || undefined}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`${imgClassName} ${loaded ? 'opacity-100' : 'opacity-0'}`}
          style={imgInlineStyle}
          {...rest}
        />
      )}
    </div>
  );
}
