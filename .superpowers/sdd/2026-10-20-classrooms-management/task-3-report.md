# Task 3 Report: Backend Controller, Module & Cô Lập Đề Thi Trong Lớp

## 1. Tổng Quan Công Việc Đã Thực Hiện
Đã hoàn thành toàn bộ yêu cầu của Task 3 theo đúng quy trình TDD (Test-Driven Development) và các tiêu chuẩn bảo mật, cô lập phạm vi đề thi theo lớp học:

1. **Viết test kiểm chứng failing (TDD Step 1 & 2)**:
   - Tạo [classrooms-exam-scope.spec.ts](file:///d:/online-exam-api/src/classrooms/classrooms-exam-scope.spec.ts) bao phủ toàn diện 15 kịch bản kiểm thử:
     - Ẩn đề thi lớp học khỏi `GET /exams` của học sinh (chỉ trả về đề công khai đã publish).
     - Ẩn đề thi lớp học khỏi `GET /exams` của giáo viên trên danh sách chung `/manage/exams`.
     - Chỉ trả về đề thi lớp học qua phương thức `findByClassroom(classroomId)`.
     - Chặn giáo viên tạo đề thi vào lớp học mà mình không quản lý (403 `ForbiddenException('Bạn không quản lý lớp học này')`).
     - Cho phép giáo viên sở hữu lớp học tạo đề thi gắn với `classroomId`.
     - Chặn học sinh không thuộc lớp truy cập chi tiết đề thi lớp học qua `GET /exams/:id` (403 `ForbiddenException('Đề thi này chỉ dành cho học sinh trong lớp')`).
     - Cho phép học sinh trong lớp xem chi tiết đề thi lớp học và tự động ẩn đáp án đúng (`isCorrect: undefined`).
     - Chặn học sinh không thuộc lớp bắt đầu làm bài thi lớp học qua `AttemptsService.start` (403 `ForbiddenException('Đề thi này chỉ dành cho học sinh trong lớp')`).
     - Cho phép học sinh là thành viên lớp bắt đầu làm bài thi lớp học bình thường.
     - Bảo mật: Ẩn trường `password` khi học sinh gọi `GET /classrooms/:id`.
     - Giữ nguyên trường `password` khi giáo viên quản lý lớp gọi `GET /classrooms/:id`.
     - Chặn người dùng không phải thành viên xem chi tiết lớp học (`assertAccess` ném 403 `ForbiddenException('Bạn không có quyền truy cập lớp học này')`).
     - Chuyển tiếp `GET /classrooms/:id/exams` sang `ExamsService.findByClassroom` sau khi xác thực quyền truy cập.
     - Chuyển tiếp xóa thành viên sang `ClassroomsService.removeMember`.
     - Chuyển tiếp xóa lớp học sang `ClassroomsService.deleteClassroom`.
   - Chạy test xác nhận FAIL trước khi cài đặt.

2. **Cài đặt ClassroomsController**:
   - [classrooms.controller.ts](file:///d:/online-exam-api/src/classrooms/classrooms.controller.ts):
     - Gắn `@UseGuards(JwtAuthGuard, RolesGuard)` và `@ApiBearerAuth()`.
     - `POST /classrooms`: `@Roles(Role.EXAM_MANAGER, Role.ADMIN)` -> `create(managerId, dto)`
     - `GET /classrooms/managed`: `@Roles(Role.EXAM_MANAGER, Role.ADMIN)` -> `findManaged(managerId)`
     - `GET /classrooms/joined`: `@Roles(Role.STUDENT, Role.EXAM_MANAGER, Role.ADMIN)` -> `findJoined(userId)`
     - `POST /classrooms/join`: `@Roles(Role.STUDENT, Role.EXAM_MANAGER, Role.ADMIN)` -> `join(userId, dto)`
     - `GET /classrooms/:id`: Kiểm tra `assertAccess`. Nếu requester là `STUDENT`, xóa thuộc tính `password` trước khi trả về.
     - `GET /classrooms/:id/members`: Kiểm tra `assertAccess`, trả về danh sách thành viên.
     - `DELETE /classrooms/:id/members/:userId`: `@Roles(Role.EXAM_MANAGER, Role.ADMIN)` -> `removeMember(id, userId, managerId, role)`.
     - `DELETE /classrooms/:id`: `@Roles(Role.EXAM_MANAGER, Role.ADMIN)` -> `deleteClassroom(id, managerId, role)`.
     - `GET /classrooms/:id/exams`: Kiểm tra `assertAccess`, gọi `examsService.findByClassroom(id, role)`.
     - **Thứ tự route an toàn**: Đặt các route cố định (`managed`, `joined`, `join`) trước route tham số (`:id`) để tránh Express param shadowing.

3. **Cài đặt ClassroomsModule & Cập nhật AppModule**:
   - [classrooms.module.ts](file:///d:/online-exam-api/src/classrooms/classrooms.module.ts): Import `PrismaModule`, `AuthSecurityModule`, `ExamsModule`. Cung cấp và export `ClassroomsService`, `ClassroomsRepository`.
   - [app.module.ts](file:///d:/online-exam-api/src/app.module.ts): Đăng ký `ClassroomsModule`.

4. **Cập nhật CreateExamDto**:
   - [create-exam.dto.ts](file:///d:/online-exam-api/src/exams/dto/create-exam.dto.ts): Bổ sung `classroomId?: string` với validation `@IsOptional() @IsString()`, Swagger documentation và `@Transform` chuẩn hóa chuỗi.

5. **Cài đặt Cô Lập Đề Thi Trong Lớp (Exam Scope Isolation)**:
   - [exams.repository.ts](file:///d:/online-exam-api/src/exams/exams.repository.ts):
     - `findAll(role?: Role)`: Nếu role là `STUDENT` hoặc `EXAM_MANAGER`, thêm điều kiện `{ OR: [{ classroomId: null }, { classroomId: { isSet: false } }] }` để lọc đề thi công khai.
     - `findManyByManager(managerId: string)`: Thêm `{ OR: [{ classroomId: null }, { classroomId: { isSet: false } }] }` để đề thi lớp học không xuất hiện ở trang quản lý đề thi chung `/manage/exams`.
     - `findManyPublished()`: Thêm `{ OR: [{ classroomId: null }, { classroomId: { isSet: false } }] }` để học sinh chỉ thấy đề thi công khai trên trang danh sách đề `/exams`.
     - `findByClassroom(classroomId: string, userRole?: Role)`: Truy vấn đề thi theo `classroomId` (với `Role.STUDENT`, chỉ lấy đề `PUBLISHED`).
     - `findClassroomById(id: string)` và `isClassroomMember(classroomId: string, userId: string)`: Hỗ trợ kiểm tra quyền sở hữu và thành viên nhanh chóng.
   - [exams.service.ts](file:///d:/online-exam-api/src/exams/exams.service.ts):
     - `create(managerId, dto, role)`: Nếu có `dto.classroomId`, kiểm tra sự tồn tại của lớp học (`NotFoundException('Lớp học không tồn tại')`) và kiểm tra quyền quản lý của giáo viên (`ForbiddenException('Bạn không quản lý lớp học này')`). Kết nối đề thi vào `classroom`.
     - `findOne(id, userId, role)`: Nếu đề thi có `classroomId`, kiểm tra xem người dùng có phải là quản lý lớp, admin, hoặc thành viên của lớp hay không. Nếu không, ném 403 `ForbiddenException('Đề thi này chỉ dành cho học sinh trong lớp')`.
     - `findByClassroom(classroomId, userRole)`: Ủy nhiệm sang `examsRepository.findByClassroom`.
     - `getExamById(id, userId?, role?)`: Hỗ trợ truy xuất đề thi kèm kiểm tra bảo mật.
   - [exams.controller.ts](file:///d:/online-exam-api/src/exams/exams.controller.ts): Chuyển tiếp role khi tạo đề thi.

6. **Cập nhật AttemptsService & AttemptsRepository**:
   - [attempts.repository.ts](file:///d:/online-exam-api/src/attempts/attempts.repository.ts):
     - Cập nhật `findExamForStart` để chọn thêm `managerId: true, classroomId: true`.
     - Thêm `isClassroomMember(classroomId: string, userId: string): Promise<boolean>`.
     - Thêm `isUserAdmin(userId: string): Promise<boolean>`.
   - [attempts.service.ts](file:///d:/online-exam-api/src/attempts/attempts.service.ts):
     - Trong `start(userId, examId)`: Nếu đề thi có `classroomId`, xác minh học sinh là thành viên lớp học (hoặc quản lý/admin). Nếu không, ném 403 `ForbiddenException('Đề thi này chỉ dành cho học sinh trong lớp')`.
     - Thêm alias `createAttempt(userId, examId)` gọi sang `start(userId, examId)`.

7. **Kiểm thử & Xác nhận chất lượng**:
   - Chạy test unit & integration: `npm test -- src/classrooms/classrooms-exam-scope.spec.ts`: 15/15 tests passed.
   - Chạy toàn bộ test suites: `npm test`: 7/7 suites passed (84/84 tests).
   - Build TypeScript: `npm run build`: Thành công không có lỗi type.
   - Rebuild Docker container API: `docker compose up -d --build api` thành công, container `online-exam-api-api-1` đang chạy healthy, log xác nhận toàn bộ route `/api/v1/classrooms/*` đã được map.
   - Commit Git: Commit `b2c2ecc` với message `feat(api): implement ClassroomsController and strict exam scope isolation`.

---

## 2. Danh Sách Endpoints `/api/v1/classrooms/*`

| Method | Endpoint | Quyền hạn | Chức năng | Ghi chú bảo mật |
|---|---|---|---|---|
| `POST` | `/api/v1/classrooms` | `EXAM_MANAGER`, `ADMIN` | Tạo lớp học mới | Tự động sinh mã code 6 ký tự |
| `GET` | `/api/v1/classrooms/managed` | `EXAM_MANAGER`, `ADMIN` | Danh sách lớp do GV tạo | Bao gồm số lượng thành viên & bài thi |
| `GET` | `/api/v1/classrooms/joined` | `STUDENT`, `EXAM_MANAGER`, `ADMIN` | Danh sách lớp đã tham gia | Kèm thông tin giáo viên & ngày tham gia |
| `POST` | `/api/v1/classrooms/join` | `STUDENT`, `EXAM_MANAGER`, `ADMIN` | Tham gia lớp học bằng code + password | Kiểm tra mật khẩu & chống trùng lặp |
| `GET` | `/api/v1/classrooms/:id` | `STUDENT`, `EXAM_MANAGER`, `ADMIN` | Xem chi tiết lớp học | **Học sinh bị xóa thuộc tính `password`** |
| `GET` | `/api/v1/classrooms/:id/members` | `STUDENT`, `EXAM_MANAGER`, `ADMIN` | Danh sách thành viên lớp | Yêu cầu là thành viên, quản lý hoặc admin |
| `DELETE` | `/api/v1/classrooms/:id/members/:userId` | `EXAM_MANAGER`, `ADMIN` | Xóa thành viên khỏi lớp | Chỉ giáo viên quản lý lớp hoặc admin |
| `DELETE` | `/api/v1/classrooms/:id` | `EXAM_MANAGER`, `ADMIN` | Xóa lớp học | Chặn xóa nếu đã có đề thi (`ConflictException`) |
| `GET` | `/api/v1/classrooms/:id/exams` | `STUDENT`, `EXAM_MANAGER`, `ADMIN` | Danh sách đề thi của lớp | Học sinh chỉ thấy đề `PUBLISHED` |

---

## 3. Cơ Chế Cô Lập Đề Thi (Exam Scope Isolation)

1. **Đề thi chung (Public Exams - `classroomId: null`)**:
   - Học sinh gọi `GET /exams`: Chỉ nhận các đề thi có `status: PUBLISHED` và `classroomId == null`.
   - Giáo viên gọi `GET /exams` (trang quản lý `/manage/exams`): Chỉ nhận đề thi của giáo viên đó có `classroomId == null`.

2. **Đề thi lớp học (Classroom Exams - `classroomId != null`)**:
   - Không bao giờ hiển thị trên danh sách đề thi chung.
   - Chỉ hiển thị qua endpoint chuyên biệt `GET /classrooms/:id/exams`.
   - Quyền tạo đề: Chỉ giáo viên quản lý lớp (hoặc admin) mới được chỉ định `classroomId` khi tạo đề thi (`POST /exams`).
   - Quyền xem đề (`GET /exams/:id`): Bắt buộc người dùng phải là giáo viên quản lý lớp, admin, hoặc học sinh đã tham gia lớp học đó. Học sinh ngoài lớp nhận lỗi `403 Forbidden` (`'Đề thi này chỉ dành cho học sinh trong lớp'`).
   - Quyền làm bài (`POST /exams/:id/attempts`): Bắt buộc người dùng phải là học sinh trong lớp. Học sinh ngoài lớp bị từ chối với lỗi `403 Forbidden` (`'Đề thi này chỉ dành cho học sinh trong lớp'`).

---

## 4. Bằng Chứng Kiểm Thử

### 4.1. Test Suite `src/classrooms/classrooms-exam-scope.spec.ts`
```
PASS src/classrooms/classrooms-exam-scope.spec.ts
  Classrooms & Exam Scope Isolation
    Exam Scope Filtering in ExamsRepository / ExamsService
      √ hides class exams from student GET /exams (only returns public published exams) (6 ms)
      √ hides class exams from manager GET /exams (only returns public manager exams) (1 ms)
      √ returns class exams only via findByClassroom (1 ms)
      √ throws ForbiddenException when manager creates exam for classroom they do not own (15 ms)
      √ allows manager who owns classroom to create class exam (1 ms)
      √ blocks non-member student from viewing class exam detail (403 Forbidden)
      √ allows member student to view class exam detail and strips correct options
    AttemptsService Class Exam Scope Isolation
      √ blocks non-member student from attempting class exam (403 Forbidden) (3 ms)
      √ allows member student to attempt class exam (1 ms)
    ClassroomsController Security & Endpoints
      √ strips password when student calls GET /classrooms/:id (1 ms)
      √ retains password when manager calls GET /classrooms/:id
      √ blocks non-member when accessing classroom detail (3 ms)
      √ delegates findExams to examsService.findByClassroom after access assertion (1 ms)
      √ delegates removeMember to classroomsService.removeMember
      √ delegates deleteClassroom to classroomsService.deleteClassroom

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        1.801 s, estimated 3 s
```

### 4.2. Toàn bộ Test Suites API (`npm test`)
```
PASS src/exams/exam-write-conflict.spec.ts
PASS src/exams/exam-schedule-reopen.spec.ts
PASS src/attempts/attempts.repository.spec.ts
PASS src/classrooms/classrooms.service.spec.ts
PASS src/app.controller.spec.ts
PASS src/classrooms/classrooms-exam-scope.spec.ts
PASS src/auth/auth.spec.ts (5.621 s)

Test Suites: 7 passed, 7 total
Tests:       84 passed, 84 total
Snapshots:   0 total
Time:        6.664 s
Ran all test suites.
```

### 4.3. Docker Startup Log
```
[Nest] 19  - 10/20/2026, 2:02:41 AM     LOG [RouterExplorer] Mapped {/api/v1/classrooms, POST} route
[Nest] 19  - 10/20/2026, 2:02:41 AM     LOG [RouterExplorer] Mapped {/api/v1/classrooms/managed, GET} route
[Nest] 19  - 10/20/2026, 2:02:41 AM     LOG [RouterExplorer] Mapped {/api/v1/classrooms/joined, GET} route
[Nest] 19  - 10/20/2026, 2:02:41 AM     LOG [RouterExplorer] Mapped {/api/v1/classrooms/join, POST} route
[Nest] 19  - 10/20/2026, 2:02:41 AM     LOG [RouterExplorer] Mapped {/api/v1/classrooms/:id, GET} route
[Nest] 19  - 10/20/2026, 2:02:41 AM     LOG [RouterExplorer] Mapped {/api/v1/classrooms/:id/members, GET} route
[Nest] 19  - 10/20/2026, 2:02:41 AM     LOG [RouterExplorer] Mapped {/api/v1/classrooms/:id/members/:userId, DELETE} route
[Nest] 19  - 10/20/2026, 2:02:41 AM     LOG [RouterExplorer] Mapped {/api/v1/classrooms/:id, DELETE} route
[Nest] 19  - 10/20/2026, 2:02:41 AM     LOG [RouterExplorer] Mapped {/api/v1/classrooms/:id/exams, GET} route
[Nest] 19  - 10/20/2026, 2:02:41 AM     LOG [NestApplication] Nest application successfully started +26ms
```

---

## 5. Git Commit Reference
- **Repo**: `d:\online-exam-api`
- **Commit**: `b2c2ecc`
- **Message**: `feat(api): implement ClassroomsController and strict exam scope isolation`
- **Diff Package**: [task-3-review-package.diff](file:///d:/online-exam-front/.superpowers/sdd/2026-10-20-classrooms-management/task-3-review-package.diff)


---

## 6. Báo Cáo Sửa Đổi Theo Review (Fix Round 1)

### 6.1. Các vấn đề đã xử lý
1. **Password Leak in `findJoined`**:
   - Trong [classrooms.repository.ts](file:///d:/online-exam-api/src/classrooms/classrooms.repository.ts) (phương thức `findJoined`): Đã bóc tách `{ password, ...classroomWithoutPassword }` trước khi trả về object classroom cho học sinh.
   - Trong [classrooms.controller.ts](file:///d:/online-exam-api/src/classrooms/classrooms.controller.ts) (`GET /classrooms/joined`): Bổ sung thêm một lớp lọc xóa trường `password` khỏi danh sách phòng học trước khi response trả về client.
2. **Password Leak in `join`**:
   - Trong [classrooms.service.ts](file:///d:/online-exam-api/src/classrooms/classrooms.service.ts) (phương thức `join`): Bóc tách loại bỏ `password` khỏi object classroom trả về sau khi join thành công.
   - Trong [classrooms.controller.ts](file:///d:/online-exam-api/src/classrooms/classrooms.controller.ts) (`POST /classrooms/join`): Đảm bảo object trả về cho client không chứa trường `password`.
   - Cập nhật [classrooms.service.spec.ts](file:///d:/online-exam-api/src/classrooms/classrooms.service.spec.ts) để kiểm tra đúng định dạng trả về không chứa mật khẩu.
3. **Password Visibility in `findOne` (`GET /classrooms/:id`)**:
   - Cập nhật logic điều kiện trong [classrooms.controller.ts](file:///d:/online-exam-api/src/classrooms/classrooms.controller.ts): Chỉ giữ lại trường `password` nếu `req.user.role === Role.ADMIN || classroom.managerId === req.user.id`. Tất cả các đối tượng gọi khác (học sinh hoặc giáo viên không phải chủ sở hữu lớp) đều bị xóa trường `password`.
4. **Pipe Validation**:
   - Bổ sung `ParseObjectIdPipe` vào tất cả các tham số `@Param('id')` và `@Param('userId')` trên các route trong [classrooms.controller.ts](file:///d:/online-exam-api/src/classrooms/classrooms.controller.ts) (`findOne`, `findMembers`, `removeMember`, `deleteClassroom`, `findExams`).

### 6.2. Kết quả kiểm thử sau sửa đổi
- `src/classrooms/classrooms-exam-scope.spec.ts`: 20/20 unit/integration tests passed (bổ sung test cho `findJoined`, `join`, non-owner manager `findOne`, `ParseObjectIdPipe`).
- `src/classrooms/classrooms.service.spec.ts`: 22/22 unit tests passed.
- `npm test`: 7/7 suites passed (89/89 tests passed).
- `npm run build`: NestJS build thành công 0 lỗi.
- Rebuild Docker API: `online-exam-api-api-1` running & healthy.

### 6.3. Git Commit Fix
- **Repo**: `d:\online-exam-api`
- **Commit**: `282af10`
- **Message**: `fix(api): strip classroom passwords on joined/join routes and apply ParseObjectIdPipe`
