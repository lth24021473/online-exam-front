# Task 7 Brief: Kiểm Thử Toàn Diện E2E & Nghiệm Thu Hệ Thống

## Context & Objectives
Xây dựng và thực thi kịch bản kiểm thử E2E tích hợp tự động trên MongoDB thật và API backend thật nhằm nghiệm thu 100% các yêu cầu của tính năng Quản lý Lớp học (Classrooms Management).

---

## Kịch Bản Kiểm Thử E2E Chi Tiết (`tests/classrooms-real.spec.ts`)
1. **Giáo viên tạo Lớp học**:
   - Giáo viên đăng nhập qua `/login`.
   - Vào `/manage/classes`, mở modal tạo lớp:
     - Tên lớp: "Lớp Chuyên Toán 12"
     - Mô tả: "Lớp ôn thi đại học môn Toán"
     - Mật khẩu: "ToanMatKhau1@"
   - Bấm "Tạo lớp học" (Text-only button).
   - Thẻ lớp xuất hiện; trích xuất Mã lớp ngẫu nhiên (6 ký tự, e.g. `ABC123`) từ giao diện.
2. **Học sinh tham gia lớp với mật khẩu sai $\rightarrow$ Báo lỗi**:
   - Học sinh đăng nhập qua `/login` trên ngữ cảnh browser của học sinh.
   - Vào `/classes`, mở modal "Tham gia lớp học":
     - Nhập Mã lớp vừa lấy.
     - Nhập mật khẩu sai: "SaiMatKhau123".
     - Bấm "Tham gia".
     - Kiểm tra thông báo lỗi xuất hiện (Mật khẩu lớp học không chính xác).
3. **Học sinh tham gia lớp với mật khẩu đúng $\rightarrow$ Thành công**:
   - Học sinh nhập đúng mật khẩu: "ToanMatKhau1@".
   - Bấm "Tham gia".
   - Modal đóng lại, thẻ "Lớp Chuyên Toán 12" xuất hiện trong danh sách lớp của học sinh.
4. **Giáo viên tạo đề thi trong lớp**:
   - Giáo viên vào chi tiết lớp `/manage/classes/:classId`.
   - Bấm "Tạo đề thi cho lớp" (chuyển sang `/manage/exams/create?classroomId=...`).
   - Xác nhận có badge báo đề thi thuộc lớp học này.
   - Điền thông tin đề: "Kiểm tra đại số chương 1", thời gian 15 phút, câu hỏi trắc nghiệm 4 lựa chọn, đáp án đúng.
   - Xác nhận tạo đề thi nháp, sau đó xuất bản đề thi ("Mở đề thi").
5. **Cô lập phạm vi hiển thị (Strict Scope Isolation)**:
   - Học sinh vào trang `/exams` công khai: Xác nhận đề "Kiểm tra đại số chương 1" **KHÔNG** hiển thị.
   - Giáo viên vào trang `/manage/exams` chung: Xác nhận đề "Kiểm tra đại số chương 1" **KHÔNG** hiển thị.
6. **Học sinh làm bài thi trong lớp**:
   - Học sinh vào chi tiết lớp `/classes/:classId`, tab "Đề thi của lớp".
   - Xác nhận đề thi "Kiểm tra đại số chương 1" hiển thị đầy đủ.
   - Bấm "Vào làm bài", chọn đáp án đúng, nộp bài.
   - Trang kết quả hiển thị điểm số.
7. **Giáo viên kiểm tra thành viên và kết quả**:
   - Giáo viên vào `/manage/classes/:classId`, tab "Danh sách thành viên".
   - Xác nhận học sinh có trong danh sách thành viên.
   - Giáo viên vào xem kết quả đề thi `/manage/exams/:examId/results`: Xác nhận bài làm của học sinh được ghi nhận.
8. **Chặn xóa lớp khi đang có đề thi / bài làm**:
   - Giáo viên vào `/manage/classes`.
   - Bấm "Xóa lớp" cho "Lớp Chuyên Toán 12" và bấm "Xác nhận xóa".
   - Xác nhận xuất hiện thông báo lỗi chặn xóa từ hệ thống ("Không thể xóa lớp học...").
   - Lớp học vẫn tồn tại an toàn trong danh sách.

---

## Danh Sách File Cần Tạo / Cập Nhật
1. `d:\online-exam-front\tests\fixtures\classrooms-real-api.cjs`:
   - Tạo 2 tài khoản test sạch trong MongoDB (`EXAM_MANAGER` và `STUDENT`).
   - Cleanup: Dọn sạch attempts, answers, questions, options, exams, classroomMembers, classrooms, và users của fixture.
2. `d:\online-exam-front\tests\fixtures\run-classrooms-real.cjs`:
   - Runner script thiết lập biến môi trường và chạy playwright test.
3. `d:\online-exam-front\tests\classrooms-real.spec.ts`:
   - Script Playwright thực hiện đầy đủ 8 bước kịch bản nêu trên.
4. `d:\online-exam-front\package.json`:
   - Thêm script npm `"test:e2e:classrooms-real": "node tests/fixtures/run-classrooms-real.cjs"`.

---

## Verification
- Chạy: `npm run test:e2e:classrooms-real` (pass 1/1 test).
- Chạy: `node tests/fixtures/run-manager-real.cjs` (pass 1/1 test).
- Chạy: `npx playwright test tests/profile.spec.ts` (pass 16/16 tests).
- Chạy backend test: `npm test` trong `d:\online-exam-api` (pass 100%).
- Commit: `test(e2e): add comprehensive multi-role classrooms integration test`.
