import express from 'express';
import mongoose from 'mongoose';
import Promotion from '../models/Promotion.js';
import GameAccount from '../models/GameAccount.js';
import Category from '../models/Category.js';
import { clearPromotionCache } from '../utils/priceCalculator.js';

const router = express.Router();

// Chỉ giữ lại các id hợp lệ (ObjectId) — tránh lỗi CastError khi client gửi
// rác (ví dụ chuỗi rỗng do select nhiều trong UI admin).
const sanitizeIds = (ids) =>
  (Array.isArray(ids) ? ids : []).filter((id) => mongoose.Types.ObjectId.isValid(id));

// Kiểm tra id danh mục / danh mục con có tồn tại và đúng loại không.
// `type`: 'any' (danh mục cha hoặc con) hoặc 'child' (chỉ danh mục con).
// Với 'any' ta chấp nhận cả danh mục con để không làm mất dữ liệu của các
// khuyến mãi cũ đã lưu nhầm id danh mục con vào categoryIds.
const filterCategoryIds = async (ids, type) => {
  const valid = sanitizeIds(ids);
  if (valid.length === 0) return [];

  const cats = await Category.find({ _id: { $in: valid } })
    .select('_id parentId')
    .lean();

  return cats
    .filter((cat) => (type === 'child' ? !!cat.parentId : true))
    .map((cat) => String(cat._id));
};

// GET /admin/promotions - Danh sách promotions
router.get('/', async (req, res) => {
  try {
    const { status, applyType, search } = req.query;

    const filter = {};

    // Filter by status
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;

    // Filter by applyType
    if (applyType && ['accounts', 'categories', 'subcategories'].includes(applyType)) {
      filter.applyType = applyType;
    }

    // Search by name
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    const promotions = await Promotion.find(filter)
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 })
      .lean();

    // Calculate applied count for each promotion
    const promotionsWithCount = await Promise.all(
      promotions.map(async (promo) => {
        let appliedCount = 0;

        if (promo.applyType === 'accounts') {
          appliedCount = promo.accountIds.length;
        } else if (promo.applyType === 'categories') {
          appliedCount = promo.categoryIds.length;
        } else if (promo.applyType === 'subcategories') {
          appliedCount = promo.subcategoryIds.length;
        }

        return {
          ...promo,
          appliedCount,
        };
      })
    );

    res.json(promotionsWithCount);
  } catch (error) {
    console.error('Error fetching promotions:', error);
    res.status(500).json({ message: 'Lỗi khi tải danh sách khuyến mãi' });
  }
});

// GET /admin/promotions/:id - Chi tiết promotion
router.get('/:id', async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id)
      .populate('createdBy', 'username')
      .populate('accountIds', 'code title')
      .populate('categoryIds', 'name')
      .populate('subcategoryIds', 'name');

    if (!promotion) {
      return res.status(404).json({ message: 'Không tìm thấy khuyến mãi' });
    }

    res.json(promotion);
  } catch (error) {
    console.error('Error fetching promotion:', error);
    res.status(500).json({ message: 'Lỗi khi tải thông tin khuyến mãi' });
  }
});

// POST /admin/promotions - Tạo promotion mới
router.post('/', async (req, res) => {
  try {
    const {
      name,
      discountPercent,
      isActive,
      applyType,
      accountIds,
      categoryIds,
      subcategoryIds,
      startDate,
      endDate,
    } = req.body;

    // Validation
    if (!name || !discountPercent || !applyType) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    if (discountPercent < 0 || discountPercent > 100) {
      return res.status(400).json({ message: '% giảm giá phải từ 0-100' });
    }

    if (!['accounts', 'categories', 'subcategories'].includes(applyType)) {
      return res.status(400).json({ message: 'Loại áp dụng không hợp lệ' });
    }

    // Chuẩn hóa danh sách id trước khi kiểm tra & lưu.
    const finalAccountIds = applyType === 'accounts' ? sanitizeIds(accountIds) : [];
    const finalCategoryIds =
      applyType === 'categories' ? await filterCategoryIds(categoryIds, 'any') : [];
    const finalSubcategoryIds =
      applyType === 'subcategories' ? await filterCategoryIds(subcategoryIds, 'child') : [];

    // Check có chọn items không
    if (applyType === 'accounts' && finalAccountIds.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn ít nhất 1 tài khoản' });
    }
    if (applyType === 'categories' && finalCategoryIds.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn ít nhất 1 danh mục' });
    }
    if (applyType === 'subcategories' && finalSubcategoryIds.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn ít nhất 1 danh mục con' });
    }

    // Tạo promotion mới
    const newPromotion = new Promotion({
      name,
      discountPercent,
      isActive: isActive !== false, // Default true
      applyType,
      accountIds: finalAccountIds,
      categoryIds: finalCategoryIds,
      subcategoryIds: finalSubcategoryIds,
      startDate: startDate || null,
      endDate: endDate || null,
      createdBy: req.user._id,
    });

    await newPromotion.save();

    // Clear cache
    clearPromotionCache();

    res.status(201).json(newPromotion);
  } catch (error) {
    console.error('Error creating promotion:', error);
    res.status(500).json({ message: 'Lỗi khi tạo khuyến mãi' });
  }
});

// PUT /admin/promotions/:id - Cập nhật promotion
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      discountPercent,
      isActive,
      applyType,
      accountIds,
      categoryIds,
      subcategoryIds,
      startDate,
      endDate,
    } = req.body;

    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) {
      return res.status(404).json({ message: 'Không tìm thấy khuyến mãi' });
    }

    // Validation
    if (discountPercent !== undefined && (discountPercent < 0 || discountPercent > 100)) {
      return res.status(400).json({ message: '% giảm giá phải từ 0-100' });
    }

    // Update fields
    if (name !== undefined) promotion.name = name;
    if (discountPercent !== undefined) promotion.discountPercent = discountPercent;
    if (isActive !== undefined) promotion.isActive = isActive;
    if (applyType !== undefined) promotion.applyType = applyType;
    if (startDate !== undefined) promotion.startDate = startDate || null;
    if (endDate !== undefined) promotion.endDate = endDate || null;

    // Update IDs based on applyType.
    // Chỉ ghi đè khi client thực sự gửi field tương ứng (tránh mất dữ liệu
    // khi request không chứa field nào).
    if (promotion.applyType === 'accounts') {
      if (accountIds !== undefined) promotion.accountIds = sanitizeIds(accountIds);
      promotion.categoryIds = [];
      promotion.subcategoryIds = [];
    } else if (promotion.applyType === 'categories') {
      if (categoryIds !== undefined) {
        promotion.categoryIds = await filterCategoryIds(categoryIds, 'any');
      }
      promotion.accountIds = [];
      promotion.subcategoryIds = [];
    } else if (promotion.applyType === 'subcategories') {
      if (subcategoryIds !== undefined) {
        promotion.subcategoryIds = await filterCategoryIds(subcategoryIds, 'child');
      }
      promotion.accountIds = [];
      promotion.categoryIds = [];
    }

    await promotion.save();

    // Clear cache
    clearPromotionCache();

    res.json(promotion);
  } catch (error) {
    console.error('Error updating promotion:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật khuyến mãi' });
  }
});

// PUT /admin/promotions/:id/toggle - Bật/tắt promotion
router.put('/:id/toggle', async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) {
      return res.status(404).json({ message: 'Không tìm thấy khuyến mãi' });
    }

    promotion.isActive = !promotion.isActive;
    await promotion.save();

    // Clear cache
    clearPromotionCache();

    res.json(promotion);
  } catch (error) {
    console.error('Error toggling promotion:', error);
    res.status(500).json({ message: 'Lỗi khi thay đổi trạng thái' });
  }
});

// DELETE /admin/promotions/:id - Xóa promotion
router.delete('/:id', async (req, res) => {
  try {
    const promotion = await Promotion.findByIdAndDelete(req.params.id);
    if (!promotion) {
      return res.status(404).json({ message: 'Không tìm thấy khuyến mãi' });
    }

    // Clear cache
    clearPromotionCache();

    res.json({ message: 'Đã xóa khuyến mãi' });
  } catch (error) {
    console.error('Error deleting promotion:', error);
    res.status(500).json({ message: 'Lỗi khi xóa khuyến mãi' });
  }
});

// GET /admin/promotions/:id/accounts - Xem danh sách tài khoản được áp dụng
router.get('/:id/accounts', async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) {
      return res.status(404).json({ message: 'Không tìm thấy khuyến mãi' });
    }

    let accounts = [];

    if (promotion.applyType === 'accounts') {
      accounts = await GameAccount.find({ _id: { $in: promotion.accountIds } })
        .select('code title price originalPrice categoryId subcategoryId')
        .populate('categoryId', 'name')
        .populate('subcategoryId', 'name')
        .lean();
    } else if (promotion.applyType === 'categories') {
      // GameAccount lưu danh mục ở `categoryId` (danh mục cha) và
      // `subcategoryId` (danh mục con) — query theo field `category`/`subcategory`
      // (không tồn tại) sẽ luôn trả về mảng rỗng.
      accounts = await GameAccount.find({ categoryId: { $in: promotion.categoryIds } })
        .select('code title price originalPrice categoryId subcategoryId')
        .populate('categoryId', 'name')
        .populate('subcategoryId', 'name')
        .lean();
    } else if (promotion.applyType === 'subcategories') {
      accounts = await GameAccount.find({ subcategoryId: { $in: promotion.subcategoryIds } })
        .select('code title price originalPrice categoryId subcategoryId')
        .populate('categoryId', 'name')
        .populate('subcategoryId', 'name')
        .lean();
    }

    // Chuẩn hóa tên field cho UI: category / subcategory
    const result = accounts.map((acc) => ({
      ...acc,
      category: acc.categoryId || null,
      subcategory: acc.subcategoryId || null,
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching promotion accounts:', error);
    res.status(500).json({ message: 'Lỗi khi tải danh sách tài khoản' });
  }
});

export default router;
