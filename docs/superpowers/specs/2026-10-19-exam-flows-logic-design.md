# Đặc Tả Kỹ Thuật & Thiết Kế Luồng Nghiệp Vụ Frontend (Online Exam System)

**Tài liệu:** `docs/superpowers/specs/2026-10-19-exam-flows-logic-design.md`  
**Ngày lập:** 19/10/2026  
**Dự án:** `online-exam-front` (kết nối `online-exam-api`)  
**Tác giả:** Antigravity Pairing Assistant  

---

## 1. Bối cảnh & Mục tiêu (Intent and Why)

Hệ thống thi trắc nghiệm trực tuyến đã có sẵn backend NestJS (`online-exam-api`) với đầy đủ các nghiệp vụ quản lý đề thi, câu hỏi trắc nghiệm, tạo lượt thi (`attempts`), lưu đáp án theo thời gian thực (`saveAnswer`), chấm điểm tự động và tổng hợp thống kê kết quả bài làm.

Mục tiêu của đợt hoàn thiện này là **nâng cấp trải nghiệm người dùng (UX) và tối ưu hóa logic frontend** cho 2 đối tượng cốt lõi:
1. **Sinh viên (Student)**: Trải nghiệm làm bài thi mượt mà, trực quan, lưu trạng thái liên tục; đối chiếu đáp án và xem giải thích chi tiết sau khi nộp; quản lý lịch sử làm bài rõ ràng.
2. **Giáo viên / Quản lý đề (Exam Manager)**: Soạn thảo đề thi và câu hỏi dễ dàng; xem thống kê phổ điểm và **Bảng xếp hạng (Leaderboard)** trực quan vinh danh Top học sinh đạt điểm cao nhất từ API kết quả đề thi.

---

## 2. Mục tiêu cụ thể, Phi mục tiêu & Ranh giới (Goals, Non-goals & Anti-goals)

### Mục tiêu (Goals)
- **G1 (Sinh viên - Phòng thi)**:
  - Đồng hồ đếm ngược với cảnh báo trực quan khi còn dưới 5 phút.
  - Bảng điều hướng câu hỏi (Question Matrix Palette) hiển thị trực quan: Đã chọn, Chưa chọn, Đánh dấu cờ (Flag for review).
  - Trạng thái đồng bộ tự động từng câu (`saving`, `saved`, `offline retry`).
  - Hộp thoại xác nhận nộp bài (thống kê rõ số câu chưa làm trước khi xác nhận). Tự động nộp khi đếm ngược về 0.
- **G2 (Sinh viên - Kết quả & Xem đáp án)**:
  - Thẻ điểm số tổng kết phong cách Bauhaus (Điểm / 10, Số câu đúng, Sai, Chưa làm, Thời gian hoàn thành).
  - Khung đối chiếu từng câu hỏi: Lựa chọn của sinh viên, Đáp án chính xác, Lời giải thích từ giáo viên (nếu có).
- **G3 (Sinh viên - Lịch sử làm bài)**:
  - Danh sách bài làm phân trang, lọc theo trạng thái (`IN_PROGRESS`, `SUBMITTED`, `CANCELLED`).
  - Hành động tương ứng cho từng trạng thái: Tiếp tục làm bài (nếu còn hạn), Xem bảng điểm (nếu đã nộp), Thi lại đề này (dẫn về chi tiết đề thi).
- **G4 (Giáo viên - Soạn đề & Quản lý câu hỏi)**:
  - Form tạo đề trực quan, hỗ trợ thiết lập tiêu đề, mô tả, hướng dẫn thi, thời lượng (phút).
  - Trình soạn câu hỏi: nội dung, tối thiểu 2 đáp án, tích chọn 1 đáp án đúng duy nhất, có thể nhập lời giải thích.
  - Cảnh báo tính hợp lệ trước khi mở đề (`Publish`): cần ít nhất 1 câu hỏi hoàn chỉnh.
- **G5 (Giáo viên - Bảng xếp hạng & Thống kê kết quả)**:
  - Tích hợp vào trang `/manage/exams/:examId/results`:
  - Thẻ thống kê tổng quan: Tổng lượt thi, Tỷ lệ nộp bài, Điểm trung bình, Điểm cao nhất, Điểm thấp nhất.
  - Bục vinh danh Top 3 (Podium: Hạng 1 Vàng, Hạng 2 Bạc, Hạng 3 Đồng) cho các sinh viên có điểm số cao nhất và nộp sớm nhất.
  - Bảng danh sách xếp hạng có thể sắp xếp theo Điểm số hoặc Thời gian nộp bài, tìm kiếm theo tên học sinh.

### Phi mục tiêu (Non-goals)
- Không thay đổi backend API contracts (chỉ sử dụng đúng các endpoint và DTO mà `online-exam-api` cung cấp).
- Không làm thay đổi giao diện các trang khác ngoài phạm vi (như Admin Users hay Profile cá nhân).

### Điều cấm (Anti-goals)
- Không làm vỡ bất kỳ bài kiểm tra Playwright tự động nào trong bộ test suite hiện có (108 tests).
- Không tự ý sinh modal popup che khuất màn hình mà không hỗ trợ phím Escape / điều hướng bàn phím.
- Không làm mất bài làm khi rớt mạng cục bộ (duy trì offline draft và auto-retry).

---

## 3. Kiến trúc Luồng Dữ Liệu & Hợp Đồng API (Data Flow & API Contracts)

### Sinh viên (Student Flow)
1. `POST /exams/:examId/attempts` -> Khởi tạo hoặc tiếp tục bài thi đang chạy.
2. `PUT /attempts/:attemptId/answers/:questionId` -> Lưu lựa chọn `{ selectedOptionIndex }`.
3. `POST /attempts/:attemptId/submit` -> Nộp bài và nhận kết quả chấm điểm tức thì.
4. `GET /attempts/:attemptId/result` -> Tải chi tiết bài thi đã nộp cùng đáp án đã chọn và đáp án đúng.
5. `GET /attempts?page=1&limit=10&status=...` -> Lấy lịch sử các lượt thi.

### Giáo viên (Manager Flow)
1. `POST /exams` -> Tạo bản nháp đề thi `{ title, description, instructions, durationMinutes }`.
2. `POST /exams/:examId/questions` -> Thêm câu hỏi theo DTO chuẩn backend: `{ content: string, position: number, options: string[], correctOptionIndex: number }`.
3. `PUT /exams/:examId/publish` -> Khóa nội dung đề và mở cho sinh viên thi.
4. `PUT /exams/:examId/close` -> Đóng đề thi.
5. `GET /exams/:id/results?page=1&limit=10` -> Lấy danh sách kết quả học sinh (phân trang, lọc `status`) và thống kê tổng hợp `summary` (`averageScore`, `highestScore`, `lowestScore`).

---

## 4. Đặc tả Giao diện & Trải nghiệm Người dùng (UI/UX Specification)

### 4.1. Phòng Thi (`TakeExamPage`)
- **Layout**: 2 cột trên Desktop (hoặc cột đơn trên Mobile):
  - Cột chính (70%): Nội dung câu hỏi hiện tại, danh sách lựa chọn lớn dễ bấm, nút "Đánh dấu xem lại" (Flag), nút "Câu trước" / "Câu tiếp theo".
  - Cột phụ (30%): Đồng hồ đếm ngược Bauhaus dính cố định (sticky); Question Grid (các ô vuông 1, 2, 3... tương ứng câu hỏi, đổi màu khi đã làm / đánh dấu); Nút "Nộp bài thi".
- **Hộp thoại nộp bài**: Tóm tắt "Bạn đã hoàn thành X/Y câu. Còn Z câu chưa trả lời. Bạn có chắc chắn muốn nộp bài?".

### 4.2. Trang Kết quả & Đối chiếu Đáp án (`AttemptResultPage`)
- **Hero Score Card**: Điểm số lớn (ví dụ: `9.5 / 10`), nhãn xếp loại (Xuất sắc / Đạt / Chưa đạt), thời gian làm bài.
- **Answer Review Accordion / Cards**: Liệt kê từng câu hỏi:
  - Nếu đúng: Viền xanh lá, icon check.
  - Nếu sai: Viền đỏ/đen, chỉ rõ lựa chọn của học sinh và đáp án chính xác của đề thi.

### 4.3. Bảng Xếp Hạng & Kết quả Đề thi (`ManagerExamResultsPage`)
- **Header**: Tên đề thi, mã đề thi, nút làm mới.
- **Thanh chuyển đổi chế độ xem (View Toggle Tabs)**:
  - **Tab 1: "Danh sách kết quả" (Mặc định)**: Bảng kết quả tiêu chuẩn, phân trang và lọc theo trạng thái (giữ trọn vẹn 100% cấu trúc để tương thích với tất cả test suite hiện tại).
  - **Tab 2: "Bảng xếp hạng (Leaderboard)"**:
    - **Top 3 Podium**: Khối 3 cột trực quan (Top 1 ở giữa cao nhất, Top 2 bên trái, Top 3 bên phải) với avatar và điểm số.
    - **Bảng dữ liệu xếp hạng**: Thứ hạng (`#1`, `#2`, `#3`...), Học sinh (Họ tên + Email), Điểm số (`x.x / 10`), Số câu đúng (`a / b`), Thời điểm nộp. Sắp xếp tự động theo điểm cao nhất trước.

---

## 5. Những Quyết Định Kỹ Thuật Dành Cho Lập Trình Viên (Decisions Left to Builder)

1. **Kiến trúc Tab trên trang kết quả**:
   - Tách riêng biệt giữa Tab "Danh sách kết quả" (phân trang chuẩn 10 bài/trang) và Tab "Bảng xếp hạng" để vừa mang lại trải nghiệm xếp hạng học sinh trực quan, vừa đảm bảo 100% độ tương thích với Playwright test assertions (`tests/manager.spec.ts`).
2. **Client-side Leaderboard Ranking**:
   - Khi ở Tab "Bảng xếp hạng", client lọc các bài đã nộp (`SUBMITTED`) và sắp xếp theo `score` giảm dần, hiển thị huy chương Top 1, Top 2, Top 3.
3. **Persistence của Review Flags**:
   - Lưu trữ các câu đánh dấu xem lại trong `sessionStorage` gắn với `attemptId`, giữ nguyên khi tải lại trang và tự hủy khi nộp bài.
4. **Bảo toàn Test Suite**:
   - Giữ nguyên các class semantic và text tiếng Việt mà các file `tests/attempts.spec.ts`, `tests/dashboard.spec.ts`, `tests/manager.spec.ts` đang assert.
