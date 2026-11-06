import Promotion from '../models/Promotion.js';
import Category from '../models/Category.js';

// Cache for active promotions
let promotionCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60000; // 1 minute

/**
 * Clear promotion cache (call when promotions are modified)
 */
export function clearPromotionCache() {
  promotionCache = null;
  cacheTimestamp = null;
}

// Chuẩn hóa 1 giá trị có thể là ObjectId / string / document đã populate về
// chuỗi id.
//
// Lý do cần hàm này: account được `.populate('categoryId')` trước khi tính
// giá → `account.categoryId` là object { _id, name, ... }, không phải ObjectId.
// So sánh trực tiếp `id.toString() === account.categoryId.toString()` sẽ
// luôn sai → khuyến mãi theo danh mục/danh mục con không bao giờ khớp.
const toIdString = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    const id = value._id ?? value.id;
    return id ? String(id) : null;
  }
  return String(value);
};

/**
 * Load active promotions + map danh mục cha → danh mục con.
 */
async function loadPromotionCache() {
  const [promotions, categories] = await Promise.all([
    Promotion.find({ isActive: true }),
    Category.find({}, '_id parentId').lean(),
  ]);

  // Map: id danh mục cha → danh sách id danh mục con.
  // Cần để khuyến mãi áp cho danh mục cha cũng áp được cho tài khoản nằm
  // trong danh mục con (kể cả dữ liệu cũ chỉ lưu categoryId = danh mục con).
  const childrenMap = new Map();
  for (const cat of categories) {
    if (!cat.parentId) continue;
    const key = String(cat.parentId);
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key).push(String(cat._id));
  }

  promotionCache = { promotions, childrenMap };
  cacheTimestamp = Date.now();
  return promotionCache;
}

/**
 * Get active promotions with caching
 */
async function getActivePromotions() {
  const now = Date.now();

  // Return cached promotions if still valid
  if (promotionCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return promotionCache;
  }

  // Fetch fresh promotions
  try {
    return await loadPromotionCache();
  } catch (error) {
    // Không được làm sập trang chỉ vì lỗi đọc khuyến mãi → trả cache cũ
    // (nếu có) để tài khoản vẫn hiển thị với giá gốc.
    console.error('Promotion cache error:', error.message);
    return promotionCache || { promotions: [], childrenMap: new Map() };
  }
}

/**
 * Find applicable promotion for an account
 * Priority: accounts > subcategories > categories
 * If multiple promotions apply, return the one with highest discount
 */
export function findApplicablePromotion(account, activePromotions, childrenMap = null) {
  // Cho phép truyền trực tiếp mảng promotion hoặc object cache
  // ({ promotions, childrenMap }) cho tiện.
  const promos = Array.isArray(activePromotions)
    ? activePromotions
    : activePromotions?.promotions || [];
  if (promos.length === 0) return null;

  const children = childrenMap || activePromotions?.childrenMap || null;

  const accountId = toIdString(account._id);
  const categoryId = toIdString(account.categoryId);
  const subcategoryId = toIdString(account.subcategoryId);
  // "Danh mục hiệu dụng" = danh mục con nếu có, không thì danh mục cha.
  const effectiveCategoryId = subcategoryId || categoryId;

  const applicablePromotions = promos.filter((promo) => {
    // Check if promotion is currently active (including date range)
    if (promo.isCurrentlyActive && typeof promo.isCurrentlyActive === 'function') {
      if (!promo.isCurrentlyActive()) return false;
    }

    // Check by apply type
    if (promo.applyType === 'accounts') {
      return (promo.accountIds || []).some((id) => toIdString(id) === accountId);
    }

    if (promo.applyType === 'subcategories') {
      if (!subcategoryId) return false;
      return (promo.subcategoryIds || []).some((id) => toIdString(id) === subcategoryId);
    }

    if (promo.applyType === 'categories') {
      const selected = (promo.categoryIds || []).map(toIdString).filter(Boolean);
      if (selected.length === 0) return false;

      // Mở rộng: khuyến mãi chọn danh mục cha cũng áp cho danh mục con.
      const expanded = new Set(selected);
      for (const id of selected) {
        for (const child of children?.get(id) || []) expanded.add(child);
      }

      return (
        expanded.has(categoryId) ||
        expanded.has(subcategoryId) ||
        expanded.has(effectiveCategoryId)
      );
    }

    return false;
  });

  // Return promotion with highest discount
  if (applicablePromotions.length === 0) return null;

  return applicablePromotions.reduce((highest, current) => {
    return current.discountPercent > highest.discountPercent ? current : highest;
  });
}

/**
 * Calculate display price for an account
 * Luôn lấy mức giảm lớn nhất trong 2 mức: khuyến mãi hoặc giảm giá admin.
 */
export function calculateDisplayPrice(account, activePromotions = []) {
  const originalPrice = account.originalPrice || account.price || 0;

  // Khi thiếu giá gốc (dữ liệu cũ) thì không áp lại % giảm giá admin —
  // giá lưu trong DB đã là giá bán cuối.
  const adminDiscountPercent = account.originalPrice
    ? account.adminDiscountPercent || 0
    : 0;

  const promotion = findApplicablePromotion(account, activePromotions);

  const adminPrice = Math.round(originalPrice * (1 - adminDiscountPercent / 100));
  const promoPrice = promotion
    ? Math.round(originalPrice * (1 - promotion.discountPercent / 100))
    : null;

  // Khuyến mãi chỉ dùng khi nó cho giá thấp hơn giá admin — tránh việc
  // hiển thị (và thu tiền) cao hơn giá bán thực của tài khoản.
  const usePromotion = promoPrice !== null && promoPrice < adminPrice;
  const finalPrice = usePromotion ? promoPrice : adminPrice;

  return {
    originalPrice,
    finalPrice,
    discountPercent: usePromotion ? promotion.discountPercent : adminDiscountPercent,
    promotionName: usePromotion ? promotion.name : null,
    promotionId: usePromotion ? promotion._id : null,
    hasPromotion: usePromotion,
  };
}

/**
 * Calculate price from originalPrice and discount percent
 */
export function calculatePriceFromDiscount(originalPrice, discountPercent) {
  return Math.round(originalPrice * (1 - discountPercent / 100));
}

/**
 * Apply promotion pricing to accounts array
 */
export async function applyPromotionPricing(accounts) {
  // Get all active promotions (with caching)
  const activePromotions = await getActivePromotions();

  return accounts.map((account) => {
    const accountObj = typeof account.toObject === 'function' ? account.toObject() : account;
    const pricing = calculateDisplayPrice(accountObj, activePromotions);

    return {
      ...accountObj,
      originalPrice: pricing.originalPrice,
      price: pricing.finalPrice,
      discountPercent: pricing.discountPercent,
      promotionName: pricing.promotionName,
      promotionId: pricing.promotionId,
      hasPromotion: pricing.hasPromotion,
    };
  });
}

/**
 * Apply promotion pricing to single account
 */
export async function applyPromotionPricingSingle(account) {
  const activePromotions = await getActivePromotions();
  const accountObj = typeof account.toObject === 'function' ? account.toObject() : account;
  const pricing = calculateDisplayPrice(accountObj, activePromotions);

  return {
    ...accountObj,
    originalPrice: pricing.originalPrice,
    price: pricing.finalPrice,
    discountPercent: pricing.discountPercent,
    promotionName: pricing.promotionName,
    promotionId: pricing.promotionId,
    hasPromotion: pricing.hasPromotion,
  };
}

/**
 * Giá thực tế phải thu khi mua tài khoản — giống hệt giá hiển thị trên UI
 * (đã áp khuyến mãi nếu có).
 */
export async function getEffectivePrice(account) {
  const activePromotions = await getActivePromotions();
  const accountObj = typeof account.toObject === 'function' ? account.toObject() : account;
  return calculateDisplayPrice(accountObj, activePromotions).finalPrice;
}

export default {
  findApplicablePromotion,
  calculateDisplayPrice,
  calculatePriceFromDiscount,
  applyPromotionPricing,
  applyPromotionPricingSingle,
  getEffectivePrice,
  clearPromotionCache,
};
