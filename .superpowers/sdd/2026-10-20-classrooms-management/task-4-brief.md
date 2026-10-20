### Task 4: Frontend API Client Cho Classrooms

**Files:**
- Create: `d:\online-exam-front\src\api\classrooms.ts`
- Modify: `d:\online-exam-front\src\api\exams.ts` (thêm `classroomId?: string | null`)
- Modify: `d:\online-exam-front\src\api\manager-exams.ts` (thêm `classroomId?: string | null` vào Exam và Create payload nếu có)

**Interfaces:**
- Produces: `classroomsApi` và các kiểu dữ liệu `Classroom`, `ClassroomMember`, `CreateClassroomPayload`, `JoinClassroomPayload`.

**Requirements:**
1. In `src/api/classrooms.ts`:
   - Import `api` from `./axios`.
   - Define and export interfaces:
     ```ts
     export interface ClassroomManager {
       id: string
       fullName: string
       email: string
       avatar?: string | null
     }

     export interface Classroom {
       id: string
       name: string
       code: string
       description?: string | null
       password?: string
       managerId: string
       manager?: ClassroomManager
       memberCount?: number
       examCount?: number
       createdAt: string
       updatedAt: string
       joinedAt?: string
     }

     export interface ClassroomMember {
       id: string
       userId: string
       fullName: string
       email: string
       avatar?: string | null
       role: string
       joinedAt: string
     }

     export interface CreateClassroomPayload {
       name: string
       description?: string
       password: string
     }

     export interface JoinClassroomPayload {
       code: string
       password: string
     }
     ```
   - Define and export `classroomsApi` methods using `api`:
     - `create(payload: CreateClassroomPayload): Promise<Classroom>` -> `POST /classrooms`
     - `getManaged(): Promise<Classroom[]>` -> `GET /classrooms/managed` (handle `{ items }` or raw array)
     - `getJoined(): Promise<Classroom[]>` -> `GET /classrooms/joined` (handle `{ items }` or raw array)
     - `getDetail(id: string): Promise<Classroom>` -> `GET /classrooms/${id}`
     - `join(payload: JoinClassroomPayload): Promise<Classroom>` -> `POST /classrooms/join`
     - `getMembers(id: string): Promise<ClassroomMember[]>` -> `GET /classrooms/${id}/members` (handle `{ items }` or raw array)
     - `getExams(id: string): Promise<any[]>` -> `GET /classrooms/${id}/exams`
     - `removeMember(classroomId: string, userId: string): Promise<void>` -> `DELETE /classrooms/${classroomId}/members/${userId}`
     - `deleteClassroom(id: string): Promise<void>` -> `DELETE /classrooms/${id}`
2. In `src/api/exams.ts` and `src/api/manager-exams.ts`:
   - Add `classroomId?: string | null` to `Exam` / `ExamDetail` / `ManagerExamDetail` interfaces.
   - Add `classroomId?: string` to create exam payloads.
3. Verification:
   - Run `npm run build` in `d:\online-exam-front`. Must compile with zero TypeScript errors.

- [ ] **Step 1: Implement `src/api/classrooms.ts` and update exam types**
- [ ] **Step 2: Run `npm run build` to verify compilation**
- [ ] **Step 3: Commit**
```bash
git add src/api/
git commit -m "feat(front): add classrooms API client and exam type mappings"
```
