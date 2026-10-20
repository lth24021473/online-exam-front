# Kế Hoạch Triển Khai: Hệ Thống Quản Lý & Tham Gia "Lớp Học" (Classrooms)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng tính năng Lớp học (Classrooms) khép kín end-to-end cho phép Giáo viên tạo lớp (mã lớp tự sinh + mật khẩu), giao đề thi độc quyền trong lớp; Học sinh tham gia bằng mã + mật khẩu, xem thành viên và làm các đề thi của lớp.

**Architecture:** Mở rộng cơ sở dữ liệu MongoDB thông qua Prisma với model `Classroom` và `ClassroomMember`; liên kết `Exam.classroomId`. Thêm `ClassroomsModule` trong NestJS API với guard bảo vệ phân quyền chặt chẽ và lọc phạm vi hiển thị đề thi. Phía Frontend triển khai giao diện Neo-Brutalist Bauhaus chuẩn accessibility và text-only button cho cả Manager và Student.

**Tech Stack:** NestJS 11, Prisma 6, MongoDB, React 19, TypeScript, React Router 7, Vite, Playwright, Jest.

**Spec:** [`d:\online-exam-front\docs\superpowers\specs\2026-10-20-classrooms-management-design.md`](file:///d:/online-exam-front/docs/superpowers/specs/2026-10-20-classrooms-management-design.md)

## Global Constraints

- Toàn bộ button trên Frontend phải là **Text-Only Button** (tuyệt đối không lồng thẻ icon SVG như `<svg>` hay Lucide icon bên trong phần tử `<button>`).
- Phong cách giao diện tuân thủ chuẩn **Neo-Brutalist Bauhaus** (`#ffcc00`, viền `2px solid #1a1a1a`, bóng `3px 3px 0 #1a1a1a`).
- Đề thi thuộc lớp (`classroomId != null`) **không bao giờ được xuất hiện** trong danh sách `/exams` công khai hay `/manage/exams` của giáo viên; chỉ hiển thị bên trong chi tiết lớp tương ứng.
- Giữ vững tỷ lệ pass 100% trên toàn bộ các bộ test hiện có (`tests/profile.spec.ts`, `tests/attempts.spec.ts`, `tests/sync-cross-browser.spec.ts`, `npm run test:e2e:real`, `npm test`).

## Review Focus

1. **Rò rỉ đề thi lớp ra danh mục công khai**: Đề thi được gán `classroomId` xuất hiện trên `GET /exams` nếu không lọc `classroomId: null`.
2. **Lộ mật khẩu lớp cho học sinh**: Endpoint `GET /classrooms/:id` hoặc `GET /classrooms/joined` trả về trường `password` cho học sinh đọc trộm.
3. **Học sinh chưa vào lớp làm lậu đề thi**: Học sinh biết được `examId` của đề trong lớp và gọi trực tiếp `POST /attempts` hoặc `GET /exams/:id`.
4. **Trùng lặp mã lớp ngẫu nhiên**: Thuật toán sinh mã lớp không kiểm tra trùng lặp dẫn đến xung đột `code` duy nhất.
5. **Xóa nhầm lớp đang có dữ liệu**: Giáo viên vô tình xóa lớp học đang chứa đề thi và điểm số của học sinh thay vì bị chặn.

---

### Task 1: Mở Rộng Schema Prisma & Đồng Bộ Database

**Files:**
- Modify: `d:\online-exam-api\prisma\schema.prisma`

**Interfaces:**
- Produces: `Classroom`, `ClassroomMember`, trường `classroomId` trong `Exam`

- [ ] **Step 1: Cập nhật `schema.prisma`**
Thêm model `Classroom`, `ClassroomMember`, và liên kết quan hệ trong `User` và `Exam`:
```prisma
model Classroom {
  id          String            @id @default(auto()) @map("_id") @db.ObjectId
  name        String
  code        String            @unique
  description String?
  password    String
  managerId   String            @db.ObjectId
  manager     User              @relation("ManagerClassrooms", fields: [managerId], references: [id])
  members     ClassroomMember[]
  exams       Exam[]
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  @@index([managerId])
  @@index([code])
}

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
Và trong `Exam`:
```prisma
  classroomId String?    @db.ObjectId
  classroom   Classroom? @relation(fields: [classroomId], references: [id])

  @@index([classroomId])
```

- [ ] **Step 2: Chạy `npx prisma generate` và cập nhật Docker**
Run: `cd d:\online-exam-api; npx prisma generate`
Run: `docker compose restart api`
Expected: Prisma Client được sinh mới có `Classroom` và `ClassroomMember`.

- [ ] **Step 3: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat(api): add Classroom and ClassroomMember models to schema"
```

---

### Task 2: Backend Classrooms DTOs, Repository & Service

**Files:**
- Create: `d:\online-exam-api\src\classrooms\dto\create-classroom.dto.ts`
- Create: `d:\online-exam-api\src\classrooms\dto\join-classroom.dto.ts`
- Create: `d:\online-exam-api\src\classrooms\classrooms.repository.ts`
- Create: `d:\online-exam-api\src\classrooms\classrooms.service.ts`
- Test: `d:\online-exam-api\src\classrooms\classrooms.service.spec.ts`

**Interfaces:**
- Produces: `ClassroomsService` với các phương thức `create`, `join`, `findManaged`, `findJoined`, `findById`, `findMembers`, `removeMember`, `deleteClassroom`.

- [ ] **Step 1: Viết test failing `classrooms.service.spec.ts`**
Kiểm thử logic:
- Sinh mã lớp ngẫu nhiên 6 ký tự không trùng lặp.
- Giáo viên tạo lớp học thành công.
- Học sinh nhập đúng mật khẩu tham gia lớp thành công.
- Học sinh nhập sai mật khẩu ném lỗi `BadRequestException`.
- Xóa lớp có đề thi ném lỗi `ConflictException`.

- [ ] **Step 2: Chạy test để xác nhận FAIL**
Run: `cd d:\online-exam-api; npm test -- src/classrooms/classrooms.service.spec.ts`
Expected: FAIL (modules chưa tồn tại).

- [ ] **Step 3: Cài đặt DTOs, Repository và Service**
- Thuật toán sinh mã 6 ký tự chữ số ngẫu nhiên: loại bỏ `0, O, 1, I` để tránh nhầm lẫn.
- Lưu trữ và so khớp mật khẩu lớp.
- Kiểm tra số lượng đề thi và bài làm trước khi cho phép xóa lớp.

- [ ] **Step 4: Chạy test để xác nhận PASS**
Run: `cd d:\online-exam-api; npm test -- src/classrooms/classrooms.service.spec.ts`
Expected: PASS 100%.

- [ ] **Step 5: Commit**
```bash
git add src/classrooms/
git commit -m "feat(api): implement Classrooms repository and service with unit tests"
```

---

### Task 3: Backend Controller, Module & Cô Lập Đề Thi Trong Lớp

**Files:**
- Create: `d:\online-exam-api\src\classrooms\classrooms.controller.ts`
- Create: `d:\online-exam-api\src\classrooms\classrooms.module.ts`
- Modify: `d:\online-exam-api\src\app.module.ts`
- Modify: `d:\online-exam-api\src\exams\exams.controller.ts`
- Modify: `d:\online-exam-api\src\exams\exams.repository.ts`
- Modify: `d:\online-exam-api\src\exams\exams.service.ts`
- Modify: `d:\online-exam-api\src\attempts\attempts.service.ts`
- Test: `d:\online-exam-api\src\classrooms\classrooms-exam-scope.spec.ts`

**Interfaces:**
- Consumes: `ClassroomsService`, `ExamsService`
- Produces: Các REST endpoint `/api/v1/classrooms/*` và lọc phạm vi đề thi `classroomId: null` trong `/api/v1/exams`.

- [ ] **Step 1: Viết test failing `classrooms-exam-scope.spec.ts`**
Kiểm thử:
- Đề thi tạo trong lớp có `classroomId`.
- `GET /exams` (học sinh) không trả về đề thi của lớp.
- `GET /exams` (giáo viên) không trả về đề thi của lớp.
- `GET /classrooms/:id/exams` trả về đề thi của lớp cho thành viên lớp.
- Học sinh không thuộc lớp gọi `POST /attempts` tạo bài thi cho đề của lớp bị trả về `403 Forbidden`.

- [ ] **Step 2: Cài đặt `ClassroomsController` và lọc phạm vi đề thi**
- Thêm `classroomId` vào `CreateExamDto`.
- Cập nhật `ExamsRepository.findAll`: nếu là truy vấn đề tự do, thêm điều kiện `classroomId: null`.
- Thêm endpoint `GET /classrooms/:id/exams`.
- Cập nhật `AttemptsService.createAttempt`: kiểm tra nếu đề có `classroomId`, xác thực người dùng đã tham gia lớp chưa.

- [ ] **Step 3: Chạy test để xác nhận PASS**
Run: `cd d:\online-exam-api; npm test -- src/classrooms/classrooms-exam-scope.spec.ts`
Expected: PASS 100%.

- [ ] **Step 4: Chạy toàn bộ test suite API**
Run: `cd d:\online-exam-api; npm test`
Expected: 100% pass (tất cả 6 test suites).

- [ ] **Step 5: Rebuild Docker container API**
Run: `docker compose up -d --build api`

- [ ] **Step 6: Commit**
```bash
git add src/
git commit -m "feat(api): implement ClassroomsController and strict exam scope isolation"
```

---

### Task 4: Frontend API Client Cho Classrooms

**Files:**
- Create: `d:\online-exam-front\src\api\classrooms.ts`
- Modify: `d:\online-exam-front\src\api\exams.ts` (thêm `classroomId`)

**Interfaces:**
- Produces: `classroomsApi` với các hàm `create`, `join`, `getManaged`, `getJoined`, `getDetail`, `getMembers`, `getExams`, `removeMember`, `deleteClassroom`.

- [ ] **Step 1: Định nghĩa types và axios client `src/api/classrooms.ts`**
Khởi tạo interface `Classroom`, `ClassroomMember`, `ClassroomExam`, payload `CreateClassroomPayload`, `JoinClassroomPayload`.

- [ ] **Step 2: Kiểm tra biên dịch TypeScript**
Run: `cd d:\online-exam-front; npm run build`
Expected: Build thành công không có lỗi type.

- [ ] **Step 3: Commit**
```bash
git add src/api/classrooms.ts src/api/exams.ts
git commit -m "feat(front): add classrooms API client"
```

---

### Task 5: Frontend Màn Hình Giáo Viên (Quản Lý Lớp & Chi Tiết Lớp)

**Files:**
- Create: `d:\online-exam-front\src\pages\ManagerClassesPage.tsx`
- Create: `d:\online-exam-front\src\pages\ManagerClassesPage.css`
- Create: `d:\online-exam-front\src\pages\ManagerClassDetailPage.tsx`
- Create: `d:\online-exam-front\src\pages\ManagerClassDetailPage.css`
- Modify: `d:\online-exam-front\src\components\ManagerCreateExamForm.tsx`
- Modify: `d:\online-exam-front\src\router\AppRouter.tsx`
- Modify: `d:\online-exam-front\src\layouts\AppLayout.tsx`

**Interfaces:**
- Consumes: `classroomsApi`, `useAuth`
- Produces: Route `/manage/classes`, `/manage/classes/:id`, điều hướng Header cho Manager.

- [ ] **Step 1: Tạo `ManagerClassesPage.tsx` và styling Neo-Brutalist**
- Hiển thị danh sách card lớp: Tên lớp, badge Mã lớp, Mật khẩu lớp, nút "Sao chép thông tin lớp", số học sinh, số đề thi.
- Nút "Tạo lớp học mới" mở modal tạo lớp (Tên lớp, Mô tả, Mật khẩu). Text-only buttons.
- Nút "Xóa lớp" có xác nhận và thông báo rõ ràng nếu bị chặn xóa.

- [ ] **Step 2: Tạo `ManagerClassDetailPage.tsx`**
- Header hiển thị Tên lớp, Mã lớp, Mật khẩu.
- 2 Tab chuyển đổi: "Đề thi của lớp" và "Danh sách thành viên".
- Tab Đề thi: danh sách đề thi, nút "Tạo đề thi cho lớp" (chuyển hướng `/manage/exams/create?classroomId=...`).
- Tab Thành viên: danh sách học sinh (Avatar, Họ tên, Email, Ngày tham gia), nút "Xóa khỏi lớp".

- [ ] **Step 3: Tích hợp `ManagerCreateExamForm.tsx` & Router & AppLayout**
- Đọc query param `classroomId` khi tạo đề thi và gửi lên API.
- Thêm NavLink `Quản lý lớp` trên header cho role `EXAM_MANAGER` và `ADMIN`.

- [ ] **Step 4: Kiểm tra build Frontend**
Run: `cd d:\online-exam-front; npm run build`
Expected: Build pass sạch sẽ.

- [ ] **Step 5: Commit**
```bash
git add src/
git commit -m "feat(front): implement manager classrooms management pages and navigation"
```

---

### Task 6: Frontend Màn Hình Học Sinh (Lớp Của Tôi, Tham Gia & Làm Bài)

**Files:**
- Create: `d:\online-exam-front\src\pages\StudentClassesPage.tsx`
- Create: `d:\online-exam-front\src\pages\StudentClassesPage.css`
- Create: `d:\online-exam-front\src\pages\StudentClassDetailPage.tsx`
- Create: `d:\online-exam-front\src\pages\StudentClassDetailPage.css`
- Modify: `d:\online-exam-front\src\pages\ProfilePage.tsx` (tích hợp danh sách lớp vào tab Lớp học)
- Modify: `d:\online-exam-front\src\router\AppRouter.tsx`
- Modify: `d:\online-exam-front\src\layouts\AppLayout.tsx`

**Interfaces:**
- Consumes: `classroomsApi`, `useAuth`
- Produces: Route `/classes`, `/classes/:id`, điều hướng Header cho Student.

- [ ] **Step 1: Tạo `StudentClassesPage.tsx`**
- Danh sách card các lớp đã tham gia: Tên lớp, Giáo viên, số bạn cùng lớp, số đề thi.
- Nút "Tham gia lớp mới" mở modal nhập Mã lớp và Mật khẩu. Báo lỗi cụ thể nếu sai mã/mật khẩu.

- [ ] **Step 2: Tạo `StudentClassDetailPage.tsx`**
- Header lớp: Tên lớp, Giáo viên phụ trách, Mô tả.
- Tab 1: Đề thi: danh sách đề thi của lớp kèm số câu, thời gian, số lần làm. Nút "Làm bài" chuyển sang làm bài chuẩn `/exams/:examId/take`.
- Tab 2: Thành viên: danh sách các bạn trong lớp và giáo viên.

- [ ] **Step 3: Cập nhật `ProfilePage.tsx` tab `#profile-panel-classes`**
- Hiển thị danh sách lớp mà tài khoản đang sở hữu/tham gia thay cho placeholder rỗng.

- [ ] **Step 4: Tích hợp Header Nav cho Student**
- Thêm NavLink `Lớp học` (`/classes`) trên header cho `STUDENT`.

- [ ] **Step 5: Kiểm tra build Frontend**
Run: `cd d:\online-exam-front; npm run build`
Expected: Build pass 100%.

- [ ] **Step 6: Commit**
```bash
git add src/
git commit -m "feat(front): implement student classrooms pages and profile integration"
```

---

### Task 7: Kiểm Thử Toàn Diện E2E & Nghiệm Thu Hệ Thống

**Files:**
- Create: `d:\online-exam-front\tests\classrooms-real.spec.ts`

- [ ] **Step 1: Viết kịch bản kiểm thử E2E đa vai trò `classrooms-real.spec.ts`**
Kịch bản đầy đủ trên API thật và MongoDB thật:
1. Giáo viên đăng nhập $\rightarrow$ Tạo lớp học "Lớp Chuyên Toán 12" với mật khẩu "ToanMatKhau1@".
2. Hệ thống tạo mã lớp (lấy mã lớp từ giao diện).
3. Học sinh đăng nhập $\rightarrow$ Vào trang Lớp học $\rightarrow$ Nhập mã lớp + sai mật khẩu $\rightarrow$ Báo lỗi mật khẩu không chính xác.
4. Học sinh nhập đúng mật khẩu $\rightarrow$ Tham gia thành công.
5. Giáo viên vào lớp tạo đề thi "Kiểm tra đại số chương 1".
6. Học sinh kiểm tra trang `/exams` công khai $\rightarrow$ Đề thi của lớp không xuất hiện.
7. Giáo viên kiểm tra trang `/manage/exams` $\rightarrow$ Đề thi của lớp không xuất hiện.
8. Học sinh vào `/classes/:id` $\rightarrow$ Thấy đề thi trong tab Đề thi $\rightarrow$ Bấm Làm bài và nộp bài.
9. Giáo viên vào xem kết quả bài làm của học sinh trong lớp.
10. Giáo viên thử bấm xóa lớp $\rightarrow$ Bị chặn thông báo lỗi vì lớp đã có đề thi/bài làm.

- [ ] **Step 2: Chạy kiểm thử E2E mới**
Run: `npx playwright test tests/classrooms-real.spec.ts`
Expected: 1/1 passed.

- [ ] **Step 3: Chạy lại toàn bộ test suites hiện hữu**
Run: `npx playwright test tests/profile.spec.ts`
Run: `npx playwright test tests/attempts.spec.ts`
Run: `npx playwright test tests/sync-cross-browser.spec.ts`
Run: `npm run test:e2e:real`
Run: `npm test` (API)
Expected: 100% pass toàn diện.

- [ ] **Step 4: Commit và hoàn thành**
```bash
git add tests/
git commit -m "test(e2e): add comprehensive multi-role classrooms integration test"
```
