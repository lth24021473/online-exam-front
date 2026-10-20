# Task 1 Report: Mở Rộng Schema Prisma & Đồng Bộ Database

## 1. Tổng Quan Công Việc Đã Thực Hiện
- Đã cập nhật file [schema.prisma](file:///d:/online-exam-api/prisma/schema.prisma) để bổ sung 2 model mới: `Classroom` và `ClassroomMember`.
- Đã cập nhật quan hệ hai chiều giữa `User` và `Classroom` (`managedClassrooms`), `User` và `ClassroomMember` (`classroomMembers`).
- Đã bổ sung trường quan hệ `classroomId` và `classroom` trong model `Exam`, kèm index `@@index([classroomId])`.
- Đã xử lý tinh chỉnh Prisma: bỏ `@@index([code])` dư thừa trên model `Classroom` vì `code String @unique` đã tự động sinh unique index, tránh lỗi Prisma P1012 (`Index already exists in the model`).
- Đã chạy `npx prisma generate` sinh Prisma Client v6.19.3.
- Đã đồng bộ container docker qua `docker compose up -d`.
- Đã kiểm tra TypeScript compilation (`npx tsc --noEmit`) và toàn bộ test suites hiện có (`npm test`).
- Đã commit thay đổi vào git repository `d:\online-exam-api`.

## 2. Chi Tiết Thay Đổi Schema

### Model `Classroom`
```prisma
model Classroom {
  id          String            @id @default(auto()) @map("_id") @db.ObjectId
  name        String
  code        String            @unique
  description String?
  password    String
  managerId   String            @db.ObjectId
  manager     User              @relation("ManagerClassrooms", fields: [managerId], references: [id])
  members     ClassroomMember[]
  exams       Exam[]
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  @@index([managerId])
}
```

### Model `ClassroomMember`
```prisma
model ClassroomMember {
  id          String    @id @default(auto()) @map("_id") @db.ObjectId
  classroomId String    @db.ObjectId
  classroom   Classroom @relation(fields: [classroomId], references: [id], onDelete: Cascade)
  userId      String    @db.ObjectId
  user        User      @relation(fields: [userId], references: [id])
  joinedAt    DateTime  @default(now())

  @@unique([classroomId, userId])
  @@index([userId])
  @@index([classroomId])
}
```

### Quan hệ trong `User`
```prisma
  managedClassrooms Classroom[]       @relation("ManagerClassrooms")
  classroomMembers  ClassroomMember[]
```

### Quan hệ trong `Exam`
```prisma
  classroomId     String?    @db.ObjectId
  classroom       Classroom? @relation(fields: [classroomId], references: [id])

  @@index([classroomId])
```

## 3. Kết Quả Kiểm Chứng (Verification)
1. **`npx prisma generate`**:
   - Status: Success (v6.19.3).
2. **Kiểm tra runtime Prisma Client**:
   - `prisma.classroom`: Defined (`true`).
   - `prisma.classroomMember`: Defined (`true`).
3. **`npx tsc --noEmit`**:
   - Status: Exit code 0, không có lỗi kiểu dữ liệu.
4. **`npm test`**:
   - Test Suites: 5 passed, 5 total.
   - Tests: 47 passed, 47 total.
   - Toàn bộ suite auth, exam write conflict, schedule reopen, attempts repository đều passed.
5. **Docker Compose**:
   - `docker compose up -d`: Containers `online-exam-api-mongo-1` (Healthy) và `online-exam-api-api-1` đang hoạt động bình thường.

## 4. Git Commit
- **Commit hash**: `707fd5b`
- **Commit message**: `feat(api): add Classroom and ClassroomMember models to schema`
- **Files committed**: `prisma/schema.prisma`
