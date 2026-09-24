/**
 * Script: hiển thị thông tin tài khoản admin trong database
 * Chạy: node scripts/showAdmin.js
 * 
 * Hiển thị đầy đủ các field như database lưu trữ (bao gồm cả password hash).
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(__dirname, '../.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not found in .env');
    process.exit(1);
  }

  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected\n');

  // Lấy collection raw để hiển thị đúng như database
  const collection = mongoose.connection.db.collection('users');

  // Tìm tất cả admin
  const admins = await collection.find({ role: 'admin' }).toArray();

  if (admins.length === 0) {
    console.log('⚠️  Không có tài khoản admin nào trong database.');
  } else {
    console.log(`📋 Tìm thấy ${admins.length} tài khoản admin:\n`);
    console.log('━'.repeat(80));

    for (let i = 0; i < admins.length; i++) {
      const admin = admins[i];
      console.log(`\n👤 ADMIN #${i + 1}`);
      console.log('─'.repeat(40));

      // Các field chính
      console.log(`  _id              : ${admin._id}`);
      console.log(`  username         : ${admin.username}`);
      console.log(`  password (hash)  : ${admin.password}`);
      console.log(`  fullName         : ${admin.fullName}`);
      console.log(`  phone            : ${admin.phone ?? '(rỗng)'}`);
      console.log(`  balance          : ${admin.balance}`);
      console.log(`  spins            : ${admin.spins}`);
      console.log(`  totalSpent       : ${admin.totalSpent}`);
      console.log(`  totalDeposited   : ${admin.totalDeposited}`);
      console.log(`  role             : ${admin.role}`);
      console.log(`  isActive         : ${admin.isActive}`);
      console.log(`  createdAt        : ${admin.createdAt}`);
      console.log(`  updatedAt        : ${admin.updatedAt}`);

      // Purchase history
      if (admin.purchaseHistory && admin.purchaseHistory.length > 0) {
        console.log(`  purchaseHistory  : [${admin.purchaseHistory.length} đơn hàng]`);
        admin.purchaseHistory.forEach((ref, idx) => {
          console.log(`    ${idx + 1}. ${ref}`);
        });
      } else {
        console.log(`  purchaseHistory  : [] (rỗng)`);
      }

      // In thêm raw document để debug nếu cần
      console.log('\n  📄 Raw document keys:');
      Object.keys(admin).forEach((key) => {
        const val = admin[key];
        const display = val === null ? 'null' : val === undefined ? 'undefined' : JSON.stringify(val);
        console.log(`    ${key}: ${display}`);
      });

      console.log('\n' + '━'.repeat(80));
    }
  }

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected.');
}

main().catch((err) => {
  console.error('❌ Lỗi:', err);
  mongoose.disconnect();
  process.exit(1);
});
