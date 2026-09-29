# 🎯 Console Log Flow - EmailJS Debug Guide

## 📋 Khi test login, bạn sẽ thấy log theo thứ tự:

### 1️⃣ **Frontend (Browser Console)** - Admin Login Page

```javascript
🚀 [Frontend] Bắt đầu request OTP
📝 Username: admin
🔒 Password: ***23
🌐 API Endpoint: POST /auth/admin/send-otp
⏳ [Frontend] Đang gọi API...

// Nếu thành công:
✅ [Frontend] API Response: { message: "Mã OTP đã được gửi...", expiresInSeconds: 300 }
📧 Email đích: phamlongfco2623@gmail.com
⏱️  OTP expires in: 300 seconds

// Nếu thất bại:
❌ [Frontend] Request OTP thất bại
Error status: 500
Error message: Không thể gửi email OTP...
Full error: { message: "...", error: "..." }
```

---

### 2️⃣ **Backend (Node.js Terminal)** - Server Console

#### **Route `/auth/admin/send-otp`:**
```
[AUTH] 🔐 Bắt đầu gửi OTP cho admin: admin
[AUTH] 📧 Email đích: phamlongfco2623@gmail.com
[AUTH] 🔢 OTP: 123456 (expires in 5 minutes)

========== [EmailJS] BẮT ĐẦU GỬI EMAIL ==========
[EmailJS] 1️⃣  Kiểm tra biến môi trường:
   - EMAILJS_SERVICE_ID: ✅ Có
   - EMAILJS_TEMPLATE_ID: ✅ Có
   - EMAILJS_USER_ID: ✅ Có
   
[EmailJS] 2️⃣  Payload chuẩn bị gửi:
   - API URL: https://api.emailjs.com/api/v1.0/email/send
   - Service ID: service_abc123
   - Template ID: template_xyz789
   - User ID: user_publickey456
   - Template Params: {
       "to_email": "phamlongfco2623@gmail.com",
       "to_name": "admin",
       "otp_code": "123456",
       "ttl_minutes": 5,
       "year": 2026
     }
     
[EmailJS] 3️⃣  Đang gửi request đến EmailJS API...

// CASE 1: Thành công
[EmailJS] 4️⃣  Response nhận được sau 234ms:
   - Status Code: 200
   - Status Text: OK
[EmailJS] ✅ GỬI EMAIL THÀNH CÔNG đến phamlongfco2623@gmail.com
========== [EmailJS] KẾT THÚC ==========

[AUTH] ✅ Email OTP đã được gửi thành công

// CASE 2: Thất bại (ví dụ: sai Service ID)
[EmailJS] 4️⃣  Response nhận được sau 189ms:
   - Status Code: 400
   - Status Text: Bad Request
[EmailJS] ❌ GỬI EMAIL THẤT BẠI!
   - Error Response: Invalid service_id
========== [EmailJS] KẾT THÚC ==========

[AUTH] ❌ GỬI EMAIL THẤT BẠI!
[AUTH] Error message: EmailJS API error: 400 — Invalid service_id
[AUTH] Error stack: ...

╔═══════════════════════════════════════╗
║  ⚠️  FALLBACK OTP (Email gửi thất bại) ║
╠═══════════════════════════════════════╣
║  Username: admin                      ║
║  OTP Code: 123456                     ║
║  Expires:  5 minutes                  ║
╚═══════════════════════════════════════╝
```

---

### 3️⃣ **Verify OTP** - Frontend Console

```javascript
🔐 [Frontend] Bắt đầu verify OTP
📝 Username: admin
🔢 OTP Code: 123456
🌐 API Endpoint: POST /auth/admin/verify-otp
⏳ [Frontend] Đang verify OTP...

// Nếu đúng:
✅ [Frontend] OTP hợp lệ! Đăng nhập thành công
👤 User: { _id: "...", username: "admin", role: "admin" }
🎫 Token received: eyJhbGciOiJIUzI1NiIs...

// Nếu sai:
❌ [Frontend] Verify OTP thất bại
Error status: 401
Error message: Mã OTP không hợp lệ hoặc đã hết hạn
```

---

## 🔍 Cách đọc log để debug

### ✅ **Trường hợp THÀNH CÔNG:**
1. Frontend → `🚀 Bắt đầu request OTP`
2. Backend → `🔐 Bắt đầu gửi OTP` → `✅ Có đủ biến môi trường`
3. EmailJS → `✅ GỬI EMAIL THÀNH CÔNG`
4. Frontend → `✅ API Response`
5. Kiểm tra email inbox/spam

---

### ❌ **Trường hợp THẤT BẠI:**

#### **Lỗi 1: Thiếu biến môi trường**
```
[EmailJS] 1️⃣  Kiểm tra biến môi trường:
   - EMAILJS_SERVICE_ID: ❌ Thiếu  ← ĐÂY LÀ VẤN ĐỀ
```
**Giải pháp:** Kiểm tra file `server/.env` có đủ 3 biến

---

#### **Lỗi 2: Sai Service ID/Template ID**
```
[EmailJS] 4️⃣  Response nhận được:
   - Status Code: 400
   - Error Response: Invalid service_id
```
**Giải pháp:** 
- Đăng nhập https://dashboard.emailjs.com/
- Copy đúng Service ID, Template ID
- Paste vào `server/.env`

---

#### **Lỗi 3: Template không có biến**
```
[EmailJS] 4️⃣  Response:
   - Status Code: 400
   - Error Response: Template variable 'otp_code' not found
```
**Giải pháp:** 
- Vào EmailJS Dashboard → Templates
- Edit template
- Thêm biến: `{{to_email}}`, `{{otp_code}}`, `{{to_name}}`, etc.

---

#### **Lỗi 4: Rate limit EmailJS**
```
[EmailJS] 4️⃣  Response:
   - Status Code: 429
   - Error Response: Too many requests
```
**Giải pháp:** 
- Free tier: 200 emails/tháng
- Đợi 1 phút rồi thử lại
- Hoặc upgrade plan

---

## 🛠️ Cách test nhanh

### Test 1: Kiểm tra biến môi trường
```bash
# Trong server terminal
cd c:\Users\web\shopphamlong\server
node -e "require('dotenv').config(); console.log('Service:', process.env.EMAILJS_SERVICE_ID); console.log('Template:', process.env.EMAILJS_TEMPLATE_ID); console.log('User:', process.env.EMAILJS_USER_ID);"
```

### Test 2: Test EmailJS trực tiếp
```bash
# Dùng curl/Postman gửi test request
curl -X POST https://api.emailjs.com/api/v1.0/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "service_id": "YOUR_SERVICE_ID",
    "template_id": "YOUR_TEMPLATE_ID",
    "user_id": "YOUR_USER_ID",
    "template_params": {
      "to_email": "phamlongfco2623@gmail.com",
      "to_name": "Test",
      "otp_code": "999999",
      "ttl_minutes": 5,
      "year": 2026
    }
  }'
```

### Test 3: Xem log chi tiết
```bash
# Mở 2 terminal:
# Terminal 1: Server
cd c:\Users\web\shopphamlong\server
npm run dev

# Terminal 2: Tail logs (nếu có file log)
# Hoặc xem trực tiếp terminal 1
```

---

## 📧 Checklist cuối cùng

- [ ] `.env` có đủ 3 biến: `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_USER_ID`
- [ ] Template EmailJS có đủ biến: `{{to_email}}`, `{{otp_code}}`, `{{to_name}}`, `{{ttl_minutes}}`, `{{year}}`
- [ ] Service EmailJS đã connect với Gmail
- [ ] Email `phamlongfco2623@gmail.com` có tồn tại
- [ ] Restart server sau khi sửa `.env`
- [ ] Mở Browser Console (F12) khi test
- [ ] Xem Node.js Terminal khi test
- [ ] Kiểm tra cả Inbox và Spam folder
- [ ] Nếu email không đến → Xem fallback OTP trong terminal

---

## 🎬 Video Flow (tưởng tượng)

1. Mở admin login: `http://localhost:5174`
2. Nhập username + password → Bấm "Gửi mã OTP"
3. **Nhìn vào 2 nơi:**
   - **Browser Console (F12):** Frontend logs
   - **Node.js Terminal:** Backend + EmailJS logs
4. Nếu thành công → Kiểm tra email
5. Nếu thất bại → Đọc log tìm `❌` và `Error Response`
6. Copy fallback OTP từ terminal (nếu email fail) → Nhập vào form → Đăng nhập
