# Tracnghiem.com — Frontend

React + TypeScript + Vite. Layout đăng nhập theo ảnh tham chiếu, ảnh bàn học làm nền, hỗ trợ desktop và điện thoại.

## Chạy dự án

```sh
npm install
```

Tạo `.env` từ `.env.example` nếu chưa có:

```env
VITE_API_URL=http://localhost:3000/api/v1
```

Khởi động backend NestJS tại cổng `3000`, sau đó:

```sh
npm run dev
```

Mở `http://localhost:5173`. Backend cần cho phép CORS với origin này và `credentials: true`, như cấu hình đã thêm trong `main.ts`.

## Layout và router

| URL | Trang | Quyền truy cập |
| --- | --- | --- |
| `/` | Chuyển đến đăng nhập hoặc trang chủ | Tự động theo phiên |
| `/login` | Đăng nhập | Khách |
| `/register` | Tạo tài khoản | Khách |
| `/forgot-password` | Thông báo khôi phục mật khẩu chưa khả dụng | Khách |
| `/dashboard` | Trang chủ | Đã đăng nhập |
| `/profile` | Thông tin tài khoản | Đã đăng nhập |
| `/settings` | Chế độ tối, email hiện tại và đăng xuất | Đã đăng nhập |
| `/exams` | Danh sách đề đang mở, mở đề bằng mã | Đã đăng nhập |
| `/exams/:examId` | Thông tin và hướng dẫn đề thi | Đã đăng nhập |
| `/exams/:examId/take` | Bắt đầu / tiếp tục làm bài | STUDENT |
| `/attempts/:attemptId/result` | Điểm và chi tiết đáp án từ backend | STUDENT |
| `/history` | Lịch sử, lọc trạng thái và phân trang | STUDENT |
| `/manage/exams` | Danh sách, tìm/lọc và tạo đề bản nháp | EXAM_MANAGER, ADMIN |
| `/manage/exams/:examId` | Sửa đề, soạn câu hỏi/đáp án, mở/đóng và xóa đề nháp | Chủ đề EXAM_MANAGER, ADMIN |
| `/manage/exams/:examId/results` | Kết quả học sinh, lọc trạng thái, phân trang và thống kê điểm | Chủ đề EXAM_MANAGER, ADMIN |
| `/admin/users` | Danh sách/chi tiết người dùng, đổi vai trò, xóa tài khoản | ADMIN |
| URL khác | Trang 404 | Công khai |

Trang `/dashboard` có avatar và lời chào, khung gợi ý, minh họa học tập và các tab theo trạng thái. Học viên xem **Đang làm / Hoàn thành / Đã hủy** từ API lịch sử, tiếp tục bài hoặc xem điểm backend. Quản lý đề và ADMIN xem **Đang mở / Bản nháp / Đã đóng** từ API đề thi. Danh sách hỗ trợ phân trang, báo lỗi và thử lại; bố cục thích ứng điện thoại và chế độ tối.

Trang `/profile` mặc định dùng tông màu sáng đồng bộ với trang chủ: ảnh bìa, avatar tròn và bốn tab **Giới thiệu / Lớp học / Nhiệm vụ / Chỉnh sửa tài khoản**. Các nút chọn và xóa ảnh bìa nằm trong tab **Chỉnh sửa tài khoản**; xóa ảnh sẽ trở về ảnh mặc định. Tab hiện tại lưu trong query `?tab=about`, `classes`, `tasks` hoặc `edit`, nên có thể mở trực tiếp và tải lại. Lớp học và Nhiệm vụ hiện là trạng thái chưa có dữ liệu vì backend chưa có API tương ứng. Avatar và ảnh bìa hỗ trợ PNG/JPG/WebP tối đa 2 MB mỗi ảnh; hai ảnh được lưu riêng theo người dùng trên trình duyệt, chưa đồng bộ lên backend.

Tab **Chỉnh sửa tài khoản** gồm tên tài khoản, nơi làm việc, nơi ở hiện tại và các nút đổi avatar/ảnh bìa. **Lưu thay đổi** lưu các trường văn bản; **Hủy thay đổi** khôi phục các trường này về dữ liệu đã lưu. Chọn ảnh sẽ lưu ảnh ngay. Tên mới được dùng ở hồ sơ, lời chào trang chủ và footer; nơi làm việc/nơi ở xuất hiện trong Giới thiệu. Backend trong ZIP chưa có API cập nhật tài khoản, nên thông tin chỉnh sửa lưu tại `online-exam.profile.<id>` trên trình duyệt, tách theo từng tài khoản. Lưu thất bại sẽ báo lỗi và giữ thông tin đang hiển thị.

Trang **Cài đặt** tại `/settings` nằm trên thanh điều hướng cạnh **Tài khoản**, gồm giao diện, email hiện tại và **Đăng xuất tài khoản**. URL cũ `/profile?tab=settings` tự chuyển sang `/settings`, giữ query khác và hash. Trong **Cài đặt → Giao diện**, công tắc **Chế độ tối** đổi màu nền, chữ và thẻ nội dung cho toàn ứng dụng. Mặc định là giao diện sáng; lựa chọn bật/tắt được lưu tại `online-exam.theme` trên trình duyệt và giữ khi chuyển trang hoặc tải lại.

- `src/layouts/AuthLayout.tsx`: header, ảnh nền, giới thiệu và form qua `Outlet`.
- `src/layouts/AppLayout.tsx`: header và điều hướng sau đăng nhập.
- `src/router/AppRouter.tsx`: khai báo route; `ProtectedRoute` và `GuestRoute` kiểm soát phiên.
- `src/api/axios.ts`: URL API, Bearer token, timeout, xử lý lỗi.
- `src/auth/AuthProvider.tsx`: đăng nhập, xác minh phiên khi reload, đăng xuất và đồng bộ giữa tab.

Form đăng nhập gửi `{ email, password }` đến `POST /auth/login`. Form đăng ký gửi `{ fullName, email, password }` đến `POST /auth/register`; mật khẩu xác nhận chỉ kiểm tra ở frontend. Đăng ký thành công chuyển về `/login`, hiển thị thông báo thành công và điền sẵn email. Người dùng tự nhập mật khẩu để đăng nhập; token do API đăng ký trả về không được lưu hoặc dùng để đăng nhập tự động.

Token được lưu trong localStorage và gửi qua header `Authorization: Bearer ...`. `GET /users/me` xác minh phiên khi mở trang. `POST /auth/logout` thu hồi token; frontend cũng xóa phiên khi backend không kết nối được. Người dùng chưa đăng nhập được đưa tới `/login`, rồi quay lại trang đã yêu cầu sau khi xác thực.

## Axios client

Dùng chung instance từ `src/api/axios.ts` khi tạo các module API mới:

```ts
import api, { getApiErrorMessage } from './axios'

export async function loadProfile(signal?: AbortSignal) {
  try {
    const { data } = await api.get('/users/me', { signal })
    return data
  } catch (error) {
    // Có thể hiển thị getApiErrorMessage(error) ở giao diện gọi hàm này.
    console.error(getApiErrorMessage(error))
    throw error
  }
}
```

Client lấy `baseURL` từ `VITE_API_URL`, mặc định `http://localhost:3000/api/v1`, timeout 15 giây và `withCredentials: true`. Token hiện tại được đọc trước mỗi request. Khi API bảo vệ trả `401`, client xóa phiên và router đưa người dùng về đăng nhập; lỗi sai mật khẩu ở login/register không xóa phiên, và lỗi từ request dùng token cũ không xóa token mới.

Gửi object để Axios tạo JSON, hoặc `FormData` để Axios tạo multipart với boundary phù hợp. Không cần tự đặt `Content-Type`. Client giữ nguyên response Axios và lỗi gốc; dùng `getApiErrorMessage(error)` khi cần hiển thị thông báo tiếng Việt. Backend chưa có refresh-token endpoint nên client không tự gọi refresh hoặc gửi lại request.

## Đề thi và làm bài

Backend `main` hiện có API Attempt. Giao diện dùng `POST /exams/:examId/attempts` để bắt đầu/tiếp tục, `PUT /attempts/:attemptId/answers/:questionId` để lưu/đổi đáp án, `POST /attempts/:attemptId/submit`, `DELETE /attempts/:attemptId`, `GET /attempts/:attemptId/result` và `GET /attempts` cho kết quả/lịch sử. Điểm và đáp án đúng chỉ lấy từ response kết quả của backend; frontend không tự chấm điểm.

Đáp án được gửi tuần tự, gộp các thay đổi đang chờ để lần chọn cuối không bị response cũ ghi đè. Mỗi câu có trạng thái đang lưu/đã lưu/lưu lỗi/chờ lưu và nút thử lại. Đáp án chưa gửi được lưu tạm theo tài khoản + mã đề trong trình duyệt và tự gửi khi có mạng. Nộp thủ công đợi đáp án được lưu; nếu vẫn lưu lỗi thì báo lỗi để thử lại. Đồng hồ tính trực tiếp từ `deadlineAt`; rời trang hoặc reload không khởi động lại thời gian. Khi hết giờ, các lựa chọn bị khóa và bài được nộp bằng dữ liệu backend đã nhận. Lỗi mạng khi khôi phục phiên giữ token để thử lại, không cấp quyền trước khi `/users/me` xác minh thành công.

Trước khi tiếp tục bài được lưu trên thiết bị, frontend kiểm tra kết quả của lượt đó; bài đã nộp/hết giờ không vô tình tạo lượt mới. Nộp có xác nhận và khóa gửi lặp; nếu mất response sau khi nộp, frontend kiểm tra kết quả trước khi thử lại. Hủy bài giữ trạng thái trong lịch sử, không chấm điểm. Route làm bài/kết quả/lịch sử chỉ dành cho `STUDENT`.

### Catalog đề thi và metadata demo

Backend hiện có `GET /exams` và `GET /exams/:examId`. Danh sách học viên chỉ hiện PUBLISHED; manager thấy các đề thuộc quyền sở hữu và ADMIN thấy tất cả trạng thái. Adapter nhận mảng hoặc danh sách phân trang và lấy số câu từ `totalQuestions`, `_count.questions` hoặc `questions.length`. Nếu chạy backend cũ chưa có route, chỉ khi trả `404` mới dùng metadata demo cấu hình; lỗi mạng hoặc xác thực luôn được hiển thị. Câu hỏi, đáp án đã chọn, thời hạn và điểm luôn dùng API Attempt thật. Có thể nhập mã đề được giảng viên chia sẻ khi chưa có catalog.

Để có đề demo trên database Docker đang chạy, từ backend chạy:

```sh
docker compose exec api npx prisma db seed
```

Lấy Exam ID được in ra và đặt vào `.env.local` của frontend (không đưa file này lên Git), rồi khởi động lại Vite:

```env
VITE_DEMO_EXAM_ID=<Exam ID từ seed>
VITE_DEMO_EXAM_TITLE=Đề thi Demo - Lập trình cơ bản
VITE_DEMO_EXAM_MINUTES=15
VITE_DEMO_EXAM_QUESTIONS=5
```

Seed giữ dữ liệu đã có. Tài khoản demo nếu được seed tạo mới: `student@example.com / Student123`, `manager@example.com / Manager123`; tài khoản đã tồn tại giữ nguyên mật khẩu của nó.

### Hợp đồng API đề thi

`GET /exams` hiện trả mảng `ExamInfo[]` và frontend phân trang ở trình duyệt. Adapter cũng nhận `{ items: ExamInfo[], meta: { page, limit, total, totalPages } }` nếu backend bổ sung phân trang; học viên gửi `status=PUBLISHED`. `GET /exams/:examId` trả một `ExamInfo`:

```ts
type ExamInfo = {
  id: string
  title: string
  description: string | null
  instructions: string | null
  durationMinutes: number
  totalQuestions: number | null // cũng hỗ trợ questionCount hoặc _count.questions
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
}
```

API detail chỉ trả đáp án đúng cho chủ đề EXAM_MANAGER/ADMIN. STUDENT không nhận khóa đáp án trước khi nộp. Khôi phục mật khẩu và chỉnh sửa hồ sơ lên server thuộc phần mở rộng ngoài pha 1.

Ảnh nền lưu tại `public/images/study-background.jpg`, dùng được khi không có mạng. Ảnh trùng với tham chiếu thứ hai, lấy từ [nguồn ảnh](https://www.sainaptic.com/post/six-tips-on-how-to-stay-focused-during-gcse-revision). Tùy chỉnh bố cục trong `src/App.css`.

## Quản trị tài khoản

Frontend hỗ trợ đủ ba vai trò `STUDENT`, `EXAM_MANAGER`, `ADMIN`; nhãn tiếng Việt dùng chung ở hồ sơ và quản trị. Chỉ ADMIN có liên kết **Quản trị** và truy cập `/admin/users`. Danh sách/chi tiết dùng `GET /admin/users`, `GET /admin/users/:id`; đổi vai trò dùng `PATCH /admin/users/:id/role` với `{ role }`, xóa dùng `DELETE /admin/users/:id`. Hai thao tác đều yêu cầu xác nhận và khóa gửi lặp; lỗi giữ thông tin để thử lại. Thay đổi quyền hoặc xóa tài khoản đang dùng kết thúc phiên ngay trên trình duyệt. Các request dùng JWT cũ bị backend trả 401 sẽ xóa phiên và về đăng nhập, vẫn giữ cơ chế tránh 401 cũ xóa token mới.

Tài khoản ADMIN cần được tạo/cấp quyền bởi backend; frontend không tự cấp quyền. Đăng ký công khai chỉ tạo STUDENT. Màn hình quản lý đề/câu hỏi không nằm trong màn hình quản trị tài khoản này.

## Kiểm tra

```sh
npm run lint
npm run build
npm run test:e2e
```

Test E2E sử dụng Chrome đã cài trên máy và mock API, không tạo tài khoản hoặc thay đổi dữ liệu backend. Ảnh kiểm tra giao diện nằm trong `test-results/`. Nếu máy không có Chrome, cài Chrome hoặc điều chỉnh `channel` trong `playwright.config.ts`.

Kiểm tra với API và MongoDB Docker thật (backend đang chạy cổng 3000, backend nằm cạnh frontend và đã `npm install` / generate Prisma):

```sh
npm run test:e2e:real
```

Runner tạo tài khoản/đề riêng, kiểm tra lưu/đổi đáp án, reload, mất mạng, nộp lặp, hủy giữ đáp án, bài đã hết giờ và đồng hồ tự nộp; sau đó dọn bằng đúng ID đã tạo. Không cần tạo Docker mới. Mặc định dùng Mongo local `mongodb://127.0.0.1:27017/online_exam?replicaSet=rs0&directConnection=true`; có thể đặt `FRONT_BACKEND_DIR` và `REAL_DATABASE_URL` để trỏ đúng backend/database đang phục vụ API. Manifest mặc định nằm trong thư mục temp hệ điều hành; có thể đặt `FRONT_REAL_FIXTURE` để chọn đường dẫn khác. Nếu runner báo cleanup lỗi, giữ manifest và dùng đúng đường dẫn đó để dọn lại (PowerShell):

```powershell
$env:REAL_API_E2E='1'
$env:FRONT_REAL_FIXTURE='C:\duong-dan-manifest\fixture.json'
node tests/fixtures/real-api.cjs cleanup
Remove-Item Env:FRONT_REAL_FIXTURE
Remove-Item Env:REAL_API_E2E
```

Các runner kiểm tra API thật chỉ nhận MongoDB ở `localhost` hoặc `127.0.0.1`, không có credentials trong URL. Manifest ghi ID sở hữu trước khi tạo dữ liệu và được giữ lại nếu cleanup thất bại. Cleanup xác minh tài khoản/đề và từ chối xóa khi có dữ liệu ngoài fixture tham chiếu. Output của runner Attempt/ADMIN nằm trong thư mục riêng dưới `test-results/`.

`attempts-real.spec.ts` được bỏ qua khi chạy bộ mock mặc định.

Kiểm tra ADMIN với API/MongoDB thật: `npm run test:e2e:admin-real`. Runner tạo đúng hai tài khoản kiểm thử ADMIN/STUDENT, dùng UI đổi quyền/xóa tài khoản, xác minh JWT cũ bị từ chối kể cả đổi quyền rồi đổi trở lại, và dọn bằng đúng ID. Manifest tạm ở thư mục temp của hệ điều hành, không tạo Docker hoặc thư mục code trung gian. Có thể đặt `FRONT_BACKEND_DIR`, `REAL_DATABASE_URL`, `FRONT_REAL_API_URL`; nếu test bị ngắt, dùng đường dẫn manifest được runner báo và `REAL_API_E2E=1 FRONT_ADMIN_FIXTURE=<manifest>` để chạy `node tests/fixtures/admin-real-api.cjs cleanup`. Bộ test này được bỏ qua khi chạy test mock mặc định. Nếu cần dọn manifest được giữ lại sau sự cố, trong PowerShell:

```powershell
$env:REAL_API_E2E='1'
$env:FRONT_ADMIN_FIXTURE='C:\duong-dan-manifest\fixture.json'
node tests/fixtures/admin-real-api.cjs cleanup
Remove-Item Env:REAL_API_E2E
Remove-Item Env:FRONT_ADMIN_FIXTURE
```


Khi triển khai production với `BrowserRouter`, cấu hình máy chủ trả về `index.html` cho các URL frontend để mở trực tiếp hoặc reload `/login`, `/dashboard`, `/profile`, `/settings`.

## Quản lý đề thi và kết quả pha 1

EXAM_MANAGER/ADMIN mở **Quản lý đề** trên thanh điều hướng. Tạo bản nháp, sửa tiêu đề/mô tả/hướng dẫn/thời gian, thêm/sửa/xóa câu hỏi và các lựa chọn, chọn đúng một đáp án đúng cho mỗi câu. Vị trí câu hỏi không được trùng. Mở đề cần ít nhất một câu, mỗi câu có ít nhất hai lựa chọn có nội dung và đúng một lựa chọn đúng. Nội dung chỉ sửa khi DRAFT; khi mở đề thì khóa để giữ kết quả chấm ổn định. Đóng đề ngăn lượt làm mới và giữ bài đang làm/kết quả. Xóa đề nháp dọn cả câu hỏi/lựa chọn, có xác nhận và khóa gửi lặp.

**Kết quả học sinh** lấy từ `GET /exams/:examId/results?page=1&limit=10&status=SUBMITTED`. Bảng hiển thị học sinh, trạng thái, thời gian, số đúng/sai và điểm backend trả về. Bộ lọc/phân trang áp dụng vào bảng; tổng lượt/đang làm/đã nộp/đã hủy và trung bình/cao nhất/thấp nhất tính trên toàn đề. Chỉ chủ đề hoặc ADMIN truy cập được. Bài hết giờ được backend chốt/chấm trước khi trả kết quả. Mất mạng báo lỗi/thử lại; giao diện hỗ trợ điện thoại và chế độ tối.

Kiểm tra luồng đầy đủ với API và MongoDB Docker hiện có:

```sh
npm run test:e2e:manager-real
```

Runner tạo hai tài khoản Manager/STUDENT riêng; UI tạo/sửa đề, thêm/sửa/xóa câu hỏi, mở đề; học sinh làm và nộp bài; Manager xem điểm, lọc trạng thái, đóng đề và xóa một đề nháp có câu hỏi. Manifest ghi ID sở hữu trước khi tạo dữ liệu trong thư mục temp hệ điều hành; cleanup chỉ xóa dữ liệu kiểm thử theo các ID đó, giữ manifest nếu cần dọn lại. Không tạo Docker mới. Test chỉ chạy khi `MANAGER_API_E2E=1`, không chạy trong bộ mock mặc định. Sau sự cố, đặt `MANAGER_API_E2E=1` và `FRONT_MANAGER_FIXTURE` bằng đường dẫn manifest runner đã báo, rồi chạy `node tests/fixtures/manager-real-api.cjs cleanup`.
