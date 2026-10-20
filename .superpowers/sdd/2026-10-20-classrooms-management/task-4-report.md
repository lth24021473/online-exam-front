# Task 4 Report: Frontend API Client Cho Classrooms

## 1. Tổng Quan Công Việc Đã Thực Hiện
- Đã tạo mới module API client [classrooms.ts](file:///d:/online-exam-front/src/api/classrooms.ts) cung cấp đầy đủ các types và phương thức tương tác với backend endpoints `/classrooms/...`.
- Đã cài đặt cơ chế unwrap an toàn trong `classrooms.ts` bằng hàm trợ giúp `extractList` hỗ trợ cả 2 định dạng phản hồi từ backend: mảng thuần `T[]` và object đóng gói `{ items: T[] }`.
- Đã bổ sung hàm chuyển ngữ lỗi người dùng tiếng Việt `getClassroomErrorMessage` chuyên biệt cho các trường hợp nghiệp vụ lớp học (mã trùng, sai mật khẩu, lớp có đề thi/bài làm không được xóa, kiểm tra quyền hạn, ...).
- Đã cập nhật [exams.ts](file:///d:/online-exam-front/src/api/exams.ts) để thêm `classroomId?: string | null` vào `ExamInfo`, cùng các type aliases `Exam`, `ExamDetail`.
- Đã cập nhật [manager-exams.ts](file:///d:/online-exam-front/src/api/manager-exams.ts) để thêm `classroomId?: string | null` vào `ExamPayload` và type alias `ManagerExamDetail`.
- Đã cập nhật [manager-exam-creation.ts](file:///d:/online-exam-front/src/api/manager-exam-creation.ts) đồng bộ hóa trường `classroomId` trong các hàm chuẩn hóa metadata (`normalizeMetadata` và `metadata`) phục vụ cơ chế tạo và cập nhật đề thi an toàn (optimistic conflict check).
- Đã kiểm tra biên dịch bằng `npm run build` (`tsc -b && vite build`), hoàn thành thành công với 0 lỗi.
- Đã commit toàn bộ mã nguồn vào repository `d:\online-exam-front`.

---

## 2. Chi Tiết Các File Đã Triển Khai

### 2.1. File mới: `src/api/classrooms.ts`
- **Interfaces xuất bản:**
  - `ClassroomManager`: Thông tin giáo viên tạo/quản lý lớp (`id`, `fullName`, `email`, `avatar`).
  - `Classroom`: Chi tiết lớp học (`id`, `name`, `code`, `description`, `password`, `managerId`, `manager`, `memberCount`, `examCount`, `createdAt`, `updatedAt`, `joinedAt`).
  - `ClassroomMember`: Thành viên lớp học (`id`, `userId`, `fullName`, `email`, `avatar`, `role`, `joinedAt`).
  - `ClassroomExam`: Thông tin đề thi thuộc lớp học (`id`, `title`, `description`, `instructions`, `durationMinutes`, `totalQuestions`, `status`, `opensAt`, `closesAt`, `maxAttempts`, `classroomId`, `_count`).
  - `CreateClassroomPayload`: Payload tạo lớp (`name`, `description?`, `password`).
  - `JoinClassroomPayload`: Payload tham gia lớp (`code`, `password`).
- **Methods trong `classroomsApi`:**
  - `create(payload: CreateClassroomPayload): Promise<Classroom>` -> `POST /classrooms`
  - `getManaged(): Promise<Classroom[]>` -> `GET /classrooms/managed`
  - `getJoined(): Promise<Classroom[]>` -> `GET /classrooms/joined`
  - `getDetail(id: string): Promise<Classroom>` -> `GET /classrooms/${id}`
  - `join(payload: JoinClassroomPayload): Promise<Classroom>` -> `POST /classrooms/join`
  - `getMembers(id: string): Promise<ClassroomMember[]>` -> `GET /classrooms/${id}/members`
  - `getExams(id: string): Promise<any[]>` -> `GET /classrooms/${id}/exams`
  - `removeMember(classroomId: string, userId: string): Promise<void>` -> `DELETE /classrooms/${classroomId}/members/${userId}`
  - `deleteClassroom(id: string): Promise<void>` -> `DELETE /classrooms/${id}`
- **Hàm `getClassroomErrorMessage(error: unknown): string`:**
  - Xử lý các mã lỗi phổ biến: `Classroom not found`, `Classroom code already exists`, `Wrong classroom password`, `You have already joined this classroom`, `You cannot join your own classroom`, `Cannot delete classroom with existing exams or attempts`, v.v.

### 2.2. Cập nhật `src/api/exams.ts`
- Bổ sung `classroomId?: string | null` vào interface `ExamInfo`.
- Xuất bản type aliases `Exam = ExamInfo` và `ExamDetail = ExamInfo`.

### 2.3. Cập nhật `src/api/manager-exams.ts`
- Bổ sung `classroomId?: string | null` vào interface `ExamPayload`.
- Xuất bản type alias `ManagerExamDetail = ManagerExam`.
- `ManagerExam` kế thừa `ExamInfo` nên tự động sở hữu trường `classroomId?: string | null`.

### 2.4. Cập nhật `src/api/manager-exam-creation.ts`
- Bổ sung `classroomId` vào `normalizeMetadata`:
  ```ts
  ...(payload.classroomId ? { classroomId: payload.classroomId } : {})
  ```
- Bổ sung `classroomId: exam.classroomId` vào `metadata(exam: ManagerExam)`.

---

## 3. Kết Quả Xác Minh & Build

```bash
> online-exam-front@0.0.0 build
> tsc -b && vite build

vite v8.3.2 building client environment for production...
transforming...
✓ 2016 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.99 kB │ gzip:   0.53 kB
dist/assets/index-BFHYneEF.css  105.97 kB │ gzip:  17.98 kB
dist/assets/index-DEBldS12.js   482.47 kB │ gzip: 143.82 kB

✓ built in 1.14s
```

Không có bất kỳ cảnh báo hoặc lỗi TypeScript / Vite nào.

---

## 4. Thông Tin Git Commit
- **Repository:** `d:\online-exam-front`
- **Commit hash:** `a11851168ece5a9e2636f0f49cac9a157c162565`
- **Commit message:** `feat(front): add classrooms API client and exam type mappings`
- **Files changed:**
  - `src/api/classrooms.ts` (created)
  - `src/api/exams.ts` (modified)
  - `src/api/manager-exams.ts` (modified)
  - `src/api/manager-exam-creation.ts` (modified)
