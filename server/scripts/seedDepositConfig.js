/**
 * Script: seed các SiteSetting key cấu hình nạp thẻ.
 *
 * Chạy 1 lần sau khi deploy để chèn các key mặc định:
 *   - card_enabled        = "true"
 *   - card_rate_viettel   = "80"
 *   - card_rate_mobifone  = "75"
 *   - card_rate_vinaphone = "75"
 *
 * Cách dùng:
 *   npm run seed:deposit-config
 *
 * Script này dùng upsert nên an toàn chạy lại nhiều lần — không ghi đè giá trị
 * admin đã chỉnh tay trên UI /admin/deposit-config.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const SiteSetting = (await import('../models/SiteSetting.js')).default;

const DEFAULTS = [
  {
    key: 'card_enabled',
    value: 'true',
    type: 'boolean',
    description: 'Bật/tắt tính năng nạp thẻ cào',
  },
  {
    key: 'card_rate_viettel',
    value: '80',
    type: 'number',
    description: 'Tỷ lệ quy đổi thẻ Viettel (%) — user nhận được = mệnh giá * value / 100',
  },
  {
    key: 'card_rate_mobifone',
    value: '75',
    type: 'number',
    description: 'Tỷ lệ quy đổi thẻ Mobifone (%) — user nhận được = mệnh giá * value / 100',
  },
  {
    key: 'card_rate_vinaphone',
    value: '75',
    type: 'number',
    description: 'Tỷ lệ quy đổi thẻ Vinaphone (%) — user nhận được = mệnh giá * value / 100',
  },
];

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ Không tìm thấy MONGODB_URI trong server/.env');
    process.exit(1);
  }

  console.log('🔌 Đang kết nối MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Kết nối thành công\n');

  for (const cfg of DEFAULTS) {
    const result = await SiteSetting.findOneAndUpdate(
      { key: cfg.key },
      {
        $setOnInsert: {
          key: cfg.key,
          value: cfg.value,
          type: cfg.type,
          description: cfg.description,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const wasInserted = result.value === cfg.value &&
      // upsert trả về doc hiện tại — nếu đã tồn tại trước đó thì value đã được admin sửa
      // (khó xác định chính xác; in createdAt là đủ để debug).
      // Tốt hơn: check bằng updatedAt vs createdAt.
      (Date.now() - new Date(result.createdAt).getTime() < 2000);

    console.log(
      wasInserted
        ? `  ➕ ${cfg.key.padEnd(22)} = ${result.value}  (mới tạo)`
        : `  ✓  ${cfg.key.padEnd(22)} = ${result.value}  (đã tồn tại)`
    );
  }

  console.log('\n✅ Hoàn tất seed cấu hình nạp thẻ.');
  console.log('💡 Admin có thể chỉnh % qua trang /deposit-config trong admin panel.\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Lỗi:', err.message);
  console.error(err);
  mongoose.disconnect().finally(() => process.exit(1));
});