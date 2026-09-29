# 📧 Hướng dẫn EmailJS: Backend vs Frontend

## 🔍 Tại sao EmailJS thường dùng ở Frontend?

### ✅ **Frontend (Khuyến nghị cho EmailJS)**
```
User Browser → EmailJS API → Email Service Provider → Recipient
```

**Ưu điểm:**
- ✅ Không cần backend server
- ✅ Không cần cấu hình SMTP phức tạp
- ✅ Free tier 200 emails/tháng
- ✅ Setup nhanh cho side project/prototyping

**Nhược điểm:**
- ❌ Public key (User ID) bị lộ trong browser
- ❌ Rate limit dễ bị bypass/abuse
- ❌ Không kiểm soát được security layer
- ❌ Khó scale cho production app

---

### ⚠️ **Backend (Đang dùng hiện tại)**
```
User Browser → Node.js Server → EmailJS API → Email → Recipient
```

**Ưu điểm:**
- ✅ Bảo mật: Keys được giữ trong `.env`, không lộ ra client
- ✅ Kiểm soát logic: Xác thực user trước khi gửi email
- ✅ Rate limiting: Tránh spam từ client
- ✅ Audit log: Ghi nhận mọi email gửi đi

**Nhược điểm:**
- ❌ Cần duy trì backend server
- ❌ EmailJS không thiết kế cho backend (nên dùng Nodemailer, SendGrid, Resend)

---

## 🎯 Quyết định: Nên dùng cách nào?

### **Dự án của bạn → NÊN DÙNG BACKEND** ✅

**Lý do:**
1. **Admin login cần bảo mật cao** — không thể để frontend tự gửi OTP
2. **Đã có Node.js server** — không tốn thêm infrastructure
3. **Cần xác thực user/password** trước khi gửi OTP
4. **Tránh spam/abuse** — frontend có thể bị bypass

---

## 🛠️ Setup hiện tại (Backend EmailJS)

### 1️⃣ File: `server/.env`
```env
EMAILJS_SERVICE_ID=service_abc123
EMAILJS_TEMPLATE_ID=template_xyz789
EMAILJS_USER_ID=user_publickey456
ADMIN_EMAIL=phamlongfco2623@gmail.com
```

### 2️⃣ File: `server/services/emailSender.js`
- Gọi EmailJS REST API từ Node.js
- Payload gửi: `service_id`, `template_id`, `user_id`, `template_params`
- Console log chi tiết từng bước (đã thêm)

### 3️⃣ Flow hoạt động:
```
1. Admin nhập username + password → Frontend gọi POST /api/auth/admin/request-otp
2. Backend xác thực password → Tạo OTP random 6 số
3. Lưu OTP vào Redis (TTL 5 phút)
4. Gọi emailSender.sendOtpEmail() → EmailJS API
5. EmailJS gửi email → phamlongfco2623@gmail.com
6. Admin nhập OTP → Backend verify → Trả JWT token
```

---

## 📋 Checklist Debug EmailJS

### Bước 1: Kiểm tra EmailJS Dashboard
- [ ] Đăng nhập https://dashboard.emailjs.com/
- [ ] Service đã connect (Gmail/Outlook/...)
- [ ] Template có đúng biến: `{{to_email}}`, `{{to_name}}`, `{{otp_code}}`, `{{ttl_minutes}}`, `{{year}}`
- [ ] Test template bằng "Send Test Email"

### Bước 2: Kiểm tra `.env`
```bash
# Trong server/.env
EMAILJS_SERVICE_ID=service_...  # Lấy từ dashboard
EMAILJS_TEMPLATE_ID=template_... # Lấy từ dashboard
EMAILJS_USER_ID=...              # Public Key từ Account > API Keys
ADMIN_EMAIL=phamlongfco2623@gmail.com
```

### Bước 3: Xem Console Log (đã thêm)
Khi gửi email, terminal sẽ hiện:
```
========== [EmailJS] BẮT ĐẦU GỬI EMAIL ==========
[EmailJS] 1️⃣  Kiểm tra biến môi trường:
   - EMAILJS_SERVICE_ID: ✅ Có
   - EMAILJS_TEMPLATE_ID: ✅ Có
   - EMAILJS_USER_ID: ✅ Có
[EmailJS] 2️⃣  Payload chuẩn bị gửi:
   - API URL: https://api.emailjs.com/api/v1.0/email/send
   - Service ID: service_abc123
   - Template ID: template_xyz789
   - Template Params: {
       "to_email": "phamlongfco2623@gmail.com",
       "to_name": "Admin",
       "otp_code": "123456",
       ...
     }
[EmailJS] 3️⃣  Đang gửi request đến EmailJS API...
[EmailJS] 4️⃣  Response nhận được sau 234ms:
   - Status Code: 200
   - Status Text: OK
[EmailJS] ✅ GỬI EMAIL THÀNH CÔNG đến phamlongfco2623@gmail.com
========== [EmailJS] KẾT THÚC ==========
```

### Bước 4: Kiểm tra Email
- [ ] Vào inbox: phamlongfco2623@gmail.com
- [ ] Kiểm tra **Spam/Junk folder**
- [ ] Kiểm tra EmailJS Dashboard > Logs (xem email có được gửi không)

---

## 🔄 Nếu muốn chuyển sang Frontend EmailJS

### File: `admin/src/pages/Login.jsx`
```jsx
import emailjs from '@emailjs/browser';

// Trong handleRequestOTP()
const sendOTPEmail = async (email, otpCode) => {
  const templateParams = {
    to_email: email,
    to_name: 'Admin',
    otp_code: otpCode,
    ttl_minutes: 5,
    year: new Date().getFullYear(),
  };

  try {
    await emailjs.send(
      'service_abc123',        // Service ID
      'template_xyz789',       // Template ID
      templateParams,
      'user_publickey456'      // Public Key
    );
    console.log('✅ Email sent from frontend');
  } catch (error) {
    console.error('❌ Email error:', error);
  }
};
```

**⚠️ Lưu ý:** Cách này **KHÔNG KHUYẾN NGHỊ** vì:
- Public key lộ ra browser
- Bất kỳ ai cũng có thể gửi email spam bằng key của bạn
- Không xác thực password trước khi gửi OTP

---

## 🎯 Kết luận

✅ **Tiếp tục dùng Backend EmailJS** (setup hiện tại)  
✅ **Console log đã được thêm** vào `emailSender.js`  
✅ **Bước tiếp theo:** Restart server và test login

**Câu lệnh test:**
```bash
# Terminal 1: Restart server
cd server
npm run dev

# Terminal 2: Test login từ admin panel
# Mở http://localhost:5174 (hoặc port admin của bạn)
# Nhập username + password → Bấm "Gửi mã OTP"
# Xem console log trong Terminal 1
```
