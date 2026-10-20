# Task 6 Brief: Frontend Màn Hình Học Sinh (Lớp Của Tôi, Tham Gia & Làm Bài)

## Context & Objectives
Triển khai giao diện Lớp học dành cho Học sinh (`STUDENT`), cho phép:
1. Xem danh sách các lớp học mà học sinh đã tham gia tại `/classes`.
2. Tham gia lớp học mới bằng Mã lớp (Classroom Code) và Mật khẩu lớp (Classroom Password).
3. Xem chi tiết lớp học tại `/classes/:classId`:
   - Header hiển thị Tên lớp, Mô tả, Thông tin giáo viên phụ trách, Thống kê số bạn cùng lớp & số đề thi.
   - Tab 1: "Đề thi của lớp" - Hiển thị danh sách đề thi thuộc lớp. Học sinh có thể bấm xem chi tiết hoặc vào làm bài như đề thi thông thường (`/exams/:id` hoặc `/exams/:id/take`).
   - Tab 2: "Danh sách thành viên" - Hiển thị danh sách tất cả bạn học trong lớp cùng giáo viên.
4. Tích hợp thanh điều hướng: Thêm mục "Lớp học" (`/classes`) trên header thanh điều hướng chính (`AppLayout.tsx`) cho học sinh.
5. Tích hợp trang Profile: Cập nhật nhẹ tab `#profile-panel-classes` trong `ProfilePage.tsx` có liên kết dẫn tới `/classes` mà TUYỆT ĐỐI không gọi API lạ làm hỏng test suite `tests/profile.spec.ts`.

---

## Styling & Design Constraints
1. **Neo-Brutalist Bauhaus**:
   - Nền sáng `#fbfbf9`, điểm nhấn vàng `#ffcc00`, viền đen `2px solid #1a1a1a`, đổ bóng cứng `3px 3px 0 #1a1a1a`.
   - Typography Space Grotesk / Inter, bố cục thẻ card rõ ràng, responsive di động (320px - 390px) và desktop.
2. **STRICT TEXT-ONLY BUTTONS**:
   - **Tuyệt đối KHÔNG có bất kỳ thẻ `<svg>` hoặc Lucide icon nào bên trong bất kỳ thẻ `<button>` nào.**
   - Mọi nút bấm đều phải dùng văn bản thuần (ví dụ: `<button type="button">Tham gia lớp học</button>`, `<button type="button">Hủy</button>`, `<button type="submit">Tham gia</button>`, `<button type="button">Thử lại</button>`).
   - Icon chỉ được sử dụng ngoài button (trong NavLink, thẻ badge, tiêu đề, stat cards).
3. **Bảo toàn Test Suite Hiện Hữu**:
   - `ProfilePage.tsx` KHÔNG được gọi thêm API khi tải trang vì `tests/profile.spec.ts` kiểm tra nghiêm ngặt `api.calls.every(...)`. Giữ nguyên cấu trúc `<h3>Chưa có lớp học để hiển thị</h3>` và thêm `<Link to="/classes">Xem lớp học của tôi</Link>`.

---

## Danh Sách File Cần Tạo / Sửa Đổi
1. **Create: `d:\online-exam-front\src\pages\StudentClassesPage.tsx` & `StudentClassesPage.css`**
   - Gọi `classroomsApi.getJoined()` để tải danh sách các lớp học sinh đã tham gia.
   - Hiển thị danh sách thẻ lớp:
     - Tên lớp, Mô tả lớp.
     - Giáo viên phụ trách (Họ tên, email).
     - Badge mã lớp (e.g. `ABC123`).
     - Thống kê: Số bạn cùng lớp (`memberCount`), số đề thi (`examCount`).
     - Liên kết / Nút "Xem lớp học" dẫn đến `/classes/${classroom.id}`.
   - Nút "Tham gia lớp học" mở Modal nhập:
     - Input "Mã lớp" (tự động uppercase, ví dụ `AB12CD`).
     - Input "Mật khẩu lớp".
     - Text-only buttons: "Hủy", "Tham gia".
     - Bắt lỗi qua `getClassroomErrorMessage(err)` (sai mật khẩu, mã không tồn tại, đã tham gia rồi, v.v.).
     - Thành công: đóng modal, tải lại danh sách lớp.
   - Trạng thái rỗng: Nếu chưa tham gia lớp nào, hiển thị thông báo thân thiện và nút "Tham gia lớp học ngay".
2. **Create: `d:\online-exam-front\src\pages\StudentClassDetailPage.tsx` & `StudentClassDetailPage.css`**
   - Lấy `classId` từ URL `useParams()`.
   - Tải song song thông tin: `classroomsApi.getDetail(classId)`, `classroomsApi.getExams(classId)`, `classroomsApi.getMembers(classId)`.
   - Header:
     - Nút / Link "Quay lại danh sách lớp" dẫn về `/classes`.
     - Tên lớp, Mô tả.
     - Giáo viên phụ trách (Họ tên, email, avatar).
     - Thông số: số học sinh, số đề thi.
   - 2 Tabs chuyển đổi (`exams` / `members`):
     - **Tab `exams` ("Đề thi của lớp" - có badge số lượng)**:
       - Danh sách đề thi thuộc lớp: Tiêu đề, Mô tả, Thời lượng (`durationMinutes` phút), Số câu hỏi (`totalQuestions`), Trạng thái (`Đang mở`, `Đã đóng`, v.v.).
       - Nút / Link "Vào làm bài" dẫn đến `/exams/${exam.id}` (hoặc `/exams/${exam.id}/take`).
       - Trạng thái rỗng: "Lớp học hiện chưa có đề thi nào."
     - **Tab `members` ("Danh sách thành viên" - có badge số lượng)**:
       - Danh sách bạn học trong lớp: Avatar/ký tự đầu, Họ tên, Email, Ngày tham gia (`joinedAt`).
       - Nhãn phân biệt rõ: Giáo viên (chủ sở hữu lớp) và Học viên.
       - Trạng thái rỗng: "Chưa có thành viên nào khác."
3. **Modify: `d:\online-exam-front\src\pages\ProfilePage.tsx`**
   - Trong section `#profile-panel-classes`: Thêm liên kết `<Link to="/classes" className="profile-classes-link">Đi tới Lớp học của tôi</Link>`.
   - Giữ nguyên heading `<h3>Chưa có lớp học để hiển thị</h3>` để test `tests/profile.spec.ts` không bị gãy.
4. **Modify: `d:\online-exam-front\src\router\AppRouter.tsx`**
   - Thêm 2 routes cho học sinh trong `<Route element={<ProtectedRoute />}>` (hoặc dưới Student layout phù hợp):
     - `<Route path="classes" element={<StudentClassesPage />} />`
     - `<Route path="classes/:classId" element={<StudentClassDetailPage />} />`
5. **Modify: `d:\online-exam-front\src\layouts\AppLayout.tsx`**
   - Trong thanh navigation, khi user là `STUDENT`:
     - Thêm `<NavLink to="/classes"><GraduationCap size={18} aria-hidden="true" /> Lớp học</NavLink>`.

---

## Verification
- Chạy `npm run build` trong `d:\online-exam-front`: Phải biên dịch 100% không lỗi type.
- Chạy `npx playwright test tests/profile.spec.ts`: Xác nhận cả 16 test profile vẫn pass hoàn toàn.
- Kiểm tra toàn bộ code mới: Tuyệt đối KHÔNG có thẻ `<svg>` hay Lucide icon nào bên trong bất kỳ thẻ `<button>` nào.
