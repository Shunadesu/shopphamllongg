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
  // Use eager only when inView is already true (eager images); lazy images rely on src injection
  const loadingAttr = eager ? 'eager' : undefined;

  return (
    <div
      ref={imgRef}
      className={`relative overflow-hidden ${className}`}
      style={{
        width: width !== undefined ? (typeof width === 'number' ? `${width}px` : width) : undefined,
        height: height !== undefined ? (typeof height === 'number' ? `${height}px` : height) : undefined,
        ...style,
      }}
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
          srcSet={srcSet || undefined}
          sizes={sizes || undefined}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          style={imgStyle}
          {...rest}
        />
      )}
    </div>
  );
}
