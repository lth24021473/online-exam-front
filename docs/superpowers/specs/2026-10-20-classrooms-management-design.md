# Thiết Kế Kỹ Thuật: Hệ Thống Quản Lý & Tham Gia "Lớp Học" (Classrooms)

## 1. Bối cảnh & Mục tiêu (Context & Goals)

### 1.1. Bối cảnh (Why)
Hiện tại, hệ thống thi trắc nghiệm chỉ hỗ trợ đề thi công khai chung. Giáo viên (EXAM_MANAGER) cần có không gian riêng biệt gọi là **"Lớp học" (Classroom)** để gom nhóm học sinh theo từng lớp/khóa học, giao các đề thi chuyên biệt chỉ dành riêng cho học sinh trong lớp đó mà không bị lẫn vào danh mục đề thi công khai hay danh sách đề thi chung của giáo viên.

### 1.2. Mục tiêu (Goals)
- **Dành cho Giáo viên (EXAM_MANAGER & ADMIN)**:
  - Tạo Lớp học mới với: *Tên lớp*, *Mô tả*, và *Mật khẩu lớp*.
  - Hệ thống tự động sinh ngẫu nhiên *Mã lớp* (Class Code) gồm 6 ký tự chữ in hoa và số (ví dụ: `K9X2B7`), đảm bảo duy nhất trên toàn hệ thống.
  - Quản lý danh sách các lớp đã tạo (`/manage/classes`): xem thông tin lớp, mã lớp, mật khẩu (để sao chép gửi cho học sinh), số lượng học sinh và số lượng đề thi.
  - Tạo đề thi riêng trực tiếp bên trong lớp: Đề thi này **chỉ hiển thị và quản lý trong lớp đó**.
  - Xem danh sách thành viên (học sinh) đã tham gia lớp và có quyền loại học sinh khỏi lớp nếu cần.
  - **Chính sách xóa lớp**: Chặn xóa lớp nếu lớp đã có đề thi hoặc bài làm của học sinh nhằm bảo toàn toàn vẹn dữ liệu điểm số và lịch sử thi.
- **Dành cho Học sinh (STUDENT)**:
  - Có mục "Lớp học" (`/classes`) hiển thị danh sách các lớp học sinh đã tham gia.
  - Tham gia lớp học mới bằng cách nhập đúng **Mã lớp** và **Mật khẩu lớp**.
  - Vào lớp học xem chi tiết (`/classes/:id`): xem thông tin giáo viên, danh sách đề thi độc quyền trong lớp và danh sách các bạn cùng lớp.
  - Làm các đề thi trong lớp giống như đề thi bình thường (tính giờ, số lần làm tối đa, chấm điểm, xem lịch sử và kết quả).
- **Phân tách phạm vi đề thi tuyệt đối (Strict Scope Isolation)**:
  - Trang đề thi công khai của học sinh (`/exams`): **Chỉ hiển thị đề thi không thuộc lớp nào** (`classroomId == null`).
  - Trang quản lý đề chung của giáo viên (`/manage/exams`): **Chỉ hiển thị đề thi không thuộc lớp nào** (`classroomId == null`).
  - Đề thi của lớp nào sẽ **chỉ hiển thị duy nhất bên trong lớp đó** (`/classes/:id` đối với học sinh và `/manage/classes/:id` đối với giáo viên).
  - Học sinh chưa tham gia lớp không thể xem hoặc tạo bài làm (`Attempt`) cho đề thi của lớp đó.

### 1.3. Phi mục tiêu (Non-Goals & Anti-Goals)
- Không tạo hệ thống diễn đàn chat thời gian thực phức tạp trong lớp (tập trung vào thi trắc nghiệm và quản lý thành viên).
- Không cho phép học sinh tự tạo lớp (chỉ `EXAM_MANAGER` và `ADMIN` được tạo lớp).
- Không tự động thêm học sinh mà không có mật khẩu lớp (học sinh bắt buộc phải nhập đúng mật khẩu lớp để tham gia).

---

## 2. Mô Hình Dữ Liệu (Database Schema - Prisma & MongoDB)

### 2.1. Thực thể `Classroom`
```prisma
model Classroom {
  id          String            @id @default(auto()) @map("_id") @db.ObjectId
  name        String
  code        String            @unique // Mã lớp duy nhất 6 ký tự, ví dụ: "K9X2B7"
  description String?
  password    String            // Mật khẩu lớp giáo viên đặt
  managerId   String            @db.ObjectId
  manager     User              @relation("ManagerClassrooms", fields: [managerId], references: [id])
  members     ClassroomMember[]
  exams       Exam[]
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  @@index([managerId])
  @@index([code])
}
```

### 2.2. Thực thể `ClassroomMember` (Bảng liên kết Học sinh - Lớp)
```prisma
model ClassroomMember {
  id          String    @id @default(auto()) @map("_id") @db.ObjectId
  classroomId String    @db.ObjectId
  classroom   Classroom @relation(fields: [classroomId], references: [id], onDelete: Cascade)
  userId      String    @db.ObjectId
  user        User      @relation(fields: [userId], references: [id])
  joinedAt    DateTime  @default(now())

  @@unique([classroomId, userId])
  @@index([userId])
  @@index([classroomId])
}
```

### 2.3. Bổ sung quan hệ trong `User` & `Exam`
- Trong `User`:
  ```prisma
  managedClassrooms Classroom[]       @relation("ManagerClassrooms")
  classroomMembers  ClassroomMember[]
  ```
- Trong `Exam`:
  ```prisma
  classroomId       String?           @db.ObjectId
  classroom         Classroom?        @relation(fields: [classroomId], references: [id])

  @@index([classroomId])
  ```

---

## 3. Đặc Tả RESTful API Contracts (`d:\online-exam-api`)

Module mới: `ClassroomsModule` (`classrooms.controller.ts`, `classrooms.service.ts`, `classrooms.repository.ts`).

### 3.1. Nhóm API Quản Lý Lớp (Dành cho Giáo viên & Quản trị)
1. `POST /api/v1/classrooms`
   - Phân quyền: `EXAM_MANAGER`, `ADMIN`
   - Request Body:
     ```json
     {
       "name": "Luyện thi Toán 12 - Chuyên đề Hàm số",
       "description": "Lớp ôn tập chuyên sâu các dạng bài vận dụng cao",
       "password": "Toan123@"
     }
     ```
   - Logic: Tự động sinh `code` ngẫu nhiên gồm 6 ký tự (ký tự [A-Z0-9], loại trừ các ký tự dễ nhầm lẫn như O, 0, I, 1), kiểm tra tránh trùng lặp và lưu vào DB.
   - Response: `201 Created` kèm thông tin lớp và mã `code`.

2. `GET /api/v1/classrooms/managed`
   - Phân quyền: `EXAM_MANAGER`, `ADMIN`
   - Response: Danh sách lớp do giáo viên hiện tại tạo, kèm thống kê:
     `{ items: [{ id, name, code, description, password, memberCount, examCount, createdAt, updatedAt }] }`

3. `GET /api/v1/classrooms/:id`
   - Phân quyền: Đã đăng nhập (`STUDENT` phải là thành viên lớp; `EXAM_MANAGER` sở hữu lớp hoặc `ADMIN`).
   - Response: Thông tin chi tiết lớp, thông tin giáo viên phụ trách, số lượng thành viên, số lượng đề thi.
   - **Bảo mật**: Nếu người gọi là `STUDENT`, trường `password` sẽ được lọc bỏ khỏi JSON trả về.

4. `DELETE /api/v1/classrooms/:id`
   - Phân quyền: Giáo viên sở hữu lớp hoặc `ADMIN`.
   - **Chính sách**: Chặn xóa nếu lớp có đề thi hoặc bài làm (`ConflictException: Không thể xóa lớp học đã có đề thi hoặc bài làm`). Chỉ cho phép xóa khi lớp trống.

5. `DELETE /api/v1/classrooms/:id/members/:userId`
   - Phân quyền: Giáo viên sở hữu lớp hoặc `ADMIN`.
   - Logic: Xóa một học sinh khỏi lớp học. Học sinh vẫn giữ nguyên lịch sử bài thi cá nhân đã hoàn thành trong quá khứ.

### 3.2. Nhóm API Dành Cho Học Sinh (Tham gia & Học tập)
1. `POST /api/v1/classrooms/join`
   - Phân quyền: `STUDENT` (hoặc bất kỳ tài khoản hợp lệ).
   - Request Body:
     ```json
     {
       "code": "K9X2B7",
       "password": "Toan123@"
     }
     ```
   - Logic:
     - Tìm lớp theo `code` (không phân biệt hoa thường). Nếu không thấy -> `404 Not Found` ("Mã lớp không tồn tại").
     - Kiểm tra `password`. Nếu không khớp -> `400 Bad Request` ("Mật khẩu lớp không chính xác").
     - Kiểm tra nếu đã tham gia từ trước -> `409 Conflict` ("Bạn đã tham gia lớp học này rồi").
     - Tạo bản ghi `ClassroomMember`.
   - Response: `200 OK` / `201 Created` kèm chi tiết lớp học vừa tham gia.

2. `GET /api/v1/classrooms/joined`
   - Phân quyền: `STUDENT`.
   - Response: Danh sách các lớp học sinh đã tham gia:
     `{ items: [{ id, name, code, description, manager: { fullName, email, avatar }, memberCount, examCount, joinedAt }] }`

3. `GET /api/v1/classrooms/:id/members`
   - Phân quyền: Thành viên lớp hoặc giáo viên sở hữu.
   - Response: Danh sách thành viên lớp:
     `{ items: [{ userId, fullName, email, avatar, role, joinedAt }] }`

### 3.3. Nhóm API Đề Thi Trong Lớp (Tích Hợp Với `ExamsModule`)
1. `GET /api/v1/classrooms/:id/exams`
   - Phân quyền: Thành viên lớp hoặc giáo viên sở hữu lớp / admin.
   - Response: Danh sách đề thi thuộc lớp đó (kèm trạng thái, số câu, thời lượng, số lần làm tối đa).
2. `POST /api/v1/exams` (Cập nhật):
   - Thêm trường tùy chọn `classroomId?: string`.
   - Nếu có `classroomId`, kiểm tra giáo viên có sở hữu lớp này không.
3. `GET /api/v1/exams` (Cập nhật nghiêm ngặt theo yêu cầu người dùng):
   - **Đối với Học sinh**: Bổ sung điều kiện `classroomId: null` để chỉ hiển thị đề thi tự do công khai.
   - **Đối với Giáo viên**: Bổ sung điều kiện `classroomId: null` để trang `/manage/exams` chỉ hiển thị đề thi tự do của giáo viên. Đề thi thuộc lớp học sẽ chỉ hiển thị ở `/manage/classes/:id`.
4. `POST /api/v1/attempts` & `GET /api/v1/exams/:id` (Guard kiểm tra quyền vào đề thi lớp):
   - Nếu đề thi có `classroomId`, kiểm tra học sinh đã tham gia lớp đó chưa trước khi cho phép xem câu hỏi hoặc bắt đầu làm bài.

---

## 4. Kiến Trúc Giao Diện Frontend (`d:\online-exam-front`)

Thiết kế tuân thủ nghiêm ngặt **Neo-Brutalist Bauhaus** (màu `#ffcc00`, viền `2px solid #1a1a1a`, bóng `3px 3px 0 #1a1a1a`, nút thuần chữ **Text-Only Button** không chứa icon SVG bên trong button).

### 4.1. Điều Hướng & Routing
1. **Header Navigation ([`AppLayout.tsx`](file:///d:/online-exam-front/src/layouts/AppLayout.tsx))**:
   - Đối với Manager: Thêm mục `Quản lý lớp` (`/manage/classes`).
   - Đối với Student: Thêm mục `Lớp học` (`/classes`).
2. **Tab "Lớp học" trong Hồ sơ cá nhân ([`ProfilePage.tsx`](file:///d:/online-exam-front/src/pages/ProfilePage.tsx))**:
   - Tab `#profile-panel-classes` hiển thị danh sách các lớp học sinh/giáo viên đang tham gia/quản lý.

### 4.2. Màn Hình Dành Cho Giáo Viên (Manager)
1. **Trang Danh Sách Lớp (`/manage/classes` - `ManagerClassesPage.tsx`)**:
   - Tiêu đề "Quản lý lớp học", hiển thị tổng số lớp.
   - Nút "Tạo lớp học mới" mở Modal nhập: Tên lớp, Mô tả, Mật khẩu lớp.
   - Danh sách Card lớp học Neo-Brutalist:
     + Tên lớp, badge Mã lớp (in đậm trên nền vàng `#ffcc00`), Mật khẩu lớp (kèm nút "Sao chép mã & mật khẩu").
     + Thống kê: Số học sinh, số đề thi đã giao.
     + Nút hành động: "Vào lớp quản lý", "Xem thành viên", "Xóa lớp" (chặn xóa nếu có đề/bài làm).
2. **Trang Chi Tiết Lớp (`/manage/classes/:id` - `ManagerClassDetailPage.tsx`)**:
   - Header lớp: Tên lớp, Mã lớp, Mật khẩu, nút sao chép thông tin.
   - 2 Tab quản lý:
     + **Tab 1: Đề thi của lớp**: Danh sách đề thi tạo riêng cho lớp. Nút "Tạo đề thi cho lớp" (chuyển hướng sang trang tạo đề với `classroomId`).
     + **Tab 2: Thành viên**: Danh sách học sinh (Avatar, Họ tên, Email, Ngày vào lớp) và nút "Xóa khỏi lớp".

### 4.3. Màn Hình Dành Cho Học Sinh (Student)
1. **Trang Danh Sách Lớp Học (`/classes` - `StudentClassesPage.tsx`)**:
   - Nút "Tham gia lớp mới" mở Modal nhập: Mã lớp (Code) và Mật khẩu lớp (Password).
   - Danh sách các lớp học sinh đã tham gia: Card hiển thị Tên lớp, Giáo viên phụ trách, Số lượng bạn cùng lớp, Số đề thi đang có.
   - Bấm vào lớp để chuyển đến trang chi tiết lớp học.
2. **Trang Chi Tiết Lớp Học (`/classes/:id` - `StudentClassDetailPage.tsx`)**:
   - Header lớp: Tên lớp, Giáo viên phụ trách, Mô tả.
   - 2 Tab:
     + **Tab 1: Đề thi**: Danh sách đề thi riêng của lớp. Hiển thị số câu, thời gian làm bài, số lần làm tối đa. Nút "Làm bài" đưa thẳng vào luồng làm bài thi chuẩn (`/exams/:examId/take`).
     + **Tab 2: Thành viên**: Danh sách bạn cùng lớp và giáo viên.

---

## 5. Chiến Lược Kiểm Thử (Testing & Quality Assurance)

1. **Backend Unit & Integration Tests (Jest)**:
   - `classrooms.service.spec.ts`: Test sinh mã lớp không trùng lặp, tạo lớp, tham gia lớp đúng/sai mật khẩu, chặn xóa lớp khi có đề thi.
   - `classrooms-exam-scope.spec.ts`: Test đề thi có `classroomId` bị ẩn khỏi `/exams` công khai và trang quản lý đề chung của giáo viên; chặn học sinh ngoài lớp tạo attempt.
2. **Frontend End-to-End Tests (Playwright)**:
   - `tests/classrooms-real.spec.ts`:
     + Giáo viên đăng nhập $\rightarrow$ Tạo lớp học "Lớp 12A1" (Mật khẩu "Pass123@").
     + Lấy mã lớp tự sinh.
     + Học sinh đăng nhập $\rightarrow$ Nhập mã lớp + sai mật khẩu $\rightarrow$ Báo lỗi.
     + Nhập đúng mật khẩu $\rightarrow$ Vào lớp thành công.
     + Giáo viên tạo đề thi gán cho lớp.
     + Học sinh kiểm tra `/exams` công khai không thấy đề; vào `/classes/:id` thấy đề và làm bài thi nộp bài thành công.
     + Giáo viên kiểm tra `/manage/exams` không có đề của lớp; vào `/manage/classes/:id` thấy đề và kết quả bài làm của học sinh.
3. **Tiêu chuẩn chất lượng**:
   - Tỷ lệ pass: 100% toàn bộ test suites hiện có và test mới.
   - Tuyệt đối không icon SVG trong `<button>`. Styling chuẩn Bauhaus.
