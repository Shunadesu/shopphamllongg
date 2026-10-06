/**
 * Map from Vietnamese bank name (as stored in DB) to VietQR.io bank code.
 * Source (chính thức): https://api.vietqr.io/v2/banks
 *
 * ⚠️ IMPORTANT: Nếu admin có thể nhập tên ngân hàng tùy ý ("OTHER" → tự nhập),
 * hãy thêm KEY mới vào map này để VietQR.io nhận đúng mã. Nếu không, hệ thống
 * fallback về 'ACB' và QR sẽ render sai ngân hàng.
 *
 * Lưu ý khi cập nhật: PHẢI đồng bộ cả 3 file sau (trước đây đã sai lệch):
 *   1. frontend/src/utils/bankUtils.js  (bản này)
 *   2. admin/src/utils/bankUtils.js
 *   3. server/routes/deposits.js
 */
export const VIETQR_BANK_CODE_MAP = {
  'ACB': 'ACB',
  'Vietcombank': 'VCB',
  'VIB - Ngân hàng Quốc tế': 'VIB',
  'VIB': 'VIB',
  'VietinBank': 'ICB',
  'ICB': 'ICB',
  // BIDV — đã fix từ 'BID' → 'BIDV' (BID không hợp lệ, trả "invalid acqId")
  'BIDV': 'BIDV',
  'BID': 'BIDV',
  'TPBank': 'TPB',
  'TPB': 'TPB',
  'MB Bank': 'MB',
  'MB': 'MB',
  'VPBank': 'VPB',
  'VPB': 'VPB',
  'Techcombank': 'TCB',
  'TCB': 'TCB',
  // CTGC / VietCapitalBank — đã fix từ 'CTG' → 'VCCB'
  'CTGC (Viet Capital Bank)': 'VCCB',
  'VietCapitalBank': 'VCCB',
  'CTG': 'VCCB',
  'VietCredit': 'VCCB',
  'Eximbank': 'EIB',
  'EIB': 'EIB',
  'HDBank': 'HDB',
  'HDB': 'HDB',
  'MSB - Ngân hàng Hàng Hải': 'MSB',
  'MSB': 'MSB',
  'OCB': 'OCB',
  'SHB': 'SHB',
  'Sacombank': 'STB',
  'STB': 'STB',
  'ABBANK': 'ABB',
  'ABB': 'ABB',
  'Kienlongbank': 'KLB',
  'KLB': 'KLB',
  // LPBank (LPB/LienVietPostBank) — đã fix từ 'LPB' → 'LPBank'
  'LienVietPostBank': 'LPBank',
  'LPBank': 'LPBank',
  'LPB': 'LPBank',
  'NamABank': 'NAB',
  'NAB': 'NAB',
  'PGBank': 'PGB',
  'PGB': 'PGB',
  'SCB': 'SCB',
  // SeABank — đã fix từ 'SEA' → 'SEAB'
  'SeABank': 'SEAB',
  'SEAB': 'SEAB',
  'SEA': 'SEAB',
  // Saigonbank — đã fix từ 'SSB' → 'SGICB'
  'Saigonbank': 'SGICB',
  'SGICB': 'SGICB',
  'SSB': 'SGICB',
  'VietABank': 'VAB',
  'VAB': 'VAB',
  // Woori — cả 'WOORI' và 'WVN' đều hợp lệ, dùng 'WVN' (mã chính thức VietQR.io)
  'Woori Bank': 'WVN',
  'Woori': 'WVN',
  'WOORI': 'WVN',
  'WVN': 'WVN',
  'UOB Singapore': 'UOB',
  'UOB': 'UOB',
  // VRB = Liên doanh Việt-Nga (Viet-Russia Bank), hỗ trợ lookup only
  'VietinBank (VRB)': 'VRB',
  'VRB': 'VRB',
};

/**
 * Get VietQR.io bank code from a bankName string.
 * Falls back to 'ACB' if not found (backward compat).
 */
export function getVietqrBankCode(bankName) {
  if (!bankName) return 'ACB';
  // Exact match first
  if (VIETQR_BANK_CODE_MAP[bankName]) return VIETQR_BANK_CODE_MAP[bankName];
  // Try case-insensitive match
  const lower = bankName.toLowerCase();
  for (const [key, code] of Object.entries(VIETQR_BANK_CODE_MAP)) {
    if (key.toLowerCase() === lower) return code;
  }
  return 'ACB';
}