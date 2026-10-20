### Task 1: Mở Rộng Schema Prisma & Đồng Bộ Database

**Files:**
- Modify: `d:\online-exam-api\prisma\schema.prisma`

**Interfaces:**
- Produces: `Classroom`, `ClassroomMember`, trường `classroomId` trong `Exam`

- [ ] **Step 1: Cập nhật `schema.prisma`**
Thêm model `Classroom`, `ClassroomMember`, và liên kết quan hệ trong `User` và `Exam`:
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
  @@index([code])
}

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
Và trong `Exam`:
```prisma
  classroomId String?    @db.ObjectId
  classroom   Classroom? @relation(fields: [classroomId], references: [id])

  @@index([classroomId])
```
Và trong `User`:
```prisma
  managedClassrooms Classroom[]       @relation("ManagerClassrooms")
  classroomMembers  ClassroomMember[]
```

- [ ] **Step 2: Chạy `npx prisma generate` và cập nhật Docker**
Run: `cd d:\online-exam-api; npx prisma generate`
Run: `docker compose up -d`
Expected: Prisma Client được sinh mới có `Classroom` và `ClassroomMember`.

- [ ] **Step 3: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat(api): add Classroom and ClassroomMember models to schema"
```
