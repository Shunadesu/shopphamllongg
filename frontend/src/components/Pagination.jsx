/**
 * Pagination control — minimal, no external library dependency.
 * Shows: First | Prev | page numbers | Next | Last
 *
 * @param {number} currentPage  - 1-based current page
 * @param {number} totalPages  - Total number of pages
 * @param {function} onPageChange - Called with the new page number (1-based)
 * @param {number} siblingsCount - How many pages to show on each side of current (default: 1)
 */
export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  siblingsCount = 1,
}) {
  if (!totalPages || totalPages <= 1) return null;

  // Build the list of page numbers to show (with ellipsis)
  const range = (from, to) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

  const getPageNumbers = () => {
    const totalNumbers = siblingsCount * 2 + 5; // siblings + first/last + current + 2 ellipsis
    if (totalPages <= totalNumbers) {
      return range(1, totalPages);
    }

    const leftSibling = Math.max(currentPage - siblingsCount, 1);
    const rightSibling = Math.min(currentPage + siblingsCount, totalPages);

    const showLeftEllipsis = leftSibling > 2;
    const showRightEllipsis = rightSibling < totalPages - 1;

    if (!showLeftEllipsis && showRightEllipsis) {
      const leftRange = range(1, 3 + siblingsCount * 2);
      return [...leftRange, '...', totalPages];
    }
    if (showLeftEllipsis && !showRightEllipsis) {
      const rightRange = range(totalPages - (2 + siblingsCount * 2), totalPages);
      return [1, '...', ...rightRange];
    }
    // Both ellipses
    const middleRange = range(leftSibling, rightSibling);
    return [1, '...', ...middleRange, '...', totalPages];
  };

  const pages = getPageNumbers();

  const go = (page) => {
    const p = Math.max(1, Math.min(page, totalPages));
    onPageChange?.(p);
  };

  return (
    <nav
      aria-label="Phân trang"
      className="flex items-center justify-center gap-1 mt-6 flex-wrap"
    >
      {/* First */}
      <PageBtn
        label="«"
        title="Trang đầu"
        onClick={() => go(1)}
        disabled={currentPage === 1}
      />

      {/* Prev */}
      <PageBtn
        label="‹"
        title="Trang trước"
        onClick={() => go(currentPage - 1)}
        disabled={currentPage === 1}
      />

      {pages.map((page, idx) =>
        page === '...' ? (
          <span
            key={`ellipsis-${idx}`}
            className="px-2 py-1 text-slate-400 select-none"
          >
            …
          </span>
        ) : (
          <PageBtn
            key={page}
            label={page}
            onClick={() => go(page)}
            active={page === currentPage}
          />
        )
      )}

      {/* Next */}
      <PageBtn
        label="›"
        title="Trang sau"
        onClick={() => go(currentPage + 1)}
        disabled={currentPage === totalPages}
      />

      {/* Last */}
      <PageBtn
        label="»"
        title="Trang cuối"
        onClick={() => go(totalPages)}
        disabled={currentPage === totalPages}
      />
    </nav>
  );
}

function PageBtn({ label, onClick, active, disabled, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-current={active ? 'page' : undefined}
      className={[
        'min-w-[36px] h-9 px-2 rounded text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-white'
          : disabled
          ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
