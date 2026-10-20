# Đặc Tả Kỹ Thuật Hoàn Chỉnh: Quản Lý Lịch Thi Tự Động, Mở Lại Đề, Giới Hạn Lượt Làm Bài & Đồng Bộ Hồ Sơ Người Dùng

> **Ngày cập nhật:** 2026-10-20  
> **Trạng thái:** Đã thống nhất với người dùng (Approved Spec)  
> **Phong cách UI:** Google Stitch Bauhaus Neo-Brutalism (`#1a1a1a`, `#ffcc00`, `#e63b2e`, viền 2px, bóng khối 3px, nút bấm **CHỈ CÓ CHỮ, KHÔNG CÓ ICON**).

---

## 1. Mục Tiêu & Nghiệp Vụ Cốt Lõi (Intent & Requirements)

1. **Lịch thi tự động (`opensAt`, `closesAt`)**:
   - Giáo viên có thể cài đặt khung giờ tự động mở đề (`opensAt`) và tự động đóng đề (`closesAt`) ngay khi tạo đề hoặc chỉnh sửa sau khi xuất bản.
   - **Quy chế thu bài giờ đóng đề (Hard Cutoff)**: Khi đến mốc `closesAt` (ví dụ 10:00), hệ thống thu hồi bài đúng 10:00. Nếu học viên vào làm bài lúc 09:50 và đề có thời lượng 60 phút, thời hạn nộp bài được tính là `deadlineAt = min(startedAt + duration, closesAt)` (tức là chỉ còn 10 phút làm bài đến đúng 10:00). Bộ đếm ngược hiển thị chính xác theo thời gian này và tự động nộp bài khi hết giờ.
2. **Mở lại đề thi (`reopen`)**:
   - Khi đề ở trạng thái ĐÃ ĐÓNG (`CLOSED`), giáo viên có nút thao tác **MỞ LẠI ĐỀ THI** (`POST /exams/:id/reopen`) để kích hoạt đề trở lại trạng thái `PUBLISHED`.
   - Toàn bộ bài làm và kết quả của các học viên đã nộp ở đợt thi trước đó được **bảo lưu nguyên vẹn 100%**.
   - Nếu đề thi có `closesAt` cũ đã hết hạn, giáo viên có thể cập nhật `closesAt` mới khi mở lại đề.
3. **Giới hạn số lượt làm bài (`maxAttempts`)**:
   - Giáo viên thiết lập số lần làm bài tối đa cho mỗi học viên (mặc định 1 lần).
   - Số lượt làm bài được tính lũy kế theo số lần nộp bài (`SUBMITTED`) của từng học viên. Khi học viên đã nộp đủ số lần quy định, hệ thống khóa nút làm bài, chỉ cho phép xem kết quả và lời giải.
   - Khi đề được mở lại, những học viên đã hết lượt thi vẫn bị khóa, chỉ những học viên chưa thi hoặc chưa hết lượt mới được vào làm bài (trừ khi giáo viên chủ động nâng số lần làm tối đa `maxAttempts`).
4. **Xếp hạng theo điểm cao nhất (Best Score)**:
   - Khi học viên làm bài nhiều lần, bảng xếp hạng của giáo viên (`Leaderboard`) và kết quả tổng kết của học viên ghi nhận **lần làm có điểm cao nhất**. Nếu bằng điểm thì ưu tiên bài làm có thời gian làm ngắn hơn.
   - Trang lịch sử làm bài (`AttemptHistoryPage`) vẫn lưu trữ và hiển thị đầy đủ chi tiết mọi lần làm của học viên.
5. **Đồng bộ hồ sơ người dùng đa trình duyệt**:
   - Bổ sung `avatar`, `cover`, `workplace`, `currentResidence` vào database MongoDB (`User` model) và API `PATCH /users/me`.
   - Đồng bộ dữ liệu xuyên suốt giữa các trình duyệt/thiết bị của cùng một tài khoản.

---

## 2. Kiến Trúc Dữ Liệu Backend (`online-exam-api`)

### 2.1. Prisma Schema (`prisma/schema.prisma`)
```prisma
model User {
  id               String   @id @default(auto()) @map("_id") @db.ObjectId
  email            String   @unique
  passwordHash     String
  fullName         String
  role             Role     @default(STUDENT)
  avatar           String?  // Data URL hoặc URL ảnh đại diện
  cover            String?  // Data URL hoặc URL ảnh bìa
  workplace        String?  // Nơi làm việc
  currentResidence String?  // Nơi ở hiện tại
  authVersion      Int?     @default(0)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  exams            Exam[]
  attempts         Attempt[]
}

model Exam {
  id              String     @id @default(auto()) @map("_id") @db.ObjectId
  title           String
  description     String?
  instructions    String?
  durationMinutes Int
  status          ExamStatus @default(DRAFT)
  publishedAt     DateTime?
  closedAt        DateTime?
  opensAt         DateTime?  // Thời gian bắt đầu mở đề
  closesAt        DateTime?  // Thời gian kết thúc đóng đề (Hard Cutoff)
  maxAttempts     Int        @default(1) // Số lần làm tối đa (>= 1)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  managerId       String     @db.ObjectId
  manager         User       @relation(fields: [managerId], references: [id])
  questions       Question[]
  attempts        Attempt[]

  @@index([managerId])
  @@index([status])
}
```

### 2.2. Chi Tiết API Contracts

1. **`PATCH /api/v1/users/me`**:
   - Cập nhật thông tin profile: `fullName`, `avatar`, `cover`, `workplace`, `currentResidence`.
   - Trả về đối tượng `AuthUser` hoàn chỉnh.
2. **`POST /api/v1/exams` & `PATCH /api/v1/exams/:id`**:
   - Nhận thêm: `opensAt?: string | null`, `closesAt?: string | null`, `maxAttempts?: number`.
   - Trên đề `PUBLISHED` hoặc `CLOSED`: cho phép cập nhật metadata, `opensAt`, `closesAt`, `maxAttempts` nhưng không cho sửa cấu trúc câu hỏi.
3. **`POST /api/v1/exams/:id/reopen`**:
   - Cho phép giáo viên sở hữu đề mở lại đề thi từ `CLOSED` sang `PUBLISHED`.
   - Request body tùy chọn: `{ closesAt?: string | null }`.
   - Giữ nguyên tất cả attempts và lịch sử cũ.
4. **`POST /api/v1/attempts/start`**:
   - Kiểm tra `opensAt`: Nếu `now < opensAt`, trả về HTTP 400 (`Chưa đến thời gian mở đề thi`).
   - Kiểm tra `closesAt`: Nếu `now >= closesAt`, trả về HTTP 409 (`Đề thi đã đóng`).
   - Kiểm tra lượt làm: Đếm số `SUBMITTED` attempts của user cho đề này. Nếu `>= maxAttempts`, trả về HTTP 409 (`Bạn đã hoàn thành tối đa số lượt làm bài cho phép`).
   - Tính toán hạn nộp:
     ```typescript
     let deadlineAt = new Date(Date.now() + exam.durationMinutes * 60_000);
     if (exam.closesAt && exam.closesAt.getTime() < deadlineAt.getTime()) {
       deadlineAt = exam.closesAt; // Hard Cutoff
     }
     ```
5. **`GET /api/v1/exams/:id/results`**:
   - Hỗ trợ Bảng xếp hạng (Leaderboard): nhóm theo học viên, chọn lần nộp bài có `score` cao nhất (Best Score).
   - Hỗ trợ xem toàn bộ danh sách tất cả các lượt nộp bài để giáo viên theo dõi tiến độ chi tiết.

---

## 3. Thiết Kế Giao Diện Frontend (`online-exam-front`)

### 3.1. Form Tạo & Quản Lý Đề Thi (`ManagerCreateExamForm.tsx`, `ManagerExamDetailPage.tsx`)
- Thêm trường chọn `Thời gian mở đề` (`datetime-local`), `Thời gian đóng đề` (`datetime-local`), và `Số lần làm bài tối đa` (số nguyên $\ge 1$).
- Khi đề ở trạng thái `CLOSED`: hiển thị nút hành động chữ thuần **MỞ LẠI ĐỀ THI** (`#ffcc00`, viền 2px, bóng khối 3px).

### 3.2. Màn hình Chi tiết Đề & Làm bài (`ExamDetailPage.tsx`, `TakeExamPage.tsx`)
- Nếu `now < opensAt`: Hiển thị huy hiệu `CHƯA ĐẾN GIỜ THI`, khóa nút làm bài.
- Nếu `now >= closesAt`: Hiển thị huy hiệu `ĐÃ ĐÓNG`, khóa nút làm bài.
- Nếu học viên đã nộp đủ `maxAttempts`: Hiển thị huy hiệu `ĐÃ DÙNG HẾT LƯỢT THI (X/X)`, nút bấm chuyển thành `XEM KẾT QUẢ & ĐÁP ÁN`.
- Trong khi làm bài: Bộ đếm thời gian đếm ngược chính xác theo `deadlineAt` (tự động nộp bài khi chạm mốc đóng đề).

### 3.3. Đồng bộ Hồ sơ (`useProfileImage.ts`, `AccountProfileProvider.tsx`)
- Gọi `PATCH /users/me` khi thay đổi avatar, cover, thông tin tài khoản.
- Tự động đồng bộ và hiển thị trên mọi trình duyệt/thiết bị đăng nhập cùng tài khoản.

---

## 4. Danh Sách Các Quyết Định Kỹ Thuật Đã Chốt (Technical Calls Made)
1. **Hard Cutoff**: Chặn giờ nộp bài bằng `min(startedAt + duration, closesAt)` đúng theo yêu cầu chốt của người dùng.
2. **Bảo toàn dữ liệu**: Thao tác mở lại đề tuyệt đối không xóa bài làm cũ; đếm số lượt thi lũy kế để áp dụng giới hạn `maxAttempts`.
3. **Độ ưu tiên điểm số**: Leaderboard lọc ra bài thi có điểm cao nhất của từng thí sinh, nếu bằng điểm thì ưu tiên bài nộp sớm hơn / thời gian làm ngắn hơn.
4. **Style**: Giữ nghiêm ngặt thiết kế Google Stitch Bauhaus Neo-Brutalist, 100% nút bấm chữ thuần in hoa, không icon bên trong nút.
