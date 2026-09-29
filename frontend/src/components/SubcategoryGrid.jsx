import LazyImage from './LazyImage';

/**
 * Renders a grid of subcategories for a selected parent category.
 * Extracted from Home.jsx to avoid re-creating function references on every Home render.
 *
 * @param {object} parentCategory      - The parent category object
 * @param {object[]} subcategories     - Array of subcategory objects
 * @param {function} onSelectSubcategory - Called with the selected subcategory object
 * @param {object} accountsByCategory  - Map of categoryId → accounts[]
 */
export default function SubcategoryGrid({
  parentCategory,
  subcategories,
  onSelectSubcategory,
  accountsByCategory,
}) {
  return (
    <section className="py-2">
      <div className="container-custom">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {parentCategory.thumbnail && (
              <LazyImage
                src={parentCategory.thumbnail}
                alt={parentCategory.name}
                className="w-6 h-6 rounded object-cover"
                eager
              />
            )}
            {parentCategory.name}
          </h2>
        </div>

        {/* Subcategories Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {subcategories.map((subcategory) => {
            const accountCount = (accountsByCategory[subcategory._id] || []).length;

            return (
              <button
                key={subcategory._id}
                onClick={() => onSelectSubcategory(subcategory)}
                className="category-card flex flex-col h-full"
              >
                {/* Image container - chiều cao cố định 120px từ CSS giống category cha */}
                <div className="category-card__image">
                  {subcategory.thumbnail ? (
                    <LazyImage
                      src={subcategory.thumbnail}
                      alt={subcategory.name}
                      objectFit="contain"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-700 via-blue-600 to-sky-300 flex items-center justify-center">
                      <span className="text-white text-xl font-bold opacity-50">
                        {subcategory.name.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                <h3 className="text-slate-900 bg-primary text-transparent px-2 py-1 dark:text-white text-sm font-semibold text-center h-[3rem] flex items-center justify-center leading-5">
                  <span className="line-clamp-2">{subcategory.name}</span>
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs text-center mt-1 line-clamp-2 h-[2rem] leading-4">
                  {subcategory.description || '\u00A0'}
                </p>
                <span className="category-count__label text-center block mt-auto pt-2 text-primary font-medium">
                  {accountCount > 0 ? `${accountCount} tài khoản` : 'Sắp có'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
