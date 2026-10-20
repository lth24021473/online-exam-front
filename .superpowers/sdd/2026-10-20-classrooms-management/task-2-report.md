# Task 2 Report: Backend Classrooms DTOs, Repository & Service

## 1. Tổng Quan Công Việc Đã Thực Hiện
Đã hoàn thành toàn bộ công việc của Task 2 theo đúng quy trình TDD (Test-Driven Development):
1. **Viết unit test failing**: Tạo [classrooms.service.spec.ts](file:///d:/online-exam-api/src/classrooms/classrooms.service.spec.ts) bao phủ toàn bộ nghiệp vụ.
2. **Chạy test xác nhận FAIL**: Kiểm tra `npm test -- src/classrooms/classrooms.service.spec.ts` thất bại vì module chưa tồn tại.
3. **Cài đặt DTOs**:
   - [create-classroom.dto.ts](file:///d:/online-exam-api/src/classrooms/dto/create-classroom.dto.ts): validate `name` (100 ký tự, trimmed), `description` (optional, 300 ký tự), `password` (50 ký tự, trimmed).
   - [join-classroom.dto.ts](file:///d:/online-exam-api/src/classrooms/dto/join-classroom.dto.ts): validate `code` (trimmed, uppercase), `password` (trimmed).
4. **Cài đặt Repository**:
   - [classrooms.repository.ts](file:///d:/online-exam-api/src/classrooms/classrooms.repository.ts): Tương tác Prisma cho `Classroom` và `ClassroomMember` (`create`, `findByCode`, `findById`, `findManaged`, `findJoined`, `findMember`, `addMember`, `findMembers`, `removeMember`, `countExams`, `deleteClassroom`).
5. **Cài đặt Service**:
   - [classrooms.service.ts](file:///d:/online-exam-api/src/classrooms/classrooms.service.ts):
     - Sinh mã ngẫu nhiên 6 ký tự từ bảng ký tự `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (loại trừ `0, O, 1, I` chống nhầm lẫn).
     - Cơ chế retry tối đa 5 lần nếu trùng mã lớp; ném `ConflictException` nếu vượt quá retry.
     - Kiểm tra tồn tại mã lớp (`NotFoundException('Mã lớp không tồn tại')`), so khớp mật khẩu (`BadRequestException('Mật khẩu lớp không chính xác')`), kiểm tra trùng lặp thành viên (`ConflictException('Bạn đã tham gia lớp học này rồi')`).
     - Chặn xóa lớp học khi đã có đề thi (`ConflictException('Không thể xóa lớp học đã có đề thi hoặc bài làm')`).
     - Xác thực quyền sở hữu của manager (`ForbiddenException('Bạn không có quyền quản lý lớp học này')`) khi xóa thành viên hoặc xóa lớp.
6. **Chạy test xác nhận PASS**:
   - `npm test -- src/classrooms/classrooms.service.spec.ts`: 22/22 unit tests passed (100%).
7. **Kiểm tra hồi quy toàn diện**:
   - `npm test`: Toàn bộ 6/6 test suites passed (69/69 tests).
   - `npm run build`: NestJS build thành công không có lỗi type.
8. **Commit**: Đã commit thay đổi vào repo `d:\online-exam-api`.

---

## 2. Chi Tiết Các File Triển Khai

### 2.1. `src/classrooms/dto/create-classroom.dto.ts`
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateClassroomDto {
  @ApiProperty({ example: 'Lớp 10A1', maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Lớp Toán nâng cao', maxLength: 300 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(300)
  description?: string;

  @ApiProperty({ example: '123456', maxLength: 50 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  password: string;
}
```

### 2.2. `src/classrooms/dto/join-classroom.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class JoinClassroomDto {
  @ApiProperty({ example: 'ABC234', description: 'Mã lớp 6 ký tự' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: '123456', description: 'Mật khẩu lớp' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  password: string;
}
```

### 2.3. `src/classrooms/classrooms.repository.ts`
Chứa các query Prisma:
- `create`: Tạo classroom kết nối với `managerId`.
- `findByCode`: Tìm classroom theo unique code kèm `manager` và `_count: { members, exams }`.
- `findById`: Tìm classroom theo ID kèm `manager` và `_count: { members, exams }`.
- `findManaged`: Lấy danh sách lớp do manager quản lý sắp xếp giảm dần theo thời gian tạo.
- `findJoined`: Lấy danh sách lớp học sinh đã tham gia (join qua `ClassroomMember`), kèm thông tin công khai của manager và số lượng thành viên/đề thi.
- `findMember`: Tìm membership cụ thể theo composite `[classroomId, userId]`.
- `addMember`: Thêm user vào lớp.
- `findMembers`: Lấy danh sách thành viên trong lớp kèm `id`, `fullName`, `email`, `avatar`, `role`, `joinedAt`.
- `removeMember`: Xóa thành viên khỏi lớp (`deleteMany`).
- `countExams`: Đếm số lượng đề thi của lớp.
- `deleteClassroom`: Xóa các membership trước rồi xóa classroom.

### 2.4. `src/classrooms/classrooms.service.ts`
Cung cấp nghiệp vụ:
- Hằng số `CLASSROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`.
- Phương thức `generateCode(length = 6)`.
- `create(managerId, dto)`: Sinh code ngẫu nhiên, kiểm tra chống trùng 5 lần, lưu lớp.
- `join(userId, dto)`: Chuẩn hóa code (uppercase + trim), kiểm tra mã lớp, kiểm tra mật khẩu, kiểm tra đã là thành viên chưa, ghi nhận tham gia.
- `findManaged(managerId)`: Trả về danh sách lớp quản lý.
- `findJoined(userId)`: Trả về danh sách lớp đã tham gia.
- `findById(classroomId)`: Chi tiết lớp (ném 404 nếu không tìm thấy).
- `findMembers(classroomId)`: Danh sách học sinh trong lớp (ném 404 nếu lớp không tồn tại).
- `removeMember(classroomId, memberUserId, managerId)`: Xác thực quyền quản lý lớp, xóa học sinh khỏi lớp.
- `deleteClassroom(classroomId, managerId)`: Xác thực quyền quản lý lớp, kiểm tra nếu `examCount > 0` thì ném `ConflictException`, xóa lớp an toàn.

---

## 3. Kết Quả Kiểm Thử & Xác Minh (Verification)

### 3.1. TDD Failing Step
```bash
> node --experimental-vm-modules node_modules/jest/bin/jest.js src/classrooms/classrooms.service.spec.ts
FAIL src/classrooms/classrooms.service.spec.ts
Cannot find module './classrooms.service' from 'src/classrooms/classrooms.service.spec.ts'
```

### 3.2. Unit Test Suite Sau Khi Cài Đặt
```bash
PASS src/classrooms/classrooms.service.spec.ts
  ClassroomsService
    generateCode
      √ should generate a 6-character code using allowed characters (212 ms)
    create
      √ should generate code and create classroom with trimmed values (4 ms)
      √ should retry code generation when collision occurs and succeed (2 ms)
      √ should throw ConflictException if code generation collides 5 times (17 ms)
    join
      √ should throw NotFoundException if classroom code does not exist (2 ms)
      √ should throw BadRequestException if password is incorrect (1 ms)
      √ should throw ConflictException if user is already a member (2 ms)
      √ should add member and return joined classroom details on success (2 ms)
    findManaged
      √ should return classrooms owned by manager (1 ms)
    findJoined
      √ should return classrooms joined by student with manager info and counts (1 ms)
    findById
      √ should return classroom if found (2 ms)
      √ should throw NotFoundException if classroom not found (2 ms)
    findMembers
      √ should throw NotFoundException if classroom does not exist (1 ms)
      √ should return member list when classroom exists (1 ms)
    removeMember
      √ should throw NotFoundException if classroom not found (1 ms)
      √ should throw ForbiddenException if user is not manager of the classroom (1 ms)
      √ should remove member when caller is the manager (1 ms)
    deleteClassroom
      √ should throw NotFoundException if classroom not found (2 ms)
      √ should throw ForbiddenException if caller is not the owner manager (1 ms)
      √ should throw ConflictException if classroom has exams (_count.exams > 0) (1 ms)
      √ should throw ConflictException if countExams returns > 0 when _count not present (2 ms)
      √ should delete classroom when 0 exams and caller is manager (1 ms)

Test Suites: 1 passed, 1 total
Tests:       22 passed, 22 total
```

### 3.3. Toàn Bộ Test Suite API (`npm test`)
```bash
PASS src/exams/exam-write-conflict.spec.ts
PASS src/exams/exam-schedule-reopen.spec.ts
PASS src/attempts/attempts.repository.spec.ts
PASS src/classrooms/classrooms.service.spec.ts
PASS src/app.controller.spec.ts
PASS src/auth/auth.spec.ts (5.778 s)

Test Suites: 6 passed, 6 total
Tests:       69 passed, 69 total
Snapshots:   0 total
Time:        6.568 s
```

### 3.4. TypeScript Compile / Build (`npm run build`)
```bash
> online-exam-api@0.0.1 build
> nest build
Exit code: 0
```

---

## 4. Chi Tiết Git Commit
- **Commit Hash**: `bbc8f06c46e9add520c771945bfd35cc30a857c4`
- **Commit Message**: `feat(api): implement Classrooms repository and service with unit tests`
- **Files**:
  - `src/classrooms/classrooms.repository.ts`
  - `src/classrooms/classrooms.service.spec.ts`
  - `src/classrooms/classrooms.service.ts`
  - `src/classrooms/dto/create-classroom.dto.ts`
  - `src/classrooms/dto/join-classroom.dto.ts`
- **Stats**: 5 files changed, 825 insertions(+).

---

## 5. Self-Review
- [x] Đã đáp ứng đúng toàn bộ 12 yêu cầu và quy tắc nghiệp vụ trong `task-2-brief.md`.
- [x] Không can thiệp vào các thay đổi chưa stage của các file khác trong repo.
- [x] Mã nguồn sạch sẽ, tuân thủ đúng kiến trúc Dependency Injection của NestJS và Prisma Client.
- [x] 100% test passing, không có hồi quy.
