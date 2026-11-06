import express from 'express';
import mongoose from 'mongoose';
import GameAccount from '../models/GameAccount.js';
import Category from '../models/Category.js';
import { auth } from '../middleware/auth.js';
import { decrypt } from '../utils/encryption.js';
import { applyPromotionPricing, applyPromotionPricingSingle } from '../utils/priceCalculator.js';

const router = express.Router();

// Tách danh sách id từ query string ("id1,id2") và loại bỏ id không hợp lệ
// (tránh lỗi CastError của MongoDB khi client gửi rác).
const parseIdList = (value) =>
  String(value)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

// Trên 500 bản ghi thì không cần đếm tổng (trang Home gọi limit=1000 và
// tự phân trang phía client). Bỏ qua countDocuments giúp tiết kiệm 1 lần
// quét index cho mỗi request.
const SKIP_COUNT_LIMIT = 500;

// Projection cho endpoint list: chỉ trả về các field mà UI thực sự dùng.
// `images` bị cắt còn ảnh đầu tiên (card chỉ hiển thị 1 ảnh).
const LIST_FIELDS =
  'title description code rank server price originalPrice adminDiscountPercent ' +
  'teamValue bp status categoryId subcategoryId images';

// Get all accounts with filters
router.get('/', async (req, res) => {
  try {
    const { category, subcategory, minPrice, maxPrice, search, titleSearch, code, sortBy, status = 'available', page = 1, limit = 12 } = req.query;

    // Handle status filter: 'all' = show both available and sold
    const query = {};
    if (status === 'all') {
      query.status = { $in: ['available', 'sold'] };
    } else {
      query.status = status;
    }

    // Các điều kiện lọc danh mục được gom vào $and để không đụng $or của
    // tìm kiếm text bên dưới.
    const and = [];

    if (category) {
      // Chấp nhận nhiều category id phân tách bằng dấu phẩy.
      // Dùng khi user chọn danh mục cha (accounts thuộc cả danh mục cha lẫn
      // các danh mục con) → server lọc 1 lần thay vì client tải hết về.
      const ids = parseIdList(category);
      if (ids.length > 0) {
        // Mở rộng danh mục cha → kèm danh mục con.
        // Tài khoản thuộc danh mục con vẫn phải hiện khi user chọn danh mục
        // cha (giống cách frontend group: subcategoryId ?? categoryId).
        const children = await Category.find({ parentId: { $in: ids } })
          .select('_id')
          .lean();
        const childIds = children.map((c) => String(c._id));
        const allIds = [...new Set([...ids, ...childIds])];

        and.push({
          $or: [
            { categoryId: { $in: allIds } },
            { subcategoryId: { $in: childIds } },
          ],
        });
      }
    }

    // Lọc theo danh mục con.
    // `subcategoryId` mới là field lưu danh mục con (categoryId luôn là danh
    // mục cha) → lọc bằng categoryId sẽ không bao giờ ra kết quả.
    if (subcategory) {
      const ids = parseIdList(subcategory);
      if (ids.length > 0) {
        and.push({ subcategoryId: { $in: ids } });
      }
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseInt(minPrice);
      if (maxPrice) query.price.$lte = parseInt(maxPrice);
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { rank: { $regex: search, $options: 'i' } }
      ];
    }

    // Tìm theo tên sản phẩm (chỉ title). Tách riêng vì `search` ở trên
    // khớp cả description/rank — khác với ý "Tìm tên sản phẩm" ở UI.
    if (titleSearch) {
      const rx = new RegExp(
        String(titleSearch).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i'
      );
      query.title = { $regex: rx };
    }

    if (code) {
      query.code = { $regex: code, $options: 'i' };
    }

    // Gắn các điều kiện lọc danh mục (đã gom ở trên) vào query.
    if (and.length > 0) {
      query.$and = and;
    }

    // Determine sort order
    let sortOptions = { createdAt: -1 }; // default
    if (sortBy) {
      switch(sortBy) {
        case 'price_asc':
          sortOptions = { price: 1 };
          break;
        case 'price_desc':
          sortOptions = { price: -1 };
          break;
        case 'name_asc':
          sortOptions = { title: 1 };
          break;
        case 'name_desc':
          sortOptions = { title: -1 };
          break;
        default:
          sortOptions = { createdAt: -1 };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Chạy song song find + count thay vì tuần tự. `.lean()` trả về object
    // thuần nên bỏ qua bước hydrate document của Mongoose (tiết kiệm rõ rệt
    // khi limit lớn).
    const accountsPromise = GameAccount.find(query)
      .populate('categoryId', 'name slug parentId')
      .populate('subcategoryId', 'name slug parentId')
      .select(LIST_FIELDS) // Chỉ trả field UI cần (đồng thời ẩn username/password/password2)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const countPromise =
      limitNum >= SKIP_COUNT_LIMIT
        ? Promise.resolve(null)
        : GameAccount.countDocuments(query);

    const [accounts, total] = await Promise.all([accountsPromise, countPromise]);

    // Áp dụng promotion pricing cho tất cả accounts
    const accountsWithPromotion = await applyPromotionPricing(accounts);

    // Ưu tiên subcategory nếu có (tài khoản thuộc danh mục con),
    // fallback về category cha nếu tài khoản chỉ gắn với danh mục cha.
    const mappedAccounts = accountsWithPromotion.map(acc => {
      const accObj = typeof acc.toObject === 'function' ? acc.toObject() : acc;
      accObj.category = accObj.subcategoryId || accObj.categoryId;
      // Card chỉ hiển thị ảnh đầu tiên → cắt bớt ảnh dư khỏi payload.
      if (Array.isArray(accObj.images) && accObj.images.length > 1) {
        accObj.images = accObj.images.slice(0, 1);
      }
      return accObj;
    });

    res.json({
      accounts: mappedAccounts,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: total === null ? 1 : Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// Đếm số tài khoản theo từng danh mục (dùng cho card danh mục ở trang Home).
//
// Vì sao cần endpoint riêng:
// Trang Home chỉ tải 200 tài khoản đầu (có phân trang server-side) nên số
// đếm client-side sẽ SAI — các danh mục có tài khoản nhưng nằm ngoài 200
// bản ghi đầu sẽ hiện "Sắp có". Endpoint này trả đúng số đếm thật mà
// chỉ tốn vài trăm byte (thay vì kéo 1000 account về để đếm).
//
// Nhóm theo "danh mục hiệu dụng" = subcategoryId ?? categoryId — đúng cách
// frontend đang group (`acc.category = acc.subcategoryId || acc.categoryId`).
//   counts[catId]    = số account thuộc danh mục đó (cha: tính cả account
//                       nằm trong các danh mục con của nó)
//   direct[catId]    = số account gắn TRỰC TIẾP với danh mục cha (không có
//                       subcategoryId)
//   subcounts[catId] = số account nằm trong danh mục con có id = catId
//
// Dùng $facet để lấy cả 3 bảng trong 1 lần quét collection.
router.get('/counts', async (req, res) => {
  try {
    const status = req.query.status || 'available';
    const match = status === 'all'
      ? { status: { $in: ['available', 'sold'] } }
      : { status };

    const [rows] = await GameAccount.aggregate([
      { $match: match },
      {
        $facet: {
          // Nhóm theo danh mục hiệu dụng (con nếu có, không thì cha)
          effective: [
            {
              $group: {
                _id: { $ifNull: ['$subcategoryId', '$categoryId'] },
                count: { $sum: 1 },
              },
            },
          ],
          // Nhóm theo danh mục cha (chỉ đếm account CÓ subcategoryId)
          byParent: [
            { $match: { subcategoryId: { $ne: null } } },
            { $group: { _id: '$categoryId', count: { $sum: 1 } } },
          ],
          // Nhóm theo danh mục con
          bySub: [
            { $match: { subcategoryId: { $ne: null } } },
            { $group: { _id: '$subcategoryId', count: { $sum: 1 } } },
          ],
        },
      },
    ]);

    const counts = {};     // danh mục hiệu dụng → số account
    const direct = {};     // danh mục cha → số account gắn trực tiếp
    const subcounts = {};  // danh mục con → số account bên trong

    (rows.effective || []).forEach((r) => {
      const id = r._id ? String(r._id) : null;
      if (id) counts[id] = r.count;
    });
    (rows.byParent || []).forEach((r) => {
      const id = r._id ? String(r._id) : null;
      if (id) direct[id] = r.count;
    });
    (rows.bySub || []).forEach((r) => {
      const id = r._id ? String(r._id) : null;
      if (id) subcounts[id] = r.count;
    });

    res.json({ counts, direct, subcounts });
  } catch (error) {
    console.error('Get account counts error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// Get account by ID
router.get('/:id', async (req, res) => {
  try {
    const account = await GameAccount.findById(req.params.id)
      .populate('categoryId', 'name slug');

    if (!account) {
      return res.status(404).json({ message: 'Tài khoản không tồn tại' });
    }

    // Áp dụng promotion pricing
    const accountWithPromotion = await applyPromotionPricingSingle(account);

    // Map categoryId to category for frontend compatibility
    const accountObj = accountWithPromotion;
    accountObj.category = accountObj.categoryId;

    // If account is sold and user owns it, decrypt credentials
    if (account.status === 'sold' && req.user && account.soldTo && account.soldTo.toString() === req.user._id.toString()) {
      accountObj.username = decrypt(accountObj.username);
      accountObj.password = decrypt(accountObj.password);
      accountObj.password2 = decrypt(accountObj.password2 || '');
    } else {
      // Hide credentials if not purchased
      accountObj.username = undefined;
      accountObj.password = undefined;
      accountObj.password2 = undefined;
    }

    res.json(accountObj);
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

export default router;
