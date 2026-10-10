# SePay Webhook Parser Update - BIDV Format Support

## Thay đổi

### 1. Mở rộng `parseDepositCode()` function
- **Case 1**: 6 chữ số chính xác (`123456`) → return string
- **Case 2**: 6 chữ số + khoảng trắng + text (`997044 FT...`) → return string (6 số đầu)
- **Case 3**: BIDV format dài → return object `{ type: 'bidv', username, amount }`
- **Case 4 (MỚI)**: Techcombank format `username amount FTxxx` → return object `{ type: 'techcombank', username, amount }`

**Regex BIDV**: `\.([a-zA-Z0-9_]+)\s+(\d+)\.CT`
- Tìm pattern: `.username amount.CT` trong content
- Extract: username và amount từ nội dung BIDV gửi về

**Regex Techcombank**: `^([a-zA-Z0-9_]+)\s+(\d+)\s+FT\d+$`
- Tìm pattern: `username amount FT<digits>` ở đầu
- Ví dụ: `duongphuchung 252000 FT26282279126632`

### 2. Update webhook handler logic
Thay vì chỉ match theo 6-digit code, giờ hỗ trợ 3 loại match:

**Type 1: 6-digit code** (format mới)
```
parsed = "123456" (string)
  ↓
Match: DepositRequest { status: 'pending', transferNote: '123456' }
  ↓
Sort by createdAt ascending (oldest pending first)
```

**Type 2: BIDV format** (xử lý content dài)
```
parsed = { type: 'bidv', username: 'daihung112', amount: 2600000 }
  ↓
Tìm User theo username
  ↓
Match: DepositRequest { userId, status: 'pending', amount: 2600000 }
  ↓
Sort by createdAt descending (newest pending first - gần nhất)
```

**Type 3: Techcombank format** (xử lý content ngắn có FT)
```
parsed = { type: 'techcombank', username: 'duongphuchung', amount: 252000 }
  ↓
Tìm User theo username
  ↓
Match: DepositRequest { userId, status: 'pending', amount: 252000 }
  ↓
Sort by createdAt descending (newest pending first - gần nhất)
```

### 3. Improved logging
Log hiển thị loại match được sử dụng:
```
✅ Approved via 6-digit-code — SePay id=... matched code="123456" → deposit #...
✅ Approved via bidv-format — SePay id=... matched BIDV user="daihung112", amount=2600000 → deposit #...
✅ Approved via techcombank-format — SePay id=... matched Techcombank user="duongphuchung", amount=252000 → deposit #...
```

## Lợi ích

✅ **Xử lý nội dung dài từ BIDV** (không bị reject)
✅ **Logic mới**, không tái sử dụng parser cũ
✅ **Rõ ràng match type** trong logs
✅ **An toàn**: Fallback match theo amount + user, không đoán mò
✅ **Tương thích ngược**: 6-digit code vẫn work như trước

## Ví dụ

### Nội dung dài từ BIDV
```
MBVCB.16457010956.559317.daihung112 2600000.CT tu 1019322584 NGUYEN VAN TAM toi 96247B6RW7 PHAM VAN
```
- Parser extract: `username=daihung112, amount=2600000`
- Webhook tìm DepositRequest: user="daihung112" + amount=2600000 + pending
- Approved ✅

### Format mã 6 số (vẫn work)
```
123456
```
- Parser: return "123456"
- Webhook tìm: transferNote="123456" + pending
- Approved ✅

### Format cũ (reject như trước)
```
QR - thanhdrums9 252000
username 123000
```
- Parser: return null
- Log: "Cannot parse content"
- Ignore ✅ (tránh match sai)
