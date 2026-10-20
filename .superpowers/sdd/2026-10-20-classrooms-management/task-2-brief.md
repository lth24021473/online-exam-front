### Task 2: Backend Classrooms DTOs, Repository & Service

**Files:**
- Create: `d:\online-exam-api\src\classrooms\dto\create-classroom.dto.ts`
- Create: `d:\online-exam-api\src\classrooms\dto\join-classroom.dto.ts`
- Create: `d:\online-exam-api\src\classrooms\classrooms.repository.ts`
- Create: `d:\online-exam-api\src\classrooms\classrooms.service.ts`
- Test: `d:\online-exam-api\src\classrooms\classrooms.service.spec.ts`

**Interfaces:**
- Produces: `ClassroomsService` and `ClassroomsRepository`

**Requirements & Rules:**
1. `CreateClassroomDto`:
   - `name`: string, required, trimmed, maxLength 100
   - `description`: string, optional, maxLength 300
   - `password`: string, required, maxLength 50
2. `JoinClassroomDto`:
   - `code`: string, required, trimmed, uppercase
   - `password`: string, required
3. Code generation in service:
   - 6-character random alphanumeric code using characters: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes confusing `0, O, 1, I`).
   - If duplicate code found in DB, retry up to 5 times.
4. `create(managerId, dto)`:
   - Saves classroom in MongoDB with `managerId`, `name`, `description`, `password`, and generated `code`.
5. `join(userId, dto)`:
   - Normalize `code = dto.code.trim().toUpperCase()`.
   - Find classroom by code. If null, throw `NotFoundException('Mã lớp không tồn tại')`.
   - Compare password. If `classroom.password !== dto.password.trim()`, throw `BadRequestException('Mật khẩu lớp không chính xác')`.
   - Check if already member via `ClassroomMember`. If yes, throw `ConflictException('Bạn đã tham gia lớp học này rồi')`.
   - Create `ClassroomMember` and return joined classroom details.
6. `findManaged(managerId)`:
   - Returns list of classrooms owned by `managerId` with count of members and count of exams.
7. `findJoined(userId)`:
   - Returns list of classrooms where `userId` is a member, including manager public info (`fullName`, `email`, `avatar`), count of members and count of exams.
8. `findById(classroomId)`:
   - Returns classroom details, counts of members and exams.
9. `findMembers(classroomId)`:
   - Returns members with user details (`id`, `fullName`, `email`, `avatar`, `role`, `joinedAt`).
10. `removeMember(classroomId, memberUserId, managerId)`:
   - Verify manager owns classroom. Remove `ClassroomMember`.
11. `deleteClassroom(classroomId, managerId)`:
   - Verify manager owns classroom.
   - Check if classroom has any exams (`examCount > 0`). If yes, throw `ConflictException('Không thể xóa lớp học đã có đề thi hoặc bài làm')`.
   - If 0 exams, delete classroom and cascade members.
12. TDD Unit Tests in `classrooms.service.spec.ts`:
   - Write unit tests mocking `ClassroomsRepository` verifying: code generation, create, join with valid credentials, join with wrong password, join non-existent code, join duplicate, remove member, and deleteClassroom blocked when exams exist.

- [ ] **Step 1: Write failing unit test `classrooms.service.spec.ts`**
- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- src/classrooms/classrooms.service.spec.ts`
- [ ] **Step 3: Implement DTOs, Repository and Service**
- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -- src/classrooms/classrooms.service.spec.ts`
- [ ] **Step 5: Run all API tests to ensure no regressions**
Run: `npm test`
- [ ] **Step 6: Commit**
```bash
git add src/classrooms/
git commit -m "feat(api): implement Classrooms repository and service with unit tests"
```
