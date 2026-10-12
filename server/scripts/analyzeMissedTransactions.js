import 'dotenv/config';
import mongoose from 'mongoose';
import WebhookLog from '../models/WebhookLog.js';

async function analyzeMissedTransactions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ Connected to: ${mongoose.connection.db.databaseName}\n`);

    // === Tổng quan ===
    const total = await WebhookLog.countDocuments();
    const byStatus = await WebhookLog.aggregate([
      { $group: { _id: '$processingStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('📊 TỔNG QUAN:');
    console.log(`   Total webhook logs: ${total}`);
    byStatus.forEach(s => {
      console.log(`   - ${s._id}: ${s.count}`);
    });

    // === Unparseable transactions ===
    const unparseable = await WebhookLog.find({
      processingStatus: 'ignored',
      processingNote: { $regex: /Cannot parse|deposit code/i }
    })
      .sort({ receivedAt: -1 })
      .limit(50)
      .lean();

    console.log(`\n❌ UNPARSEABLE TRANSACTIONS (latest 50):\n`);
    if (unparseable.length === 0) {
      console.log('   (none)');
    } else {
      unparseable.forEach((log, i) => {
        console.log(`${i + 1}. [${log.receivedAt?.toISOString()}] gateway=${log.gateway} | amount=${log.amount?.toLocaleString()}đ`);
        console.log(`   content: "${log.content}"`);
        console.log(`   refCode: ${log.sepayTransactionId}`);
        console.log('');
      });
    }

    // === Phân tích pattern content của ignored (no_match) ===
    const noMatch = await WebhookLog.find({
      processingStatus: 'ignored',
      processingNote: { $regex: /No matching pending/i }
    })
      .sort({ receivedAt: -1 })
      .limit(30)
      .lean();

    console.log(`\n⚠️ NO_MATCH TRANSACTIONS (latest 30):\n`);
    if (noMatch.length === 0) {
      console.log('   (none)');
    } else {
      noMatch.forEach((log, i) => {
        console.log(`${i + 1}. [${log.receivedAt?.toISOString()}] gateway=${log.gateway} | amount=${log.amount?.toLocaleString()}đ`);
        console.log(`   content: "${log.content}"`);
        console.log(`   note: ${log.processingNote}`);
        console.log('');
      });
    }

    // === Phân tích pattern amount_mismatch ===
    const amountMismatch = await WebhookLog.find({
      processingStatus: 'ignored',
      processingNote: { $regex: /Amount mismatch/i }
    })
      .sort({ receivedAt: -1 })
      .limit(20)
      .lean();

    console.log(`\n💸 AMOUNT_MISMATCH TRANSACTIONS (latest 20):\n`);
    if (amountMismatch.length === 0) {
      console.log('   (none)');
    } else {
      amountMismatch.forEach((log, i) => {
        console.log(`${i + 1}. [${log.receivedAt?.toISOString()}] gateway=${log.gateway}`);
        console.log(`   content: "${log.content}"`);
        console.log(`   note: ${log.processingNote}`);
        console.log('');
      });
    }

    // === Phân tích gateway distribution ===
    const byGateway = await WebhookLog.aggregate([
      { $group: { _id: '$gateway', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log(`\n🏦 GATEWAY DISTRIBUTION:`);
    byGateway.forEach(g => {
      console.log(`   - ${g._id || '(empty)'}: ${g.count}`);
    });

    // === Sample successful (parsed) để thấy patterns đang work ===
    const successful = await WebhookLog.find({
      processingStatus: 'success'
    })
      .sort({ receivedAt: -1 })
      .limit(15)
      .lean();

    console.log(`\n✅ SUCCESSFUL PARSES (latest 15):\n`);
    successful.forEach((log, i) => {
      console.log(`${i + 1}. gateway=${log.gateway} | amount=${log.amount?.toLocaleString()}đ`);
      console.log(`   content: "${log.content}"`);
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeMissedTransactions();