# Kế Hoạch Triển Khai Logic Frontend (Online Exam System)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện và nâng cấp logic frontend cho 2 luồng ưu tiên: Sinh viên (làm bài thi, đối chiếu đáp án, quản lý lịch sử) và Giáo viên (soạn đề thi, xem Bảng xếp hạng học sinh Top 3 Leaderboard), đồng bộ 100% phong cách Bauhaus Neo-Brutalist với nút bấm chữ thuần (text-only).

**Architecture:** Mở rộng trang kết quả giáo viên với Tab Bảng xếp hạng (Podium Top 3 + Leaderboard table) mà không làm ảnh hưởng đến bảng kết quả mặc định hiện có; nâng cấp hiển thị đối chiếu đáp án và Question Palette trong phòng thi; loại bỏ hoàn toàn icon trong nút bấm để đạt độ tinh gọn typographic.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-10-19-exam-flows-logic-design.md`

## Global Constraints

- 100% tương thích ngược với 108 bài kiểm tra Playwright hiện có.
- Nút bấm chỉ dùng chữ (`Space Grotesk` uppercase), không chứa icon SVG bên trong.
- Bảng màu Bauhaus: `#1a1a1a` (đen mực), `#ffcc00` (vàng), `#e63b2e` (đỏ), `#0055ff` (xanh dương), viền 2px và đổ bóng khối 3px.
- Backend API giữ nguyên hợp đồng `online-exam-api`.

## Review Focus

- Bảng xếp hạng Leaderboard khi đề thi chưa có bài nộp nào (`SUBMITTED` = 0) phải hiển thị empty-state trực quan thay vì bục vinh danh rỗng.
- Chế độ xem mặc định trên `/manage/exams/:examId/results` phải giữ nguyên Tab "Danh sách kết quả" để không làm sai lệch các bài test tự động của Playwright.
- Khi học sinh click nộp bài, hộp thoại xác nhận phải báo chính xác số câu đã làm và số câu chưa làm.
- Trang xem kết quả bài làm của sinh viên phải đối chiếu rõ ràng giữa đáp án sinh viên đã chọn và đáp án đúng của hệ thống.
- Bố cục responsive hoạt động ổn định trên màn hình 320px, 390px và 1920px.

---

### Task 1: Bảng Xếp Hạng Học Sinh (Leaderboard & Podium) Cho Giáo Viên

**Files:**
- Modify: `src/pages/ManagerExamResultsPage.tsx`
- Modify: `src/pages/ManagerExams.css`
- Test: `tests/manager.spec.ts`

**Interfaces:**
- Consumes: `managerExamsApi.results(examId, query)` trả về `{ exam, data: AttemptItem[], summary, meta }`
- Produces: UI chuyển đổi giữa 2 tab: Tab 1 "Danh sách kết quả" (Default table) và Tab 2 "Bảng xếp hạng" (Leaderboard)

- [ ] **Step 1: Viết test kiểm tra chuyển đổi Tab Bảng xếp hạng & Podium trong `tests/manager.spec.ts`**
  Kiểm tra trang kết quả giáo viên hiển thị 2 tab, khi click sang Tab "Bảng xếp hạng" thì hiển thị Podium Top 3 và bảng xếp hạng học sinh theo điểm số cao nhất.

- [ ] **Step 2: Chạy test để xác nhận test thất bại**
  Run: `npx playwright test tests/manager.spec.ts -g "leaderboard"`
  Expected: FAIL (chưa có tab và podium).

- [ ] **Step 3: Triển khai Tab Bảng xếp hạng & Top 3 Podium trong `ManagerExamResultsPage.tsx` và `ManagerExams.css`**
  - Thêm state `activeView: 'list' | 'leaderboard'`.
  - Tab "Danh sách kết quả" giữ nguyên 100% cấu trúc bảng và phân trang hiện có.
  - Tab "Bảng xếp hạng":
    - Lọc các bài làm có trạng thái `SUBMITTED`, sắp xếp theo `score` giảm dần.
    - Render Podium Top 3: Bục Hạng 1 (vàng `#ffcc00`), Hạng 2 (bạc), Hạng 3 (đồng).
    - Render Bảng xếp hạng thứ tự `#1`, `#2`, `#3`... kèm tên học sinh, email, điểm số và thời gian nộp.
    - Nút bấm chữ thuần, không dùng icon.

- [ ] **Step 4: Chạy lại test để xác nhận PASS**
  Run: `npx playwright test tests/manager.spec.ts`
  Expected: 100% PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/pages/ManagerExamResultsPage.tsx src/pages/ManagerExams.css tests/manager.spec.ts
  git commit -m "feat: add exam leaderboard and podium view for teachers"
  ```

---

### Task 2: Nâng Cấp Đối Chiếu Đáp Án & Thẻ Điểm Trang Kết Quả Sinh Viên

**Files:**
- Modify: `src/pages/AttemptResultPage.tsx`
- Modify: `src/Exams.css`
- Test: `tests/attempts.spec.ts`

**Interfaces:**
- Consumes: `attemptsApi.result(attemptId)` trả về `{ attempt, summary, questions: ResultQuestion[] }`
- Produces: UI đối chiếu chi tiết: Lựa chọn của bạn vs Đáp án đúng, thẻ điểm tổng kết Bauhaus nổi bật, nút bấm chữ thuần.

- [ ] **Step 1: Viết test kiểm tra đối chiếu đáp án chi tiết và nút bấm chữ thuần trong `tests/attempts.spec.ts`**

- [ ] **Step 2: Chạy test để xác minh**
  Run: `npx playwright test tests/attempts.spec.ts -g "result"`

- [ ] **Step 3: Cập nhật giao diện `AttemptResultPage.tsx` và `Exams.css`**
  - Cải thiện thẻ điểm số Hero Score Card với nhãn xếp loại lớn.
  - Hiển thị rõ nhãn "Bạn chọn" và "Đáp án đúng" với độ tương phản màu chuẩn (xanh lá cho câu đúng, đỏ/vàng cho câu sai).
  - Đảm bảo tất cả nút hành động (`LÀM LẠI ĐỀ NÀY`, `CHỌN ĐỀ KHÁC`, `THỬ LẠI`) đều là chữ thuần không icon.

- [ ] **Step 4: Chạy test để xác nhận PASS**
  Run: `npx playwright test tests/attempts.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/pages/AttemptResultPage.tsx src/Exams.css tests/attempts.spec.ts
  git commit -m "feat: enhance exam answer review and score card for students"
  ```

---

### Task 3: Tối Ưu Hóa Trải Nghiệm Phòng Thi (Take Exam Workspace)

**Files:**
- Modify: `src/pages/TakeExamPage.tsx`
- Modify: `src/Exams.css`
- Test: `tests/attempts.spec.ts`

**Interfaces:**
- Consumes: `useExamAttempt(userId, examId)`
- Produces: Question Matrix Palette trực quan, hộp thoại xác nhận nộp bài chi tiết (đã làm / chưa làm), đồng hồ đếm ngược báo giờ khẩn cấp (< 5 phút).

- [ ] **Step 1: Viết test xác minh Question Palette và hộp thoại nộp bài trong `tests/attempts.spec.ts`**

- [ ] **Step 2: Chạy test để xác minh**
  Run: `npx playwright test tests/attempts.spec.ts -g "quiz"`

- [ ] **Step 3: Cập nhật `TakeExamPage.tsx` và `Exams.css`**
  - Bổ sung đếm số câu chưa làm vào hộp thoại nộp bài: `"Bạn đã làm X/Y câu. Còn Z câu chưa trả lời. Sau khi nộp, bạn không thể thay đổi đáp án."`
  - Đảm bảo toàn bộ nút điều khiển trong phòng thi (`ĐÁNH DẤU XEM LẠI`, `CÂU TRƯỚC`, `CÂU TIẾP THEO`, `NỘP BÀI`, `HỦY BÀI`) là chữ thuần.

- [ ] **Step 4: Chạy test kiểm tra toàn bộ luồng làm bài**
  Run: `npx playwright test tests/attempts.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/pages/TakeExamPage.tsx src/Exams.css tests/attempts.spec.ts
  git commit -m "feat: refine exam workspace question palette and submit modal"
  ```

---

### Task 4: Kiểm Thử Hồi Quy Toàn Bộ Hệ Thống (End-to-End Regression)

**Files:**
- Check: All files in `src/` and `tests/`

- [ ] **Step 1: Chạy build production**
  Run: `npm run build`
  Expected: Exit code 0, không có lỗi TypeScript hay Vite bundler.

- [ ] **Step 2: Chạy toàn bộ Playwright test suites**
  Run: `npx playwright test`
  Expected: 100% test pass.

- [ ] **Step 3: Cập nhật tài liệu và hoàn tất**
  ```bash
  git status
  ```
