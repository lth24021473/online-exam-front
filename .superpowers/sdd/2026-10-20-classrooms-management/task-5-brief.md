# Task 5 Brief: Frontend Màn Hình Giáo Viên (Quản Lý Lớp & Chi Tiết Lớp)

## Context & Objectives
Triển khai giao diện quản lý lớp học dành cho Giáo viên (`EXAM_MANAGER` và `ADMIN`), cho phép:
1. Xem danh sách các lớp do mình quản lý tại `/manage/classes`.
2. Tạo lớp học mới: Nhập Tên lớp, Mô tả, Mật khẩu lớp. Hệ thống tự sinh mã lớp ngẫu nhiên (LƯU Ý: KHÔNG hiển thị câu "* Mã lớp sẽ do hệ thống tự sinh ngẫu nhiên duy nhất (ví dụ: MATH-892).").
3. Sao chép thông tin lớp (Mã lớp & Mật khẩu) để giáo viên gửi cho sinh viên.
4. Xem chi tiết lớp học tại `/manage/classes/:classId`:
   - Header hiển thị Tên lớp, Mô tả, Mã lớp, Mật khẩu lớp, thống kê số học sinh & đề thi.
   - Tab 1: "Đề thi của lớp" - Danh sách đề thi thuộc lớp, nút "Tạo đề thi cho lớp" dẫn sang `/manage/exams/create?classroomId=...`.
   - Tab 2: "Danh sách thành viên" - Danh sách sinh viên đã tham gia, nút "Xóa khỏi lớp".
5. Chặn xóa lớp: Xóa lớp có hộp thoại xác nhận. Nếu lớp đang chứa đề thi hoặc bài làm, hiển thị thông báo lỗi rõ ràng từ backend (HTTP 409: "Không thể xóa lớp học đang chứa đề thi hoặc bài thi của sinh viên").
6. Tích hợp tạo đề thi từ lớp trong `ManagerCreateExamPage.tsx` / `ManagerCreateExamForm.tsx` (nhận query `classroomId` và lưu vào exam payload).
7. Điều hướng Header: Thêm mục "Lớp học" (`/manage/classes`) trên header cho `EXAM_MANAGER` và `ADMIN`.

---

## Styling & Design Constraints
1. **Neo-Brutalist Bauhaus**:
   - Màu chủ đạo: Nền sáng `#fbfbf9`, điểm nhấn vàng `#ffcc00`, viền đen `2px solid #1a1a1a`, đổ bóng cứng `3px 3px 0 #1a1a1a`.
   - Typography đậm nét, bố cục thẻ card rõ ràng, responsive di động và desktop.
2. **STRICT TEXT-ONLY BUTTONS**:
   - **Tuyệt đối KHÔNG có bất kỳ thẻ `<svg>` hoặc Lucide icon nào bên trong các thẻ `<button>`.**
   - Mọi nút bấm đều phải dùng văn bản thuần (ví dụ: `<button type="button">Tạo lớp học mới</button>`, `<button type="button">Sao chép thông tin lớp</button>`, `<button type="button">Xóa lớp</button>`, `<button type="button">Tạo đề thi cho lớp</button>`).
   - Icon chỉ được sử dụng ngoài button (trong NavLink, thẻ badge, tiêu đề, stat cards).
3. **User Rule Đặc Biệt**:
   - Tuyệt đối **XÓA / KHÔNG ĐƯA** dòng "* Mã lớp sẽ do hệ thống tự sinh ngẫu nhiên duy nhất (ví dụ: MATH-892)." vào bất kỳ đâu trên giao diện Manager.

---

## Danh Sách File Cần Tạo / Sửa Đổi
1. **Create: `d:\online-exam-front\src\pages\ManagerClassesPage.tsx` & `ManagerClassesPage.css`**
   - Gọi `classroomsApi.getManaged()` để tải danh sách lớp.
   - Hiển thị danh sách thẻ lớp học: Tên lớp, badge Mã lớp, Mật khẩu (hiển thị rõ cho giáo viên), số học sinh, số đề thi.
   - Nút "Tạo lớp học mới" mở Modal tạo lớp (Form: Tên lớp, Mô tả, Mật khẩu). Text-only buttons!
   - Nút "Sao chép thông tin lớp" (sao chép `Mã lớp: [code] | Mật khẩu: [password]`), hiển thị thông báo tạm thời "Đã sao chép!".
   - Nút "Xem chi tiết" dẫn đến `/manage/classes/${classroom.id}`.
   - Nút "Xóa lớp" mở confirm modal; bắt lỗi nếu 409 Conflict và thông báo: `getClassroomErrorMessage(err)`.
2. **Create: `d:\online-exam-front\src\pages\ManagerClassDetailPage.tsx` & `ManagerClassDetailPage.css`**
   - Lấy `classId` từ URL `useParams()`.
   - Gọi song song hoặc tuần tự: `classroomsApi.getDetail(classId)`, `classroomsApi.getExams(classId)`, `classroomsApi.getMembers(classId)`.
   - Header: Tên lớp, Mô tả, Badge mã lớp, Mật khẩu, nút "Sao chép thông tin lớp", nút "Quay lại danh sách lớp".
   - 2 Tabs chuyển đổi bằng accessible button hoặc role="tab":
     - Tab `exams` ("Đề thi của lớp" - có số lượng):
       - Nút "Tạo đề thi cho lớp" -> chuyển hướng `navigate('/manage/exams/create?classroomId=' + classId)`.
       - Danh sách đề thi: Tiêu đề, số câu, thời lượng, trạng thái (`DRAFT`, `PUBLISHED`, `CLOSED`), liên kết đến `/manage/exams/${exam.id}`.
       - Trạng thái rỗng: "Lớp học chưa có đề thi nào."
     - Tab `members` ("Danh sách thành viên" - có số lượng):
       - Danh sách học sinh: Avatar/initials, Họ tên, Email, Ngày tham gia (`joinedAt`).
       - Nút "Xóa khỏi lớp": gọi `classroomsApi.removeMember(classId, member.userId)` với confirm. Cập nhật lại danh sách sau khi xóa.
       - Trạng thái rỗng: "Chưa có học sinh nào tham gia lớp."
3. **Modify: `d:\online-exam-front\src\pages\ManagerCreateExamPage.tsx` & `ManagerCreateExamForm.tsx`**
   - Đọc query param `const [searchParams] = useSearchParams(); const classroomId = searchParams.get('classroomId')`.
   - Truyền `classroomId` vào form. Nếu có `classroomId`:
     - Hiển thị badge / alert nhỏ: "Đề thi được tạo cho lớp học này."
     - Khi submit, gán `classroomId` vào payload `exam: { ...examData, classroomId }`.
     - Link quay lại: Nếu có `classroomId`, dẫn về `/manage/classes/${classroomId}`.
4. **Modify: `d:\online-exam-front\src\router\AppRouter.tsx`**
   - Thêm routes trong `<Route element={<ManagerRoute />}>`:
     - `<Route path="manage/classes" element={<ManagerClassesPage />} />`
     - `<Route path="manage/classes/:classId" element={<ManagerClassDetailPage />} />`
5. **Modify: `d:\online-exam-front\src\layouts\AppLayout.tsx`**
   - Trong navigation bar, khi user là `EXAM_MANAGER` hoặc `ADMIN`:
     - Thêm `<NavLink to="/manage/classes"><GraduationCap size={18} aria-hidden="true" /> Lớp học</NavLink>` (hoặc icon phù hợp).

---

## Verification
- Chạy `npm run build` trong `d:\online-exam-front`: Phải biên dịch sạch 100%, 0 lỗi TypeScript / Vite.
- Kiểm tra lại toàn bộ file vừa tạo/sửa: Tuyệt đối KHÔNG có `<svg>` trong bất kỳ thẻ `<button>` nào.
