/**
 * Script: xóa tài khoản admin theo username (có xác thực password).
 *
 * Mặc định xóa admin gốc `admin` / `admin123`.
 *
 * Cách dùng:
 *   npm run delete-admin
 *   npm run delete-admin -- admin admin123
 *   node scripts/deleteAdminByUsername.js admin admin123 --yes
 *
 * Tham số:
 *   [username]   mặc định "admin"
 *   [password]   mặc định "admin123" (dùng để xác thực trước khi xóa)
 *   --yes / -y   bỏ qua bước confirm interactive
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const User = (await import('../models/User.js')).default;

const args = process.argv.slice(2);
const skipConfirm = args.includes('--yes') || args.includes('-y');
const positional = args.filter((a) => !a.startsWith('-'));

const USERNAME = positional[0] || 'admin';
const PASSWORD = positional[1] || 'admin123';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ Không tìm thấy MONGODB_URI trong server/.env');
    process.exit(1);
  }

  console.log('🔌 Đang kết nối MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Kết nối thành công\n');

  const target = await User.findOne({ username: USERNAME, role: 'admin' });

  if (!target) {
    console.error(`❌ Không tìm thấy admin với username "${USERNAME}"`);
    const all = await User.find({ role: 'admin' }).select('username fullName _id');
    if (all.length) {
      console.log('\nCác admin hiện có trong DB:');
      all.forEach((a, i) => console.log(`  ${i + 1}. ${a.username} (${a.fullName || '—'}) — ${a._id}`));
    } else {
      console.log('⚠️  Database hiện không có admin nào.');
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  const passwordOk = await target.matchPassword(PASSWORD);
  if (!passwordOk) {
    console.error(`❌ Password không đúng với admin "${USERNAME}". Hủy thao tác.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('🎯 Admin sẽ bị xóa:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ID        : ${target._id}`);
  console.log(`  Username  : ${target.username}`);
  console.log(`  Full name : ${target.fullName || '(rỗng)'}`);
  console.log(`  Role      : ${target.role}`);
  console.log(`  Active    : ${target.isActive ? 'Yes' : 'No'}`);
  console.log(`  Created   : ${target.createdAt.toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!skipConfirm) {
    const answer = await ask('Gõ "yes" để xác nhận xóa vĩnh viễn: ');
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('↩️  Đã hủy.');
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  await User.findByIdAndDelete(target._id);

  console.log(`✅ Đã xóa admin "${target.username}" (${target._id})`);
  console.log('💡 Sau khi xóa, tạo admin mới bằng: npm run create-admin');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Lỗi:', err.message);
  console.error(err);
  mongoose.disconnect().finally(() => process.exit(1));
});
