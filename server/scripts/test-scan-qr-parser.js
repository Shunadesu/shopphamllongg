// Comprehensive test cho parseDepositCode — copy y nguyên logic từ sepayWebhook.js
// (Bao gồm cả các case mới: 2.8 bank prefix, 6 Vietnamese text)
function parseDepositCode(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();

  // Case 1
  if (/^\d{6}$/.test(trimmed)) return trimmed;

  // Case 2 (CT)
  const ctMatch = trimmed.match(/(?:^|\D)(\d{6})(?=\.CT)(?!\d)/);
  if (ctMatch) return ctMatch[1];

  if (!/[a-zA-Z]/.test(trimmed)) {
    const allMatches = trimmed.match(/(?:^|\D)(\d{6})(?!\d)/g);
    if (allMatches && allMatches.length > 0) {
      const lastMatch = allMatches[allMatches.length - 1];
      return lastMatch.match(/\d{6}$/)[0];
    }
  }

  // Case 2.5
  const dashCodeMatch = trimmed.match(/-\s*(\d{6})(?!\d)$/);
  if (dashCodeMatch) return dashCodeMatch[1];

  // Case 2.6
  const shortPrefixMatch = trimmed.match(/^([A-Z]{2,6})\s+(\d{6})$/);
  if (shortPrefixMatch) return shortPrefixMatch[2];

  // Case 2.7
  const scanQrMatch = trimmed.match(/^Scan\s+QR\s+(\d{6})(?:\s+\S+)?$/);
  if (scanQrMatch) return { type: 'scan-qr', code: scanQrMatch[1] };

  // Case 2.8 (NEW): bank short prefix UPPERCASE only
  const bankPrefixMatch = trimmed.match(/^(?:SE|SEPAY|MB|VCB|BIDV?|ACB|TPB|VPB|ICB|TCB)\s*(\d{6})$/);
  if (bankPrefixMatch) return bankPrefixMatch[1];

  // Case 3
  const match = trimmed.match(/^(\d{6})[\s\-]/);
  if (match) return match[1];

  // Case 4
  const bidvMatch = trimmed.match(/\.([a-zA-Z0-9_]+)\s+(\d+)\.CT/);
  if (bidvMatch) return { type: 'bidv', username: bidvMatch[1], amount: parseInt(bidvMatch[2], 10) };

  // Case 5
  const techcombankMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+(\d+)\s+FT\d+$/);
  if (techcombankMatch) return { type: 'techcombank', username: techcombankMatch[1], amount: parseInt(techcombankMatch[2], 10) };

  // Case 6 (NEW): Vietnamese text + 6-digit
  const vietTextMatch = trimmed.match(/^(?:chuyen\s+tien|thanh\s+toan|nap\s+tien|ck|tt)\s+(\d{6})$/i);
  if (vietTextMatch) return vietTextMatch[1];

  // Old format reject
  if (trimmed.includes(' ') && /[a-zA-Z]/.test(trimmed)) return null;
  return null;
}

const cases = [
  // === Trường hợp đang lỗi trước đó (quan trọng nhất) ===
  { input: 'Scan QR 066023 2109693809825206272', expected: { type: 'scan-qr', code: '066023' } },

  // === Variants of Scan QR ===
  { input: 'Scan QR 066023', expected: { type: 'scan-qr', code: '066023' } },
  { input: 'Scan QR 388887 ABC123XYZ', expected: { type: 'scan-qr', code: '388887' } },
  { input: '  Scan QR 066023 2109693809825206272  ', expected: { type: 'scan-qr', code: '066023' } },

  // === Case 2.8 mới: Bank short prefix (case-insensitive, optional space) ===
  // SePay default
  { input: 'SE123456', expected: '123456' },
  { input: 'SE 123456', expected: '123456' },
  { input: 'SEPAY123456', expected: '123456' },
  { input: 'SEPAY 388887', expected: '388887' },
  // MBBank
  { input: 'MB123456', expected: '123456' },
  { input: 'MB 123456', expected: '123456' },
  // Vietcombank
  { input: 'VCB123456', expected: '123456' },
  { input: 'VCB 123456', expected: '123456' },
  // BIDV (cả BID và BIDV)
  { input: 'BIDV123456', expected: '123456' },
  { input: 'BIDV 123456', expected: '123456' },
  { input: 'BID123456', expected: '123456' },
  { input: 'BID 388887', expected: '388887' },
  // ACB
  { input: 'ACB123456', expected: '123456' },
  { input: 'ACB 123456', expected: '123456' },
  // TPBank / VPBank / VietinBank / Techcombank
  { input: 'TPB123456', expected: '123456' },
  { input: 'TPB 388887', expected: '388887' },
  { input: 'VPB123456', expected: '123456' },
  { input: 'ICB123456', expected: '123456' },
  { input: 'TCB123456', expected: '123456' },

  // === Case 6 mới: Vietnamese text + 6-digit code ===
  { input: 'Chuyen tien 123456', expected: '123456' },
  { input: 'chuyen tien 123456', expected: '123456' },
  { input: 'CHUYEN TIEN 388887', expected: '388887' },
  { input: 'Thanh toan 123456', expected: '123456' },
  { input: 'thanh toan 388887', expected: '388887' },
  { input: 'Nap tien 123456', expected: '123456' },
  { input: 'nap tien 388887', expected: '388887' },
  { input: 'CK 123456', expected: '123456' }, // chuyển khoản viết tắt
  { input: 'TT 388887', expected: '388887' }, // thanh toán viết tắt
  { input: '  CK  123456  ', expected: '123456' }, // trim + multi-space

  // === Regression: các format đang work ===
  { input: '123456', expected: '123456' },
  { input: 'QR 574948', expected: '574948' }, // Case 2.6
  { input: 'IBFT 239268', expected: '239268' }, // Case 2.6
  { input: 'NAP 388887', expected: '388887' }, // Case 2.6
  { input: '997044 FT26282279126632', expected: '997044' }, // Case 3
  { input: 'MBVCB.16457010956.559317.daihung112 2600000.CT tu 1019322584', expected: { type: 'bidv', username: 'daihung112', amount: 2600000 } }, // Case 4
  { input: 'duongphuchung 252000 FT26282279126632', expected: { type: 'techcombank', username: 'duongphuchung', amount: 252000 } }, // Case 5
  { input: '151015889347 0866586858 388887', expected: '388887' }, // Case 2 all-numeric ending
  { input: 'MBVCB.16464989264.754632.388044.CT tu 1069...', expected: '388044' }, // Case 2 before .CT

  // === Regression: các format phải REJECT ===
  { input: 'username 252000', expected: null }, // old format
  { input: 'thanhdrums9 252000', expected: null }, // old format
  { input: 'QR - thanhdrums9 252000', expected: null }, // old BIDV
  { input: 'NAP 388887 12345', expected: null }, // has trailing ref
  // Quan trọng: KHÔNG match lowercase bank prefix để tránh collision với username
  { input: 'mb 252000', expected: null }, // "mb" lowercase + space + 6-digit → reject (an toàn)
  { input: 'vcb 252000', expected: null }, // tương tự
  // Nhưng UPPERCASE thì match (vì bank gửi content viết HOA)
  { input: 'MB 252000', expected: '252000' }, // OK — đây là bank format
  { input: 'VCB 252000', expected: '252000' }, // OK
];

let pass = 0, fail = 0;
for (const { input, expected } of cases) {
  const result = parseDepositCode(input);
  const ok = JSON.stringify(result) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`✅ ${JSON.stringify(input)} → ${JSON.stringify(result)}`);
  } else {
    fail++;
    console.log(`❌ ${JSON.stringify(input)}`);
    console.log(`   expected: ${JSON.stringify(expected)}`);
    console.log(`   got     : ${JSON.stringify(result)}`);
  }
}

console.log(`\n=== RESULT: ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);