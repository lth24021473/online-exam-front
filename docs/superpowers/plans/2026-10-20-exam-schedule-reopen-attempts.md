# Kế Hoạch Triển Khai: Quản Lý Lịch Thi Tự Động, Mở Lại Đề, Giới Hạn Lượt Làm & Đồng Bộ Hồ Sơ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai hoàn chỉnh tính năng cài đặt thời gian mở/đóng tự động theo chuẩn Hard Cutoff, mở lại đề thi bảo lưu kết quả cũ, cấu hình giới hạn số lượt thi tối đa lấy điểm cao nhất, và đồng bộ hồ sơ người dùng đa trình duyệt vào MongoDB.

**Architecture:** Mở rộng Prisma schema cho cả `User` và `Exam`, thêm endpoint backend RESTful trong NestJS, nâng cấp logic bắt đầu bài thi với Hard Cutoff (`deadlineAt = min(startedAt + duration, closesAt)`) và kiểm tra `maxAttempts`. Trên frontend React, tích hợp các trường lịch thi/lượt thi vào form quản lý, hiển thị nút "MỞ LẠI ĐỀ THI", đồng bộ thời gian thi thực tế cho học sinh và xếp hạng theo Best Score.

**Tech Stack:** NestJS 11, Prisma ORM, MongoDB, React 19, TypeScript, Tailwind CSS / Vanilla CSS, Playwright, Jest.

**Spec:** `docs/superpowers/specs/2026-10-20-exam-schedule-reopen-attempts-design.md`

## Global Constraints
- Style UI: Chuẩn Google Stitch Bauhaus Neo-Brutalism (`#1a1a1a`, `#ffcc00`, `#e63b2e`, viền 2px solid, bóng khối 3px solid, Space Grotesk in hoa).
- Nút bấm: **100% chữ thuần in hoa, không dùng bất kỳ SVG icon nào bên trong nút**.
- Hard Cutoff: Hết giờ đóng đề là thu bài ngay lập tức, `deadlineAt = min(startedAt + duration, closesAt)`.
- Bảo toàn dữ liệu: Mở lại đề thi không bao giờ xóa bài làm cũ.
- Tương thích ngược: Đảm bảo 100% test suite Playwright và Jest luôn đạt kết quả PASS.

## Review Focus
1. Học viên bắt đầu bài thi sát giờ đóng đề: `deadlineAt` phải bị chặn trên bởi `closesAt` và bộ đếm ngược phải dừng chính xác tại `closesAt`.
2. Học viên tải lại trang (reload) hoặc mất mạng khi thi trong đề có `closesAt`: Khi khôi phục bài thi (`resume`), hạn nộp vẫn phải giữ nguyên mốc Hard Cutoff.
3. Học viên đã dùng hết `maxAttempts`: Gọi `POST /attempts/start` trực tiếp qua API phải bị từ chối bằng mã HTTP 409.
4. Mở lại đề thi (`reopen`): Trạng thái đề quay lại `PUBLISHED`, các bài nộp cũ giữ nguyên, các chỉ số thống kê không bị reset.
5. Đồng bộ ảnh đại diện / ảnh bìa / nơi ở: Khi lưu trên một trình duyệt, mở tab ẩn danh hoặc trình duyệt khác đăng nhập cùng tài khoản phải thấy ngay dữ liệu mới.

---

### Task 1: Backend Database & Profile Sync API

**Files:**
- Modify: `d:\online-exam-api\prisma\schema.prisma:35-65`
- Create: `d:\online-exam-api\src\users\dto\update-profile.dto.ts`
- Modify: `d:\online-exam-api\src\users\users.repository.ts:38-60`
- Modify: `d:\online-exam-api\src\users\users.service.ts:40-60`
- Modify: `d:\online-exam-api\src\users\users.controller.ts:20-38`
- Modify: `d:\online-exam-front\src\api\auth.api.ts:5-55`
- Modify: `d:\online-exam-front\src\profile\account-profile-storage.ts:1-58`
- Modify: `d:\online-exam-front\src\profile\AccountProfileProvider.tsx:1-33`
- Modify: `d:\online-exam-front\src\profile\useProfileImage.ts:40-118`

**Interfaces:**
- Consumes: Prisma Client, JwtAuthGuard.
- Produces: `PATCH /api/v1/users/me` với payload `UpdateProfileDto`, cập nhật `AuthUser` và lưu vào MongoDB.

- [ ] **Step 1: Write backend tests for updating profile**
  Viết unit test cho `UsersService.updateProfile` và `UsersController.updateProfile` kiểm tra cập nhật `avatar`, `cover`, `workplace`, `currentResidence`.
- [ ] **Step 2: Update Prisma schema and push to MongoDB**
  Thêm `avatar String?`, `cover String?`, `workplace String?`, `currentResidence String?` vào model `User` và `opensAt DateTime?`, `closesAt DateTime?`, `maxAttempts Int @default(1)` vào model `Exam`.
  Chạy: `npx prisma db push && npx prisma generate` trong `d:\online-exam-api`.
- [ ] **Step 3: Implement `UpdateProfileDto` and `PATCH /users/me` in NestJS**
  Tạo DTO với validation, cập nhật `UsersRepository.updateProfile`, `UsersService.updateProfile`, và thêm `@Patch('me')` trong `UsersController`.
- [ ] **Step 4: Update frontend `auth.api.ts` and Profile storage hooks**
  Thêm hàm `updateProfile` trong `auth.api.ts`. Cập nhật `useProfileImage.ts` và `AccountProfileProvider.tsx` gọi API `PATCH /users/me` khi thay đổi avatar, cover, thông tin tài khoản.
- [ ] **Step 5: Run tests to verify profile sync passes**
  Chạy `npm test` trong `d:\online-exam-api` và `npx playwright test tests/profile.spec.ts` trong `d:\online-exam-front`.

---

### Task 2: Backend Exam Scheduling, Reopening & Hard Cutoff Attempt Limits

**Files:**
- Modify: `d:\online-exam-api\src\exams\dto\create-exam.dto.ts`
- Modify: `d:\online-exam-api\src\exams\dto\update-exam.dto.ts`
- Modify: `d:\online-exam-api\src\exams\exams.repository.ts`
- Modify: `d:\online-exam-api\src\exams\exams.service.ts`
- Modify: `d:\online-exam-api\src\exams\exams.controller.ts`
- Modify: `d:\online-exam-api\src\attempts\attempts.service.ts:25-70`
- Modify: `d:\online-exam-api\src\attempts\attempts.repository.ts`

**Interfaces:**
- Consumes: `opensAt`, `closesAt`, `maxAttempts` từ `Exam` model.
- Produces:
  - `POST /api/v1/exams/:id/reopen`: Mở lại đề thi `CLOSED` -> `PUBLISHED`.
  - `POST /api/v1/attempts/start`: Áp dụng Hard Cutoff (`deadlineAt = min(startedAt + duration, closesAt)`), kiểm tra `opensAt`, `closesAt`, và `maxAttempts`.

- [ ] **Step 1: Write backend tests for schedule, reopen and attempt limits**
  Tạo test suite `src/exams/exam-schedule-reopen.spec.ts` kiểm tra:
  - Reopen chuyển trạng thái từ `CLOSED` sang `PUBLISHED`, không xóa attempt cũ.
  - Không cho phép start attempt nếu chưa đến `opensAt`.
  - Không cho phép start attempt nếu quá `closesAt`.
  - Giới hạn `maxAttempts`: nếu đã nộp $\ge maxAttempts$ thì từ chối HTTP 409.
  - Hard Cutoff: nếu `startedAt + duration > closesAt` thì `deadlineAt = closesAt`.
- [ ] **Step 2: Implement DTOs & ExamsService reopen and edit**
  Thêm `opensAt`, `closesAt`, `maxAttempts` vào DTOs.
  Triển khai method `reopen(id, managerId, role, dto)` và cho phép cập nhật lịch thi trên đề `PUBLISHED` / `CLOSED`.
- [ ] **Step 3: Implement Hard Cutoff and attempt limit in `AttemptsService`**
  Trong `attempts.service.ts`: đếm số bài `SUBMITTED`, đối chiếu `maxAttempts`. Tính toán `deadlineAt = min(startedAt + duration, closesAt)`.
- [ ] **Step 4: Run backend tests to verify**
  Chạy: `npm test` trong `d:\online-exam-api`.

---

### Task 3: Backend & Frontend Leaderboard (Best Score per Student)

**Files:**
- Modify: `d:\online-exam-api\src\exams\exams.repository.ts:listResults`
- Modify: `d:\online-exam-front\src\api\exams.ts:results`
- Modify: `d:\online-exam-front\src\pages\ManagerExamResultsPage.tsx`

**Interfaces:**
- Consumes: Danh sách `attempts` của đề thi.
- Produces: Bảng xếp hạng nhóm theo từng học sinh, lấy điểm cao nhất `bestScore` và thời gian làm ngắn nhất khi bằng điểm.

- [ ] **Step 1: Implement best score aggregation in `listResults`**
  Cập nhật logic `listResults` của `exams.repository.ts`: nhóm theo `userId`, chọn attempt có `score` cao nhất làm đại diện xếp hạng.
- [ ] **Step 2: Update frontend `ManagerExamResultsPage.tsx`**
  Hiển thị Bảng xếp hạng với Podium Top 3 và bảng danh sách học sinh theo điểm cao nhất. Bổ sung tab xem toàn bộ lượt làm để giáo viên kiểm tra chi tiết.
- [ ] **Step 3: Verify leaderboard rendering**
  Kiểm tra trang kết quả giáo viên hiển thị chính xác học sinh có điểm cao nhất.

---

### Task 4: Frontend Manager UI for Schedule, Reopen & Attempt Limits

**Files:**
- Modify: `d:\online-exam-front\src\api\exams.ts`
- Modify: `d:\online-exam-front\src\components\ManagerCreateExamForm.tsx`
- Modify: `d:\online-exam-front\src\pages\ManagerExamDetailPage.tsx`

**Interfaces:**
- Consumes: API `POST /exams/:id/reopen`, `PATCH /exams/:id`.
- Produces: UI cài đặt lịch mở/đóng, số lượt làm, và nút "MỞ LẠI ĐỀ THI".

- [ ] **Step 1: Add API client methods in `exams.ts`**
  Bổ sung `reopen(id, payload)` và các trường `opensAt`, `closesAt`, `maxAttempts` vào kiểu `ExamInfo`.
- [ ] **Step 2: Update `ManagerCreateExamForm.tsx`**
  Thêm trường nhập `Thời gian mở đề` (`datetime-local`), `Thời gian đóng đề` (`datetime-local`), và `Số lần làm tối đa` (mặc định 1).
- [ ] **Step 3: Update `ManagerExamDetailPage.tsx`**
  - Hiển thị thông tin lịch thi và lượt làm.
  - Khi đề ở trạng thái `CLOSED`: hiển thị nút hành động chữ thuần **MỞ LẠI ĐỀ THI** (chuẩn Neo-Brutalism `#ffcc00`, viền 2px, bóng 3px).
  - Cho phép sửa thời hạn đóng đề và xác nhận mở lại đề.
- [ ] **Step 4: Verify manager tests and compilation**
  Chạy `npm run build` và kiểm tra luồng quản lý đề.

---

### Task 5: Frontend Student UI for Scheduled Exams & Hard Cutoff Experience

**Files:**
- Modify: `d:\online-exam-front\src\pages\ExamDetailPage.tsx`
- Modify: `d:\online-exam-front\src\pages\TakeExamPage.tsx`
- Modify: `d:\online-exam-front\src\pages\AttemptHistoryPage.tsx`
- Create/Modify: `d:\online-exam-front\tests\exam-schedule-reopen.spec.ts`

**Interfaces:**
- Consumes: `opensAt`, `closesAt`, `maxAttempts`, `deadlineAt`.
- Produces: Giao diện thi tuân thủ lịch mở/đóng, Hard Cutoff đếm ngược, và hiển thị Best Score trên lịch sử.

- [ ] **Step 1: Update `ExamDetailPage.tsx` for student view**
  - Trước `opensAt`: hiển thị huy hiệu `CHƯA ĐẾN GIỜ THI` và khóa nút làm bài.
  - Quá `closesAt`: hiển thị huy hiệu `ĐÃ ĐÓNG` và khóa nút làm bài.
  - Khi hết lượt làm ($\ge maxAttempts$): hiển thị `ĐÃ DÙNG HẾT LƯỢT THI (X/X)` và chuyển thành nút `XEM KẾT QUẢ & ĐÁP ÁN`.
- [ ] **Step 2: Update `TakeExamPage.tsx` countdown timer**
  Đảm bảo đồng hồ đếm ngược luôn chạy đến `deadlineAt` (đã được backend tính Hard Cutoff), tự động submit bài khi hết giờ.
- [ ] **Step 3: Update `AttemptHistoryPage.tsx`**
  Đánh dấu nhãn `ĐIỂM CAO NHẤT` cho bài thi đạt điểm cao nhất của từng đề trong danh sách lịch sử.
- [ ] **Step 4: Write Playwright E2E tests for the complete flow**
  Viết test kiểm tra:
  - Học viên xem đề chưa đến giờ -> nút bị khóa.
  - Học sinh làm bài lần 1 -> nộp bài -> làm lần 2 -> hết lượt thi -> bị khóa.
  - Giáo viên đóng đề -> bấm "MỞ LẠI ĐỀ THI" -> học sinh còn lượt vào thi bình thường.
  - Đồng bộ profile hiển thị đúng trên nhiều session.
- [ ] **Step 5: Run full Playwright test suite to confirm 100% PASS**
  Chạy `npx playwright test` và xác nhận tất cả test pass.
