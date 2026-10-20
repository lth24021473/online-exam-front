# Task 6 Report: Frontend Màn Hình Học Sinh (Lớp Của Tôi, Tham Gia & Làm Bài)

## 1. Tổng Quan Công Việc Đã Thực Hiện
- Đã triển khai đầy đủ giao diện "Lớp học của tôi" dành cho Học sinh (`STUDENT`) tại đường dẫn `/classes`.
- Đã triển khai chức năng Tham gia lớp học bằng Mã lớp (Classroom Code) và Mật khẩu (Classroom Password) thông qua Modal trực quan, bắt lỗi chi tiết qua `getClassroomErrorMessage(err)`.
- Đã triển khai màn hình Chi tiết lớp học tại `/classes/:classId` dành cho học sinh:
  - Header hiển thị tên lớp, mô tả, thông tin giáo viên phụ trách (họ tên, email, avatar/initial), thống kê số bạn học và số đề thi.
  - Tab 1: "Đề thi của lớp" hiển thị danh sách các đề thi được giao cho lớp kèm thời lượng, số câu hỏi, thời gian mở/đóng và nút "Vào làm bài" dẫn tới `/exams/:id`.
  - Tab 2: "Danh sách thành viên" hiển thị rõ ràng giáo viên phụ trách (chủ sở hữu lớp) và danh sách các bạn học cùng lớp kèm ngày tham gia.
- Đã tích hợp thanh điều hướng: Thêm mục "Lớp học" (`/classes`) với icon `GraduationCap` trong `AppLayout.tsx` khi người dùng là `STUDENT`.
- Đã đăng ký 2 routes mới trong `AppRouter.tsx`: `/classes` và `/classes/:classId`.
- Đã tích hợp trang Profile: Bổ sung liên kết `<Link to="/classes" className="profile-classes-link">Đi tới Lớp học của tôi</Link>` trong tab `#profile-panel-classes` của `ProfilePage.tsx` và `ProfilePage.css`. Bảo toàn nguyên vẹn tiêu đề `<h3>Chưa có lớp học để hiển thị</h3>` và tuyệt đối KHÔNG thực hiện API call nào trên profile page load để giữ nguyên 100% kết quả test suite profile.
- Tuân thủ nghiêm ngặt các quy tắc:
  - **STRICT TEXT-ONLY BUTTONS**: Tuyệt đối KHÔNG có bất kỳ thẻ `<svg>` hay Lucide icon nào bên trong bất kỳ thẻ `<button>` nào. Tất cả buttons đều dùng văn bản thuần ("Tham gia lớp học", "Tham gia lớp học ngay", "Hủy", "Tham gia", "Thử lại", tab buttons).
  - **NEO-BRUTALIST STYLING**: Điểm nhấn vàng `#ffcc00`, viền `2px solid var(--border)`, bóng cứng `3px 3px 0 #1a1a1a` / `4px 4px 0 #1a1a1a`, typography Space Grotesk & Inter, hỗ trợ responsive mobile (320px - 390px) và desktop.
- Đã xác thực toàn bộ:
  - `npm run build` thành công 100% với 0 lỗi type.
  - `npx playwright test tests/profile.spec.ts` pass 16/16 tests.
  - Quét kiểm tra tự động xác nhận 0 thẻ svg / icon bên trong button.
- Đã commit toàn bộ mã nguồn vào git repository:
  `feat(front): implement student classrooms pages and profile integration` (Commit hash: `500de45`).

---

## 2. Chi Tiết Các File Đã Triển Khai & Sửa Đổi

### 2.1. File mới: `src/pages/StudentClassesPage.tsx` & `StudentClassesPage.css`
- **Chức năng:**
  - Tải danh sách các lớp học sinh đã tham gia qua `classroomsApi.getJoined()`.
  - Hiển thị danh sách thẻ lớp học responsive với layout Neo-Brutalist:
    - Tiêu đề lớp học, mô tả lớp.
    - Badge mã lớp (e.g. `ABC123`).
    - Thẻ thông tin Giáo viên phụ trách: Avatar/ký tự đầu, họ và tên, email.
    - Thống kê: Số bạn cùng lớp (`memberCount`), số lượng đề thi (`examCount`).
    - Nút / Liên kết "Xem lớp học" chuyển hướng sang `/classes/:id`.
  - Bộ lọc tìm kiếm nhanh theo tên lớp, mã lớp hoặc tên giáo viên.
  - Modal "Tham gia lớp học":
    - Input Mã lớp (tự động chuyển thành chữ hoa uppercase).
    - Input Mật khẩu lớp học.
    - Text-only buttons: "Hủy", "Tham gia" / "Đang tham gia…".
    - Bắt lỗi chi tiết qua `getClassroomErrorMessage(err)` (sai mật khẩu, mã không tồn tại, đã tham gia rồi, v.v.).
    - Đóng modal, reset form, hiển thị thông báo thành công và tải lại danh sách lớp.
  - Trạng thái rỗng: Nếu chưa tham gia lớp nào, hiển thị thông báo thân thiện và nút "Tham gia lớp học ngay" để mở modal tham gia.

### 2.2. File mới: `src/pages/StudentClassDetailPage.tsx` & `StudentClassDetailPage.css`
- **Chức năng:**
  - Lấy `classId` từ URL parameters thông qua `useParams()`.
  - Tải song song thông tin qua `classroomsApi.getDetail(classId)`, `classroomsApi.getExams(classId)`, `classroomsApi.getMembers(classId)`.
  - Header chi tiết lớp học:
    - Liên kết "Quay lại danh sách lớp" dẫn về `/classes`.
    - Tên lớp, mô tả lớp học.
    - Thẻ Giáo viên phụ trách nổi bật: Avatar, họ tên, email, nhãn "Giáo viên phụ trách".
    - Dải thống kê: Mã lớp, số học sinh, số đề thi.
  - Thanh chuyển đổi 2 Tab (`exams` / `members`) bằng text-only buttons:
    - **Tab 1: "Đề thi của lớp"**:
      - Hiển thị danh sách các đề thi được giao cho lớp: Tiêu đề, mô tả, thời lượng (`durationMinutes` phút), số câu hỏi, thời gian mở/đóng (`opensAt` / `closesAt`).
      - Liên kết "Vào làm bài" dẫn trực tiếp đến `/exams/:id`.
      - Trạng thái rỗng: "Lớp học hiện chưa có đề thi nào."
    - **Tab 2: "Danh sách thành viên"**:
      - Mục Giáo viên quản lý với nhãn phân biệt "Giáo viên".
      - Mục Bạn cùng lớp với danh sách sinh viên đã tham gia: Avatar/ký tự đầu, họ tên, email, ngày tham gia (`joinedAt`) và nhãn "Học viên".
      - Trạng thái rỗng: "Chưa có thành viên nào khác." khi chưa có học sinh khác tham gia.

### 2.3. Cập nhật `src/pages/ProfilePage.tsx` & `ProfilePage.css`
- Thêm import `Link` từ `react-router-dom`.
- Trong `#profile-panel-classes`:
  - Giữ nguyên heading `<h3>Chưa có lớp học để hiển thị</h3>`.
  - Bổ sung `<Link to="/classes" className="profile-classes-link">Đi tới Lớp học của tôi</Link>`.
  - Tuyệt đối không gọi thêm API nào trên trang Profile để giữ toàn vẹn ràng buộc của Playwright test fixture.
- Trong `ProfilePage.css`: Thêm styling Neo-Brutalist cho `.profile-classes-link` (nền vàng `#ffcc00`, viền đen, đổ bóng cứng `3px 3px 0 #1a1a1a`, font Space Grotesk).

### 2.4. Cập nhật `src/router/AppRouter.tsx`
- Đăng ký 2 routes mới cho học sinh dưới layout chính:
  ```tsx
  <Route path="classes" element={<StudentClassesPage />} />
  <Route path="classes/:classId" element={<StudentClassDetailPage />} />
  ```

### 2.5. Cập nhật `src/layouts/AppLayout.tsx`
- Khi người dùng có vai trò `STUDENT`: Thêm liên kết điều hướng `<NavLink to="/classes"><GraduationCap size={18} aria-hidden="true" /> Lớp học</NavLink>`.

---

## 3. Tuân Thủ Các Ràng Buộc & Quy Tắc Cốt Lõi

| Quy Tắc | Đánh Giá | Minh Chứng |
|---------|----------|------------|
| **STRICT TEXT-ONLY BUTTONS** | ĐẠT 100% | Đã chạy script kiểm tra tự động: **0** thẻ `<svg>` hay icon Lucide nào nằm bên trong bất kỳ thẻ `<button>` nào. Tất cả buttons đều là plain text thuần túy. |
| **PRESERVE PROFILE TEST SUITE** | ĐẠT 100% | Cả 16/16 test trong `tests/profile.spec.ts` đều pass hoàn toàn. Không phát sinh bất kỳ request API ngoài luồng nào. |
| **NEO-BRUTALIST STYLING** | ĐẠT 100% | Màu vàng `#ffcc00`, viền `2px solid var(--border)`, bóng cứng `3px 3px 0 #1a1a1a` / `4px 4px 0 #1a1a1a`, typography Space Grotesk & Inter. |
| **ROLE-BASED NAVIGATION** | ĐẠT 100% | Học sinh (`STUDENT`) thấy mục "Lớp học" trỏ về `/classes`, trong khi giáo viên/quản trị viên thấy mục "Lớp học" trỏ về `/manage/classes`. |

---

## 4. Kết Quả Kiểm Thử & Biên Dịch (Verification)

### 4.1. TypeScript & Vite Build
```
> online-exam-front@0.0.0 build
> tsc -b && vite build

vite v8.3.2 building client environment for production...
transforming...
✓ 2025 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.99 kB │ gzip:   0.53 kB
dist/assets/index-b63flCri.css  124.61 kB │ gzip:  19.80 kB
dist/assets/index-BxY3i1qT.js   517.65 kB │ gzip: 149.64 kB
✓ built in 1.09s
```

### 4.2. Playwright Profile Spec
```
Running 16 tests using 2 workers

  ok  2 tests\profile.spec.ts:124:1 › tabs support arrow keys, Home, End, focus and roving tabindex (3.0s)
  ok  1 tests\profile.spec.ts:94:1 › profile shows real account details and four tabs with persistent query navigation (4.6s)
  ok  3 tests\profile.spec.ts:143:1 › saved profile edits update account details and home greeting and persist after reload (3.7s)
  ok  4 tests\profile.spec.ts:178:1 › account save notices expire after one second and repeated saves restart their lifetime (2.8s)
  ok  6 tests\profile.spec.ts:250:1 › blank names and browser storage failures leave the saved account unchanged (2.1s)
  ok  5 tests\profile.spec.ts:212:1 › cancel restores the last saved profile and optional location fields can be cleared (3.9s)
  ok  7 tests\profile.spec.ts:275:1 › profile metadata for another account does not affect the current account (1.9s)
  ok  9 tests\profile.spec.ts:310:1 › overlapping avatar and cover notices expire independently after one second (2.4s)
  ok  8 tests\profile.spec.ts:288:1 › avatar upload persists locally across reload and can be removed (4.3s)
  ok 10 tests\profile.spec.ts:344:1 › unsupported or oversized avatar files show an error and retain the existing avatar (2.2s)
  ok 12 tests\profile.spec.ts:407:1 › invalid cover files preserve the saved image and report a cover error (2.7s)
  ok 11 tests\profile.spec.ts:361:1 › cover editor uploads an image that persists independently of the avatar and can be removed (4.6s)
  ok 13 tests\profile.spec.ts:437:1 › profile fits 390px and 320px with a long Vietnamese name in every tab (3.6s)
  ok 14 tests\profile.spec.ts:459:1 › dark mode works with the keyboard, persists and follows account and home navigation (4.9s)
  ok 15 tests\profile.spec.ts:522:1 › dark OS preference and invalid saved themes still default to light mode (2.7s)
  ok 16 tests\profile.spec.ts:541:1 › profile desktop and mobile previews are captured (3.8s)

  16 passed (30.1s)
```

### 4.3. Script Kiểm Tra Buttons Text-Only
```
d:/online-exam-front/src/pages/StudentClassesPage.tsx button count: 5
  OK button: <button type="button" className="button button-primary button-inline" onClick={() => { setShowJoinModal(true) setJoinError('') }} > Tham gia lớp học </button>
  OK button: <button type="button" className="button button-primary button-inline" onClick={loadClassrooms} > Thử lại </button>
  OK button: <button type="button" className="button button-primary button-inline" onClick={() => { setShowJoinModal(true) setJoinError('') }} > Tham gia lớp học ngay </button>
  OK button: <button type="button" className="button button-secondary button-inline" onClick={() => setShowJoinModal(false)} disabled={joinBusy} > Hủy </button>
  OK button: <button type="submit" className="button button-primary button-inline" disabled={joinBusy} > {joinBusy ? 'Đang tham gia…' : 'Tham gia'} </button>
d:/online-exam-front/src/pages/StudentClassDetailPage.tsx button count: 3
  OK button: <button type="button" className="button button-primary button-inline" onClick={loadClassDetails} > Thử lại </button>
  OK button: <button type="button" role="tab" aria-selected={activeTab === 'exams'} className={`student-class-tab-btn ${activeTab === 'exams' ? 'tab-active' : ''}`} onClick={() => setActiveTab('exams')} > Đề thi của lớp ({exams.length}) </button>
  OK button: <button type="button" role="tab" aria-selected={activeTab === 'members'} className={`student-class-tab-btn ${activeTab === 'members' ? 'tab-active' : ''}`} onClick={() => setActiveTab('members')} > Danh sách thành viên ({members.length}) </button>
ALL BUTTONS VERIFIED CLEAN!
```

---

## 5. Kết Luận
Task 6 đã hoàn thành xuất sắc toàn bộ các mục tiêu đặt ra theo đúng đặc tả và thỏa mãn toàn bộ các ràng buộc nghiêm ngặt.
Git commit: `500de45`.
