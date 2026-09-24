/**
 * Map from Vietnamese bank name (as stored in DB) to VietQR.io bank code.
 * VietQR.io bank codes: https://vietqr.io
 */
export const VIETQR_BANK_CODE_MAP = {
  'ACB': 'ACB',
  'Vietcombank': 'VCB',
  'VIB - Ngân hàng Quốc tế': 'VIB',
  'VIB': 'VIB',
  'VietinBank': 'ICB',
  'ICB': 'ICB',
  'BIDV': 'BID',
  'BID': 'BID',
  'TPBank': 'TPB',
  'TPB': 'TPB',
  'MB Bank': 'MB',
  'MB': 'MB',
  'VPBank': 'VPB',
  'VPB': 'VPB',
  'Techcombank': 'TCB',
  'TCB': 'TCB',
  'CTGC (Viet Capital Bank)': 'CTG',
  'CTG': 'CTG',
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
  'LienVietPostBank': 'LPB',
  'LPB': 'LPB',
  'NamABank': 'NAB',
  'NAB': 'NAB',
  'PGBank': 'PGB',
  'PGB': 'PGB',
  'SCB': 'SCB',
  'SeABank': 'SEA',
  'SEA': 'SEA',
  'Saigonbank': 'SSB',
  'SSB': 'SSB',
  'VietABank': 'VAB',
  'VAB': 'VAB',
  'VietCredit': 'VCCB',
  'VCCB': 'VCCB',
  'Woori Bank': 'WOORI',
  'WOORI': 'WOORI',
  'UOB Singapore': 'UOB',
  'UOB': 'UOB',
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
