# Task 7 Report: Kiểm Thử Toàn Diện E2E & Nghiệm Thu Hệ Thống

## 1. Tổng Quan Công Việc Đã Thực Hiện
Đã triển khai và thực thi thành công bộ kiểm thử tích hợp đầu-cuối (End-to-End Integration Tests) trên MongoDB thật và backend API thật, hoàn tất nghiệm thu 100% các yêu cầu kỹ thuật và luồng nghiệp vụ của tính năng **Quản lý Lớp học (Classrooms Management)**.

Bộ kiểm thử thực hiện kịch bản 8 bước toàn diện với 2 ngữ cảnh người dùng thực tế (`EXAM_MANAGER` và `STUDENT`) chạy độc lập, kiểm chứng trọn vẹn luồng tương tác giữa giáo viên và học sinh từ khởi tạo lớp, phân phối đề thi, cô lập phạm vi, làm bài thi, xem kết quả đến bảo vệ toàn vẹn dữ liệu.

Tất cả các tiêu chí nghiệm thu đã hoàn tất xuất sắc:
- **`npm run test:e2e:classrooms-real`**: 1/1 test passed (100%).
- **`node tests/fixtures/run-manager-real.cjs`**: 1/1 test passed (100% không ảnh hưởng các luồng manager hiện hữu).
- **`npx playwright test tests/profile.spec.ts`**: 16/16 tests passed (100% toàn vẹn trang cá nhân).
- **Backend test suite (`d:\online-exam-api`)**: 7/7 suites passed, 89/89 tests passed (100%).
- **Git Commit**: `test(e2e): add comprehensive multi-role classrooms integration test` (`70fb506`).

---

## 2. Chi Tiết Các File Đã Xây Dựng & Cập Nhật

### 2.1. Fixture Quản Lý Vòng Đời Test: `tests/fixtures/classrooms-real-api.cjs`
- **Tạo tài khoản thử nghiệm độc lập (`create`)**:
  - Tạo 2 tài khoản tạm thời có tiền tố định danh duy nhất (`front-classrooms-manager-<uuid>@example.com` và `front-classrooms-student-<uuid>@example.com`) với vai trò tương ứng `EXAM_MANAGER` và `STUDENT`.
  - Ghi nhận thông tin manifest vào file tạm thời được bảo vệ quyền truy cập trước khi ghi dữ liệu vào database.
  - Sử dụng Prisma transaction trên MongoDB thật để mã hóa mật khẩu bằng `bcrypt` và khởi tạo tài khoản.
- **Dọn dẹp sạch sẽ tài nguyên sau khi kiểm thử (`cleanup`)**:
  - Kiểm tra tính xác thực của manifest và danh tính tài khoản trước khi thực hiện dọn dẹp.
  - Xóa theo thứ tự quan hệ khóa ngoại (foreign references) chặt chẽ trong transaction:
    1. `AttemptAnswer` thuộc các attempt và question của fixture.
    2. `Attempt` của học sinh trong đề thi lớp học.
    3. `Option` của các câu hỏi trong đề thi lớp học.
    4. `Question` của đề thi lớp học.
    5. `Exam` gắn với lớp học hoặc do manager tạo.
    6. `ClassroomMember` ghi nhận học sinh tham gia lớp.
    7. `Classroom` do manager tạo.
    8. `User` (cả 2 tài khoản manager và student).
  - Tự động xóa file manifest tạm sau khi hoàn tất.

### 2.2. Script Thực Thi E2E: `tests/fixtures/run-classrooms-real.cjs`
- Thiết lập biến môi trường `CLASSROOMS_API_E2E=1` và `FRONT_CLASSROOMS_FIXTURE`.
- Đảm bảo cơ chế try/finally luôn dọn dẹp triệt để dữ liệu ngay cả khi quá trình kiểm thử gặp sự cố.
- Chạy Playwright test suite `tests/classrooms-real.spec.ts` với `--workers=1` để đảm bảo thứ tự thực thi tuần tự, không bị xung đột tài nguyên.

### 2.3. Kịch Bản Kiểm Thử E2E 8 Bước: `tests/classrooms-real.spec.ts`
Script thực thi liên tục 8 bước kịch bản theo yêu cầu nghiệp vụ:
1. **Giáo viên tạo Lớp học**:
   - Giáo viên đăng nhập qua `/login`, chuyển tới `/manage/classes`.
   - Mở modal "Tạo lớp học mới", điền Tên lớp: "Lớp Chuyên Toán 12", Mô tả: "Lớp ôn thi đại học môn Toán", Mật khẩu: "ToanMatKhau1@".
   - Bấm nút text-only "Tạo lớp học". Modal đóng, thẻ lớp xuất hiện và trích xuất thành công Mã lớp gồm 6 ký tự viết hoa (regex `^[A-Z0-9]{6}$`).
2. **Học sinh tham gia lớp với mật khẩu sai $\rightarrow$ Báo lỗi**:
   - Khởi tạo ngữ cảnh trình duyệt học sinh riêng biệt (`browser.newContext()`), học sinh đăng nhập qua `/login` và vào `/classes`.
   - Mở modal "Tham gia lớp học", nhập đúng Mã lớp nhưng nhập sai mật khẩu: "SaiMatKhau123".
   - Bấm "Tham gia", hệ thống hiển thị thông báo lỗi `role="alert"`: "Mật khẩu lớp học không chính xác". Modal vẫn mở để học sinh sửa lại.
3. **Học sinh tham gia lớp với mật khẩu đúng $\rightarrow$ Thành công**:
   - Học sinh nhập đúng mật khẩu "ToanMatKhau1@", bấm "Tham gia".
   - Modal tự động đóng, thẻ "Lớp Chuyên Toán 12" hiển thị đầy đủ trong danh sách lớp của học sinh kèm mã lớp chính xác.
4. **Giáo viên tạo đề thi trong lớp**:
   - Giáo viên truy cập `/manage/classes/:classId`, bấm "Tạo đề thi cho lớp" (chuyển hướng sang `/manage/exams/create?classroomId=...`).
   - Xác nhận có badge "Đề thi được tạo cho lớp học này." thông báo đề thi thuộc phạm vi lớp học.
   - Nhập thông tin đề thi: "Kiểm tra đại số chương 1", thời gian 15 phút, câu hỏi trắc nghiệm 4 lựa chọn, tích chọn đáp án đúng.
   - Tạo đề thi nháp thành công (xác nhận trạng thái "Bản nháp"), sau đó bấm "Mở đề thi" và xác nhận xuất bản đề thi.
5. **Cô lập phạm vi hiển thị (Strict Scope Isolation)**:
   - Học sinh vào danh mục đề thi công khai `/exams`: Đề thi "Kiểm tra đại số chương 1" **HOÀN TOÀN KHÔNG** hiển thị.
   - Giáo viên vào trang quản lý đề thi chung `/manage/exams`: Đề thi "Kiểm tra đại số chương 1" **HOÀN TOÀN KHÔNG** hiển thị.
6. **Học sinh làm bài thi trong lớp**:
   - Học sinh vào chi tiết lớp `/classes/:classId`, tab "Đề thi của lớp" hiển thị đề thi "Kiểm tra đại số chương 1".
   - Bấm "Vào làm bài", chọn đáp án đúng (A. x = 3), hệ thống tự động lưu đáp án ("Đã lưu tất cả đáp án").
   - Nộp bài thi và xác nhận nộp bài. Trang kết quả `/attempts/:attemptId/result` hiển thị điểm tuyệt đối **10 / 10**.
7. **Giáo viên kiểm tra thành viên và kết quả**:
   - Giáo viên vào `/manage/classes/:classId`, tab "Danh sách thành viên": Xác nhận học sinh có mặt trong danh sách học viên của lớp.
   - Giáo viên vào xem kết quả tại `/manage/exams/:examId/results`: Xác nhận bài nộp của học sinh được ghi nhận với điểm 10 và trạng thái "Đã nộp".
8. **Chặn xóa lớp khi đang có đề thi / bài làm**:
   - Giáo viên vào `/manage/classes`, bấm "Xóa lớp" cho "Lớp Chuyên Toán 12" và bấm "Xác nhận xóa".
   - Hệ thống chặn xóa với lỗi `ConflictException` (409) và hiển thị thông báo lỗi "Không thể xóa lớp học...".
   - Bấm "Hủy", lớp học vẫn tồn tại an toàn trong danh sách.

### 2.4. Cập Nhật `src/api/classrooms.ts` & `package.json`
- **`src/api/classrooms.ts`**: Bổ sung hỗ trợ thông điệp tiếng Việt từ backend trong hàm `getClassroomErrorMessage` (bao gồm mapping trực tiếp cho `'Mật khẩu lớp không chính xác'`, `'Không thể xóa lớp học...'` và tự động nhận diện chuỗi tiếng Việt có dấu).
- **`package.json`**: Thêm npm script `"test:e2e:classrooms-real": "node tests/fixtures/run-classrooms-real.cjs"`.

---

## 3. Bảng Tổng Hợp Kết Quả Xác Minh (Verification)

| Lệnh Kiểm Thử | Mục Đích | Kết Quả |
|---------------|----------|---------|
| `npm run test:e2e:classrooms-real` | Kiểm thử tích hợp E2E 8 bước Classrooms | **PASS** (1/1 test, 100%) |
| `node tests/fixtures/run-manager-real.cjs` | Kiểm thử E2E quản lý đề thi hiện hữu | **PASS** (1/1 test, 100%) |
| `npx playwright test tests/profile.spec.ts` | Toàn vẹn tính năng Profile & Accessibility | **PASS** (16/16 tests, 100%) |
| `npm test` (trong `online-exam-api`) | Kiểm thử đơn vị & tích hợp Backend API | **PASS** (7/7 suites, 89/89 tests) |

---

## 4. Trạng Thái Hoàn Thành
- **Task**: 7
- **Status**: completed
- **Commit**: `70fb506`
- **Verification**: all E2E test suites passed (100%)
