# Task 5 Report: Frontend Màn Hình Giáo Viên (Quản Lý Lớp & Chi Tiết Lớp)

## 1. Tổng Quan Công Việc Đã Thực Hiện
- Đã triển khai đầy đủ giao diện Quản lý lớp học dành cho Giáo viên (`EXAM_MANAGER`) và Quản trị viên (`ADMIN`) tại đường dẫn `/manage/classes`.
- Đã triển khai màn hình Chi tiết lớp học tại `/manage/classes/:classId` với 2 tab tương tác: "Đề thi của lớp" và "Danh sách thành viên".
- Đã tích hợp luồng tạo đề thi gắn với lớp học: nhận `classroomId` từ query parameters tại `ManagerCreateExamPage` và `ManagerCreateExamForm`, hiển thị thông báo liên kết lớp và tự động gắn `classroomId` vào payload tạo đề thi.
- Đã bổ sung liên kết điều hướng "Lớp học" (`/manage/classes`) trên header thanh điều hướng chính (`AppLayout.tsx`) cho `EXAM_MANAGER` và `ADMIN`.
- Đã đăng ký 2 route mới trong `AppRouter.tsx` bên trong nhánh bảo vệ `ManagerRoute`.
- Đã tuân thủ nghiêm ngặt 100% các ràng buộc đặc biệt:
  - **STRICT TEXT-ONLY BUTTONS**: Tuyệt đối không có bất kỳ thẻ `<svg>` hay Lucide icon nào bên trong bất kỳ thẻ `<button>` nào. Mọi nút bấm đều dùng text thuần ("Tạo lớp học mới", "Sao chép thông tin lớp", "Sao chép mã lớp", "Xóa lớp", "Hủy", "Xác nhận xóa", "Tạo đề thi cho lớp", "Xóa khỏi lớp", "Thử lại", v.v.).
  - **USER MANDATED EXCLUSION**: Tuyệt đối loại bỏ câu "* Mã lớp sẽ do hệ thống tự sinh ngẫu nhiên duy nhất (ví dụ: MATH-892)." khỏi mọi nơi trên giao diện.
  - **NEO-BRUTALIST STYLING**: Điểm nhấn vàng `#ffcc00`, viền đen `2px solid #1a1a1a`, đổ bóng cứng `3px 3px 0 #1a1a1a`, phông chữ 'Space Grotesk' & 'Inter'.
  - **DELETION SAFETY**: Hộp thoại xác nhận trước khi xóa lớp; bẫy lỗi HTTP 409 Conflict bằng `getClassroomErrorMessage(err)` hiển thị rõ ràng khi lớp học còn đề thi hoặc bài thi của sinh viên.
- Đã kiểm tra biên dịch bằng `npm run build` (`tsc -b && vite build`), hoàn thành thành công với 0 lỗi.
- Đã commit toàn bộ mã nguồn vào git repository với thông điệp:
  `feat(front): implement manager classrooms management pages and navigation`

---

## 2. Chi Tiết Các File Đã Triển Khai & Sửa Đổi

### 2.1. File mới: `src/pages/ManagerClassesPage.tsx` & `ManagerClassesPage.css`
- **Chức năng:**
  - Tải danh sách lớp do giáo viên hiện tại quản lý qua `classroomsApi.getManaged()`.
  - Hiển thị danh sách thẻ lớp học responsive với layout Neo-Brutalist:
    - Tiêu đề lớp học, mô tả lớp.
    - Hộp thông tin lớp: Mã lớp (badge vàng `#ffcc00`), Mật khẩu lớp (hiển thị rõ cho giáo viên quản lý).
    - Thống kê: Số lượng học sinh tham gia, số lượng đề thi.
  - Bộ lọc tìm kiếm nhanh theo tên lớp hoặc mã lớp.
  - Modal tạo lớp học mới: Nhập Tên lớp, Mô tả (tùy chọn), Mật khẩu lớp. Text-only buttons: "Hủy", "Tạo lớp học".
  - Chức năng sao chép thông tin lớp: Ghi dữ liệu vào clipboard với thông báo "Đã sao chép!" tức thời.
  - Chức năng xem chi tiết: Liên kết chuyển hướng sang `/manage/classes/:classId`.
  - Chức năng xóa lớp học: Modal xác nhận cảnh báo an toàn. Bắt lỗi nghiệp vụ từ backend qua `getClassroomErrorMessage` (đặc biệt mã lỗi 409 Conflict khi lớp có đề thi hoặc bài làm).

### 2.2. File mới: `src/pages/ManagerClassDetailPage.tsx` & `ManagerClassDetailPage.css`
- **Chức năng:**
  - Lấy `classId` từ URL parameters.
  - Tải song song thông tin chi tiết qua `classroomsApi.getDetail(classId)`, `classroomsApi.getExams(classId)`, `classroomsApi.getMembers(classId)`.
  - Header chi tiết lớp: Tên lớp, mô tả, badge mã lớp, mật khẩu lớp, tổng số học sinh và tổng số đề thi.
  - Nút sao chép thông tin lớp và sao chép mã lớp (Text-only buttons).
  - Thanh chuyển đổi Tab (`exams` / `members`):
    - **Tab 1: "Đề thi của lớp"**:
      - Nút "Tạo đề thi cho lớp" dẫn sang `/manage/exams/create?classroomId=:classId`.
      - Danh sách thẻ đề thi: Tiêu đề, badge trạng thái (`Bản nháp`, `Đang mở`, `Đã đóng`), thời lượng làm bài, số câu hỏi, thời gian mở/đóng, liên kết sang trang quản lý đề thi `/manage/exams/:examId`.
      - Trạng thái rỗng hiển thị thông báo và hướng dẫn tạo đề thi đầu tiên.
    - **Tab 2: "Danh sách thành viên"**:
      - Danh sách sinh viên đã tham gia lớp: Avatar ký tự đầu, họ và tên, email, ngày tham gia.
      - Nút "Xóa khỏi lớp" mở modal xác nhận an toàn.
      - Gọi `classroomsApi.removeMember(classId, member.userId)`, cập nhật danh sách và số lượng thành viên sau khi xóa thành công.
      - Trạng thái rỗng hiển thị mã lớp và hướng dẫn giáo viên chia sẻ cho học sinh.

### 2.3. Cập nhật `src/pages/ManagerCreateExamPage.tsx` & `src/components/ManagerCreateExamForm.tsx`
- Đọc query param `classroomId` bằng `useSearchParams`.
- `ManagerCreateExamPage`:
  - Cập nhật liên kết quay lại: Nếu có `classroomId`, dẫn về `/manage/classes/:classroomId` ("Quay lại lớp học"); ngược lại dẫn về `/manage/exams` ("Quản lý đề thi").
  - Truyền `classroomId` vào `ManagerCreateExamForm`.
- `ManagerCreateExamForm`:
  - Tiếp nhận prop tùy chọn `classroomId?: string`.
  - Hiển thị badge ghi chú "Đề thi được tạo cho lớp học này."
  - Khi submit form, gắn trường `classroomId` vào `ExamPayload`.

### 2.4. Cập nhật `src/router/AppRouter.tsx`
- Đăng ký 2 routes mới trong `<Route element={<ManagerRoute />}>`:
  ```tsx
  <Route path="manage/classes" element={<ManagerClassesPage />} />
  <Route path="manage/classes/:classId" element={<ManagerClassDetailPage />} />
  ```

### 2.5. Cập nhật `src/layouts/AppLayout.tsx`
- Thêm icon `GraduationCap` và mục điều hướng `<NavLink to="/manage/classes"><GraduationCap size={18} aria-hidden="true" /> Lớp học</NavLink>` cho người dùng có vai trò `EXAM_MANAGER` hoặc `ADMIN`.

---

## 3. Tuân Thủ Các Ràng Buộc & Quy Tắc Cốt Lõi

| Quy Tắc | Đánh Giá | Minh Chứng |
|---------|----------|------------|
| **STRICT TEXT-ONLY BUTTONS** | ĐẠT 100% | Đã quét toàn bộ file: **0** thẻ `<svg>` hay component Lucide icon nào nằm bên trong thẻ `<button>`. Tất cả button đều là plain text. |
| **USER MANDATED EXCLUSION** | ĐẠT 100% | Không có bất kỳ câu "* Mã lớp sẽ do hệ thống tự sinh ngẫu nhiên duy nhất..." nào trong code hay giao diện. |
| **NEO-BRUTALIST STYLING** | ĐẠT 100% | Màu vàng `#ffcc00`, viền `2px solid #1a1a1a`, bóng cứng `3px 3px 0 #1a1a1a` / `4px 4px 0 #1a1a1a`, typography Space Grotesk. |
| **DELETION SAFETY (409)** | ĐẠT 100% | Xóa lớp và xóa học sinh đều có confirm modal; bắt lỗi HTTP 409 hiển thị "Không thể xóa lớp học đã có đề thi hoặc bài làm." rõ ràng. |

---

## 4. Kết Quả Kiểm Thử & Biên Dịch (Verification)

### 4.1. TypeScript & Vite Build
```
> online-exam-front@0.0.0 build
> tsc -b && vite build

vite v8.3.2 building client environment for production...
transforming...
✓ 2021 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.99 kB │ gzip:   0.54 kB
dist/assets/index-ZWNw3foX.css  114.07 kB │ gzip:  18.98 kB
dist/assets/index-C9NwDWBR.js   504.04 kB │ gzip: 147.99 kB
✓ built in 1.17s
```
Biên dịch thành công 100%, 0 lỗi.

### 4.2. Quét Kiểm Tra Ràng Buộc Tự Động
```
ALL VERIFICATIONS PASSED: 0 SVGs or icons inside buttons, 0 forbidden strings.
```

---

## 5. Thông Tin Git Commit
- **Commit Hash:** `365713447b404afa11e8f484042401702399839e` (short: `3657134`)
- **Message:** `feat(front): implement manager classrooms management pages and navigation`
- **Files Changed:**
  - `src/components/ManagerCreateExamForm.tsx`
  - `src/layouts/AppLayout.tsx`
  - `src/pages/ManagerClassDetailPage.css`
  - `src/pages/ManagerClassDetailPage.tsx`
  - `src/pages/ManagerClassesPage.css`
  - `src/pages/ManagerClassesPage.tsx`
  - `src/pages/ManagerCreateExamPage.tsx`
  - `src/router/AppRouter.tsx`
