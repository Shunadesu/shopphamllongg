/**
 * Parser nội dung chuyển khoản (SePay webhook) → mã nạp 6 số của hệ thống.
 *
 * Tách ra module riêng để:
 *   1. sepayWebhook.js và script test dùng CHUNG một logic (không drift).
 *   2. Dễ thêm format mới khi ngân hàng đổi nội dung CK.
 *
 * @module utils/depositCodeParser
 */

/**
 * Parse deposit code từ nội dung webhook.
 *
 * Accept:
 * - Exactly "123456" (mã nạp thuần)
 * - "123456 ..." / "123456-..." (mã nạp ở đầu, legacy)
 * - Mã nạp 6 số ở cuối hoặc ngay trước ".CT" (format BIDV mới)
 * - "BIDV;{subAccount};{code}" (format BIDV phân tách bằng dấu chấm phẩy)
 * - "Scan QR {code} {ref}" (NAP qua QR của BIDV)
 * - "{mã máy sinh} {code}" (SePay/BIDV tự thêm mã QR trước nội dung)
 *
 * Reject:
 * - Format cũ kiểu "username 252000" (có chữ cái + space)
 * - Nội dung lẫn chữ cái + space không khớp pattern nào
 *
 * @param {string} content Nội dung giao dịch từ SePay
 * @returns {string|{type: string, [key: string]: any}|null}
 *   - string: mã nạp 6 số
 *   - { type: 'scan-qr', code }
 *   - { type: 'bidv' | 'techcombank', username, amount }
 *   - null: không parse được
 */
export function parseDepositCode(content) {
  if (!content || typeof content !== 'string') return null;

  const trimmed = content.trim();

  // Case 0 (NEW): BIDV semicolon-separated format
  // Example: "BIDV;96247B6RW7;544587"
  // Pattern: BIDV;{subAccount};{6-digit-code}
  // The last token after the final semicolon is the deposit code.
  const bidvSemicolonMatch = trimmed.match(/^BIDV;[^;]+;(\d{6})$/);
  if (bidvSemicolonMatch) {
    return bidvSemicolonMatch[1];
  }

  // Case 1: Content is exactly 6 digits (new format)
  if (/^\d{6}$/.test(trimmed)) {
    return trimmed;
  }

  // Case 2 (NEW): 6-digit code at end of content OR immediately before ".CT"
  // Handles new BIDV format (the deposit code is always the LAST 6-digit number
  // that's either at end-of-string or followed by ".CT").
  // Example A: "151015889347 0866586858 388887" → "388887"  (at end, all-numeric)
  // Example B: "MBVCB.16464989264.754632.388044.CT tu 1069..." → "388044"  (before .CT)
  // The `(?!\d)` ensures we don't pick a 6-digit run that's part of a longer number
  // (e.g., "12345678" should NOT match "123456").
  //
  // IMPORTANT: For the "all-numeric ending" case, we require the content to have
  // NO alphabetic characters — otherwise we'd accidentally pick the trailing
  // amount from old-format content like "username 252000".
  // The "before .CT" case is safe regardless of alphabetic chars because ".CT"
  // is a strong marker.
  const ctMatch = trimmed.match(/(?:^|\D)(\d{6})(?=\.CT)(?!\d)/);
  if (ctMatch) {
    return ctMatch[1];
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    // Tìm tất cả cụm 6 số đứng độc lập, lấy cụm cuối cùng
    const allMatches = trimmed.match(/(?:^|\D)(\d{6})(?!\d)/g);
    if (allMatches && allMatches.length > 0) {
      const lastMatch = allMatches[allMatches.length - 1];
      // Strip leading non-digit (nếu có) rồi lấy 6 số
      return lastMatch.match(/\d{6}$/)[0];
    }
  }

  // Case 2.5: Pattern with dash separator "text - 6digit" (e.g., "QR - 574948")
  // The dash is a strong indicator that the 6-digit is a code, not an amount.
  // This handles new BIDV format where content is prefixed with "QR - " or similar.
  const dashCodeMatch = trimmed.match(/-\s*(\d{6})(?!\d)$/);
  if (dashCodeMatch) {
    return dashCodeMatch[1];
  }

  // Case 2.6: Short uppercase prefix + space + 6-digit code
  // Examples: "IBFT 239268", "QR 574948", "NAP 388887"
  // The prefix is 2-6 UPPERCASE letters (BIDV transfer method codes like IBFT, QR, NAP, CT, FT).
  // This differs from old format "username 252000" where the prefix is typically lowercase
  // or longer than 6 characters.
  const shortPrefixMatch = trimmed.match(/^([A-Z]{2,6})\s+(\d{6})$/);
  if (shortPrefixMatch) {
    return shortPrefixMatch[2];
  }

  // Case 2.7 (NEW): BIDV "Scan QR" format with optional trailing reference number
  // Example: "Scan QR 066023 2109693809825206272"
  // Pattern: "Scan QR" + 6-digit code + optional (space + reference)
  // The "Scan QR" prefix is BIDV's marker for QR-code-based payments (NAP qua QR).
  // Trailing reference number is the bank's internal transaction ID — bỏ qua, chỉ lấy 6-digit.
  // Distinct from Case 2.6 vì Case 2.6 chỉ match đúng 2 token, còn format này có 3-4 token.
  // Lưu ý: KHÔNG match "QR - thanhdrums9 252000" (old format có dấu "-" và username viết thường).
  const scanQrMatch = trimmed.match(/^Scan\s+QR\s+(\d{6})(?:\s+\S+)?$/);
  if (scanQrMatch) {
    return {
      type: 'scan-qr',
      code: scanQrMatch[1],
    };
  }

  // Case 2.8 (NEW): Bank short prefix + 6-digit code (UPPERCASE only, optional space).
  // Bổ sung cho Case 2.6 (chỉ match UPPERCASE + có space). Mục đích bắt các format:
  //   "SE123456" / "SE 123456" — SePay default payment code prefix
  //   "MB123456" / "MB 123456" — MBBank chuyển khoản QR
  //   "VCB123456" / "VCB 123456" — Vietcombank
  //   "BIDV123456" / "BID 123456" / "BIDV 123456" — BIDV
  //   "ACB123456" / "ACB 123456" — ACB
  //   "TPB123456" / "TPB 123456" — TPBank
  //   "VPB123456" / "VPB 123456" — VPBank
  //   "ICB123456" / "ICB 123456" — VietinBank
  //   "TCB123456" / "TCB 123456" — Techcombank
  // Whitelist bank codes thay vì match bất kỳ 2-6 chữ cái nào — tránh match nhầm với
  // username (vd: user tên "mb" gõ "mb 252000" sẽ KHÔNG match ở đây, an toàn).
  // UPPERCASE-only vì ngân hàng gửi prefix viết HOA; nếu user gõ thường thì rơi vào
  // reject (chấp nhận miss thay vì risk approve nhầm).
  const bankPrefixMatch = trimmed.match(/^(?:SE|SEPAY|MB|VCB|BIDV?|ACB|TPB|VPB|ICB|TCB)\s*(\d{6})$/);
  if (bankPrefixMatch) {
    return bankPrefixMatch[1];
  }

  // Case 3: Content starts with 6 digits followed by space or dash
  // Legacy format: "997044 FT26282279126632" or "997044-abc"
  // (We check this AFTER the new-format cases so that mixed content
  //  like "123456 foo 654321" correctly picks "654321".)
  const match = trimmed.match(/^(\d{6})[\s\-]/);
  if (match) {
    return match[1];
  }

  // Case 4: BIDV long format "MBVCB.xxx.username amount.CT ..."
  // Example: "MBVCB.16457010956.559317.daihung112 2600000.CT tu 1019322584 NGUYEN VAN TAM toi 96247B6RW7 PHAM VAN"
  const bidvMatch = trimmed.match(/\.([a-zA-Z0-9_]+)\s+(\d+)\.CT/);
  if (bidvMatch) {
    return {
      type: 'bidv',
      username: bidvMatch[1],
      amount: parseInt(bidvMatch[2], 10),
    };
  }

  // Case 5: Techcombank format "username amount FTxxx"
  // Example: "duongphuchung 252000 FT26282279126632"
  // Pattern: <username> <amount> FT<digits>
  const techcombankMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+(\d+)\s+FT\d+$/);
  if (techcombankMatch) {
    return {
      type: 'techcombank',
      username: techcombankMatch[1],
      amount: parseInt(techcombankMatch[2], 10),
    };
  }

  // Case 5.5 (NEW): Code and amount separated by comma
  // Example: "ZP7DCJUND45H, 144590" or "ZP7DCJUND45H,144590"
  // Pattern: {CODE}, {AMOUNT} where CODE is alphanumeric (deposit reference from SePay)
  const commaMatch = trimmed.match(/^([A-Z0-9]+)\s*,\s*(\d+)$/);
  if (commaMatch) {
    return commaMatch[1];
  }

  // Case 6 (NEW): Vietnamese generic text + 6-digit code (case-insensitive).
  // Đặt TRƯỚC reject logic cuối vì content có space + letters sẽ bị reject.
  // Các pattern hay gặp:
  //   "Chuyen tien 123456" / "chuyen tien 123456"
  //   "Thanh toan 123456" / "thanh toan 123456"
  //   "Nap tien 123456" / "nap tien 123456"
  //   "CK 123456" (chuyển khoản viết tắt)
  //   "TT 123456" (thanh toán viết tắt)
  //   "Chuyển tiền 123456" (có dấu tiếng Việt — regex có flag 'i' nhưng \w không bắt
  //   dấu; bỏ qua các variant có dấu, chỉ cover dạng không dấu vì hầu hết bank
  //   trong content CK dùng không dấu hoặc SePay normalize về không dấu).
  // KHÔNG match "username 252000" vì pattern yêu cầu keyword cố định ở đầu.
  const vietTextMatch = trimmed.match(/^(?:chuyen\s+tien|thanh\s+toan|nap\s+tien|ck|tt)\s+(\d{6})$/i);
  if (vietTextMatch) {
    return vietTextMatch[1];
  }

  // Case 2.9 (NEW): SePay/BIDV tự thêm mã QR vào nội dung, user gõ tiếp mã
  // nạp 6 số của hệ thống vào phía sau.
  // Ví dụ thực tế: "ZP263100611362 677567"
  //   - "ZP263100611362" = mã thanh toán do máy sinh (SePay/BIDV),
  //     có cả CHỮ IN HOA lẫn CHỮ SỐ.
  //   - "677567" = mã nạp 6 số do hệ thống sinh (transferNote).
  //
  // Vì sao phải phân biệt được với format cũ "username 252000"?
  //   Format cũ: token đầu là username (chữ thường, KHÔNG có số).
  //   Format mới: token đầu là mã máy sinh (CHỮ IN HOA + số).
  // → Chỉ coi là mã nạp khi token đứng trước là mã máy sinh hợp lệ.
  //
  // Đặt SAU Case 3-6 để không cướp mất các format có marker mạnh hơn
  // (ví dụ "duongphuchung 252000 FT26282279126632" — token "FT26282279126632"
  // cũng là "chữ HOA + số" nhưng thực ra là format Techcombank).
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const isMachineRef = (t) => /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6,}$/.test(t);
  const isSixDigits = (t) => /^\d{6}$/.test(t);

  if (tokens.some(isMachineRef)) {
    // Ưu tiên 1: mã nạp 6 số đứng NGAY SAU token máy sinh.
    //   "ZP263101138755 556308" → "556308"
    for (let i = 1; i < tokens.length; i++) {
      if (isMachineRef(tokens[i - 1]) && isSixDigits(tokens[i])) {
        return tokens[i];
      }
    }

    // Ưu tiên 2: mã nạp 6 số đứng NGAY TRƯỚC token máy sinh.
    //   "556308 ZP263101138755" → "556308"
    for (let i = 1; i < tokens.length; i++) {
      if (isMachineRef(tokens[i]) && isSixDigits(tokens[i - 1])) {
        return tokens[i - 1];
      }
    }

    // Dự phòng: content có token máy sinh nhưng mã nạp không nằm ngay cạnh nó
    // (vd: "ZP263100611362 1999000 677567") → lấy token 6 số cuối cùng.
    const codes = tokens.filter(isSixDigits);
    if (codes.length > 0) {
      return codes[codes.length - 1];
    }
  }

  // Reject old format like "username 252000"
  // Pattern: has space AND has alphabetic characters → old format
  if (trimmed.includes(' ') && /[a-zA-Z]/.test(trimmed)) {
    return null;
  }

  return null;
}

export default parseDepositCode;
