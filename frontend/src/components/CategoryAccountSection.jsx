import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiChevronRight } from 'react-icons/fi';
import AccountCard from './AccountCard';
import { AccountCardSkeleton } from './SkeletonLoader';
import LazyImage from './LazyImage';

/**
 * Renders a section of accounts filtered by a category (optionally with subcategory chips).
 * Extracted from Home.jsx to avoid re-creating function references on every Home render.
 *
 * @param {object} category          - The parent category object
 * @param {object[]} accounts         - All accounts to filter from
 * @param {boolean} isLoading        - Show skeleton if true
 * @param {function} onSelectSubcategory - Called with null (all) or a subcategory object
 * @param {string|null} selectedSubcategoryId - ID of currently active subcategory
 * @param {function} onBuyNow        - Called with (e, account) on buy button click
 */
export default function CategoryAccountSection({
  category,
  accounts,
  isLoading,
  onSelectSubcategory,
  selectedSubcategoryId,
  onBuyNow,
}) {
  const hasSubcategories = category?.subcategories?.length > 0;
  const [activeSubcategory, setActiveSubcategory] = useState(null);

  const filteredAccounts = useMemo(() => {
    if (!activeSubcategory) return accounts || [];
    return (accounts || []).filter((acc) => acc.category?._id === activeSubcategory._id);
  }, [accounts, activeSubcategory]);

  const handleSubcategoryClick = (sub) => {
    const next = activeSubcategory?._id === sub._id ? null : sub;
    setActiveSubcategory(next);
    onSelectSubcategory?.(next);
  };

  if (isLoading) {
    return (
      <section className="py-2">
        <div className="container-custom">
          <div className="flex items-center justify-between mb-2">
            <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-32 animate-pulse" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20 animate-pulse" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <AccountCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!accounts || accounts.length === 0) return null;

  return (
    <section className="py-2">
      <div className="container-custom">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {category?.thumbnail && (
              <LazyImage
                src={category.thumbnail}
                alt={category.name}
                className="w-6 h-6 rounded object-cover"
                eager
              />
            )}
            {category?.name}
            {activeSubcategory && (
              <span className="text-sm font-normal text-primary">
                / {activeSubcategory.name}
              </span>
            )}
          </h2>
          <Link
            to={`/shop?category=${category._id}${activeSubcategory ? `&subcategory=${activeSubcategory._id}` : ''}`}
            className="text-primary hover:text-primary-light flex items-center gap-1 text-xs font-medium transition-colors"
          >
            <span>Xem tất cả</span>
            <FiChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Subcategory Chips */}
        {hasSubcategories && (
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => handleSubcategoryClick(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                !activeSubcategory
                  ? 'bg-primary text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              Tất cả ({accounts.length})
            </button>
            {category.subcategories.map((sub) => {
              const count = accounts.filter((acc) => acc.category?._id === sub._id).length;
              if (count === 0) return null;
              return (
                <button
                  key={sub._id}
                  onClick={() => handleSubcategoryClick(sub)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                    activeSubcategory?._id === sub._id
                      ? 'bg-primary text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  <span>{sub.name}</span>
                  <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Empty state for subcategory */}
        {activeSubcategory && filteredAccounts.length === 0 && (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
            Chưa có tài khoản trong danh mục con này
          </div>
        )}

        {/* Accounts Grid */}
        {filteredAccounts.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {filteredAccounts.slice(0, 8).map((account) => (
              <AccountCard
                key={account._id}
                account={account}
                onBuyNow={onBuyNow}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
