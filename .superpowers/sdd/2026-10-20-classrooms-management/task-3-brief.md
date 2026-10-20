### Task 3: Backend Controller, Module & Cô Lập Đề Thi Trong Lớp

**Files:**
- Create: `d:\online-exam-api\src\classrooms\classrooms.controller.ts`
- Create: `d:\online-exam-api\src\classrooms\classrooms.module.ts`
- Modify: `d:\online-exam-api\src\app.module.ts`
- Modify: `d:\online-exam-api\src\exams\dto\create-exam.dto.ts`
- Modify: `d:\online-exam-api\src\exams\exams.controller.ts`
- Modify: `d:\online-exam-api\src\exams\exams.repository.ts`
- Modify: `d:\online-exam-api\src\exams\exams.service.ts`
- Modify: `d:\online-exam-api\src\attempts\attempts.service.ts`
- Test: `d:\online-exam-api\src\classrooms\classrooms-exam-scope.spec.ts`

**Interfaces:**
- Produces: REST endpoints `/api/v1/classrooms/*` and strict exam scope filtering.

**Detailed Requirements:**
1. `ClassroomsController` under `@Controller('classrooms')`, with `@UseGuards(JwtAuthGuard, RolesGuard)`:
   - `POST /classrooms`: `@Roles(Role.EXAM_MANAGER, Role.ADMIN)` -> `create(managerId, dto)`
   - `GET /classrooms/managed`: `@Roles(Role.EXAM_MANAGER, Role.ADMIN)` -> `findManaged(managerId)`
   - `GET /classrooms/joined`: `@Roles(Role.STUDENT, Role.EXAM_MANAGER, Role.ADMIN)` -> `findJoined(userId)`
   - `POST /classrooms/join`: `@Roles(Role.STUDENT, Role.EXAM_MANAGER, Role.ADMIN)` -> `join(userId, dto)`
   - `GET /classrooms/:id`:
     - Fetch classroom. Ensure requester is owner manager, admin, or member.
     - **Security**: If requester is `STUDENT`, strip `password` from response (set to `undefined` or delete).
   - `GET /classrooms/:id/members`:
     - Ensure requester is owner manager, admin, or member. Return members list.
   - `DELETE /classrooms/:id/members/:userId`:
     - `@Roles(Role.EXAM_MANAGER, Role.ADMIN)` -> remove member.
   - `DELETE /classrooms/:id`:
     - `@Roles(Role.EXAM_MANAGER, Role.ADMIN)` -> delete classroom (blocks if exams exist).
   - `GET /classrooms/:id/exams`:
     - Ensure requester is owner manager, admin, or member. Return exams for this classroom.
2. `Exams` Scope Isolation:
   - In `CreateExamDto`: add optional `@IsOptional() @IsString() classroomId?: string`.
   - In `exams.service.ts`:
     - In `create(managerId, dto)`: if `dto.classroomId`, verify manager owns this classroom. If not, throw `ForbiddenException('Bạn không quản lý lớp học này')`.
     - In `getExamById` (or attempt start check): if `exam.classroomId`, verify user is a member of this classroom (or manager of the classroom / admin). If not, throw `ForbiddenException('Đề thi này chỉ dành cho học sinh trong lớp')`.
     - Add `findByClassroom(classroomId: string, userRole: Role)`: returns exams where `classroomId == classroomId`.
   - In `exams.repository.ts`:
     - In `findAll`:
       - If `role === Role.STUDENT`: add `{ OR: [{ classroomId: null }, { classroomId: { isSet: false } }] }` to `where` condition.
       - If `role === Role.EXAM_MANAGER`: add `{ OR: [{ classroomId: null }, { classroomId: { isSet: false } }] }` to `where` condition so class exams do NOT show up on general `/manage/exams`.
       - Class exams MUST ONLY appear in `findByClassroom(classroomId)`.
3. In `attempts.service.ts`:
   - In `createAttempt(userId, examId)`: if exam has `classroomId`, verify `userId` is a member of this classroom (or owner manager / admin). If not, throw `ForbiddenException('Đề thi này chỉ dành cho học sinh trong lớp')`.
4. Register `ClassroomsModule` in `app.module.ts`. Export and import between `ClassroomsModule` and `ExamsModule` cleanly (or inject PrismaService).
5. Comprehensive unit/integration tests in `classrooms-exam-scope.spec.ts`:
   - Verify class exams hidden from student `/exams`
   - Verify class exams hidden from manager `/manage/exams`
   - Verify non-member student blocked from viewing or attempting class exam (403 Forbidden)
   - Verify student password stripped from `GET /classrooms/:id`
   - Verify member student can view and take class exam

- [ ] **Step 1: Write failing test in `classrooms-exam-scope.spec.ts`**
- [ ] **Step 2: Run test to verify it fails**
Run: `npm test -- src/classrooms/classrooms-exam-scope.spec.ts`
- [ ] **Step 3: Implement controller, module, exam scope filter, and guards**
- [ ] **Step 4: Run test to verify it passes**
Run: `npm test -- src/classrooms/classrooms-exam-scope.spec.ts`
- [ ] **Step 5: Run all API tests to ensure no regressions**
Run: `npm test`
- [ ] **Step 6: Rebuild Docker container API**
Run: `docker compose up -d --build api`
- [ ] **Step 7: Commit**
```bash
git add src/
git commit -m "feat(api): implement ClassroomsController and strict exam scope isolation"
```
