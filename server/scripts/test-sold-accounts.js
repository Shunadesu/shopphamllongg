import 'dotenv/config';
import mongoose from 'mongoose';
import GameAccount from '../models/GameAccount.js';
import Order from '../models/Order.js';
import SpinHistory from '../models/SpinHistory.js';

const escapeRegex = (str = '') => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
};

const buildSoldAccountPipeline = (filters = {}) => {
  const { search = '', category = '', subcategory = '', from = null, to = null, minPrice = null, maxPrice = null, source = 'all' } = filters;
  const match = { status: 'sold' };
  const categoryId = toObjectId(category);
  const subcategoryId = toObjectId(subcategory);
  if (categoryId) match.categoryId = categoryId;
  if (subcategoryId) match.subcategoryId = subcategoryId;
  if (minPrice !== null || maxPrice !== null) {
    match.price = {};
    if (minPrice !== null) match.price.$gte = minPrice;
    if (maxPrice !== null) match.price.$lte = maxPrice;
  }
  if (from || to) {
    match.soldAt = {};
    if (from) match.soldAt.$gte = from;
    if (to) match.soldAt.$lte = to;
  }
  const pipeline = [{ $match: match }];
  pipeline.push({
    $lookup: {
      from: 'orders', let: { aid: '$_id' },
      pipeline: [
        { $match: { $expr: { $in: ['$$aid', '$items.accountId'] } } },
        { $unwind: '$items' },
        { $match: { $expr: { $eq: ['$items.accountId', '$$aid'] }, status: 'completed' } },
      ],
      as: 'orderDocs',
    },
  });
  pipeline.push({
    $lookup: {
      from: 'spinhistories', let: { aid: '$_id' },
      pipeline: [{ $match: { $expr: { $eq: ['$accountId', '$$aid'] } } }],
      as: 'spinDocs',
    },
  });
  pipeline.push({
    $addFields: {
      orderInfo: { $arrayElemAt: ['$orderDocs', 0] },
      spinInfo: { $arrayElemAt: ['$spinDocs', 0] },
      buyerId: { $ifNull: ['$soldTo', { $arrayElemAt: ['$spinDocs.userId', 0] }] },
      source: {
        $cond: [
          { $gt: [{ $size: '$orderDocs' }, 0] }, 'order',
          { $cond: [{ $gt: [{ $size: '$spinDocs' }, 0] }, 'spin', 'unknown'] },
        ],
      },
      soldDate: { $ifNull: ['$soldAt', '$createdAt'] },
    },
  });
  pipeline.push({ $lookup: { from: 'users', localField: 'buyerId', foreignField: '_id', as: 'buyer' } });
  pipeline.push({ $lookup: { from: 'categories', localField: 'categoryId', foreignField: '_id', as: 'category' } });
  pipeline.push({ $lookup: { from: 'categories', localField: 'subcategoryId', foreignField: '_id', as: 'subcategory' } });
  if (source && source !== 'all') pipeline.push({ $match: { source } });
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    pipeline.push({
      $match: {
        $or: [
          { code: rx }, { title: rx }, { description: rx },
          { 'orderInfo.orderNumber': rx },
          { 'buyer.username': rx }, { 'buyer.fullName': rx },
          { 'buyer.email': rx }, { 'buyer.phone': rx },
        ],
      },
    });
  }
  return pipeline;
};

// Chạy pipeline và trả về số bản ghi (bỏ qua $facet)
async function countWith(filters) {
  const p = buildSoldAccountPipeline(filters);
  p.push({ $count: 'count' });
  const res = await GameAccount.aggregate(p);
  return res?.[0]?.count ?? 0;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('connected');

  const totalSold = await GameAccount.countDocuments({ status: 'sold' });
  const totalOrders = await Order.countDocuments({ status: 'completed' });
  const totalSpins = await SpinHistory.countDocuments({ rewardType: 'account' });
  console.log(`sold=${totalSold} completedOrders=${totalOrders} spinAccountRewards=${totalSpins}`);

  // LIST pipeline
  const listPipe = buildSoldAccountPipeline({});
  listPipe.push({ $facet: { data: [{ $sort: { soldDate: -1 } }, { $skip: 0 }, { $limit: 5 }], total: [{ $count: 'count' }] } });
  const [listRes] = await GameAccount.aggregate(listPipe);
  console.log('\n--- LIST ---');
  console.log('total =', listRes?.total?.[0]?.count);
  (listRes?.data || []).forEach(a => {
    console.log(`  ${a.code} | src=${a.source} | buyer=${a.buyer?.[0]?.username || 'N/A'} | order=${a.orderInfo?.orderNumber || '-'} | price=${a.price} | sold=${a.soldDate?.toISOString?.()}`);
  });

  // STATS pipeline
  const statPipe = buildSoldAccountPipeline({});
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  statPipe.push({
    $facet: {
      summary: [{ $group: { _id: null, totalAccounts: { $sum: 1 }, totalRevenue: { $sum: '$price' }, buyers: { $addToSet: '$buyerId' } } }],
      recent: [{ $match: { soldDate: { $gte: thirtyDaysAgo } } }, { $count: 'count' }],
      soldByDay: [{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$soldDate' } }, count: { $sum: 1 }, revenue: { $sum: '$price' } } }, { $sort: { _id: 1 } }],
      byCategory: [{ $unwind: '$category' }, { $group: { _id: '$category.name', count: { $sum: 1 }, revenue: { $sum: '$price' } } }, { $sort: { revenue: -1 } }, { $limit: 8 }],
      bySource: [{ $group: { _id: '$source', count: { $sum: 1 } } }],
      topBuyers: [{ $unwind: '$buyer' }, { $group: { _id: '$buyer.username', fullName: { $first: '$buyer.fullName' }, count: { $sum: 1 }, totalSpent: { $sum: '$price' } } }, { $sort: { totalSpent: -1 } }, { $limit: 10 }],
    },
  });
  const [statRes] = await GameAccount.aggregate(statPipe);
  console.log('\n--- STATS ---');
  console.log(JSON.stringify({
    summary: {
      totalAccounts: statRes?.summary?.[0]?.totalAccounts || 0,
      totalRevenue: statRes?.summary?.[0]?.totalRevenue || 0,
      totalBuyers: (statRes?.summary?.[0]?.buyers || []).filter(Boolean).length,
      recentAccounts: statRes?.recent?.[0]?.count || 0,
    },
    soldByDay: statRes?.soldByDay?.length,
    byCategory: statRes?.byCategory?.length,
    bySource: statRes?.bySource,
    topBuyers: statRes?.topBuyers?.length,
  }, null, 2));

  // Filters smoke test
  console.log('\n--- FILTER SMOKE TEST ---');
  const cases = [
    { name: 'baseline (no filter)', f: {} },
    { name: 'source=order', f: { source: 'order' } },
    { name: 'source=spin', f: { source: 'spin' } },
    { name: 'source=unknown', f: { source: 'unknown' } },
    { name: 'minPrice=100000', f: { minPrice: 100000 } },
    { name: 'maxPrice=500000', f: { maxPrice: 500000 } },
    { name: 'minPrice=100000+maxPrice=500000', f: { minPrice: 100000, maxPrice: 500000 } },
    { name: 'from=hien tai', f: { from: new Date() } },
    { name: 'to=2020', f: { to: new Date('2020-01-01') } },
    { name: 'from=2020-01-01', f: { from: new Date('2020-01-01') } },
  ];
  for (const c of cases) {
    console.log(`  ${c.name}: ${await countWith(c.f)}`);
  }

  // search smoke
  if (listRes?.data?.[0]?.buyer?.[0]?.username) {
    const uname = listRes.data[0].buyer[0].username;
    console.log(`  search buyer "${uname}": ${await countWith({ search: uname })}`);
  }
  const code = listRes?.data?.[0]?.code;
  if (code) {
    console.log(`  search code "${code}": ${await countWith({ search: code })}`);
  }
  const orderNo = listRes?.data?.[0]?.orderInfo?.orderNumber;
  if (orderNo) {
    console.log(`  search order "${orderNo}": ${await countWith({ search: orderNo })}`);
  }

  // category filter
  const catId = listRes?.data?.[0]?.category?.[0]?._id?.toString();
  if (catId) {
    console.log(`  category=${catId}: ${await countWith({ category: catId })}`);
  }

  // Kiểm tra 5 acc "unknown" - có buyer không, có soldAt không
  const unknownPipe = buildSoldAccountPipeline({ source: 'unknown' });
  unknownPipe.push({ $project: { code: 1, soldAt: 1, soldTo: 1, buyerId: 1, buyer: { $arrayElemAt: ['$buyer', 0] }, createdAt: 1 } });
  const unknownRows = await GameAccount.aggregate(unknownPipe);
  console.log('\n--- UNKNOWN SOURCE ACCOUNTS ---');
  (unknownRows || []).forEach(u => {
    console.log(`  ${u.code} | soldAt=${u.soldAt || 'NULL'} | buyer=${u.buyer?.username || 'N/A'} | createdAt=${u.createdAt?.toISOString?.()}`);
  });

  await mongoose.disconnect();
  console.log('\ndone');
}

main().catch(e => { console.error('ERR', e); process.exit(1); });
