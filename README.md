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
| URL khác | Trang 404 | Công khai |

Trang `/profile` mặc định dùng tông màu sáng đồng bộ với trang chủ: ảnh bìa, avatar tròn và năm tab **Giới thiệu / Lớp học / Nhiệm vụ / Chỉnh sửa tài khoản / Cài đặt**. Các nút chọn và xóa ảnh bìa nằm trong tab **Chỉnh sửa tài khoản**; xóa ảnh sẽ trở về ảnh mặc định. Tab hiện tại lưu trong query `?tab=about`, `classes`, `tasks`, `edit` hoặc `settings`, nên có thể mở trực tiếp và tải lại. Lớp học và Nhiệm vụ hiện là trạng thái chưa có dữ liệu vì backend chưa có API tương ứng. Avatar và ảnh bìa hỗ trợ PNG/JPG/WebP tối đa 2 MB mỗi ảnh; hai ảnh được lưu riêng theo người dùng trên trình duyệt, chưa đồng bộ lên backend.

Tab **Chỉnh sửa tài khoản** gồm tên tài khoản, nơi làm việc, nơi ở hiện tại và các nút đổi avatar/ảnh bìa. **Lưu thay đổi** lưu các trường văn bản; **Hủy thay đổi** khôi phục các trường này về dữ liệu đã lưu. Chọn ảnh sẽ lưu ảnh ngay. Tên mới được dùng ở hồ sơ, lời chào trang chủ và footer; nơi làm việc/nơi ở xuất hiện trong Giới thiệu. Backend trong ZIP chưa có API cập nhật tài khoản, nên thông tin chỉnh sửa lưu tại `online-exam.profile.<id>` trên trình duyệt, tách theo từng tài khoản. Lưu thất bại sẽ báo lỗi và giữ thông tin đang hiển thị.

Trong **Cài đặt → Giao diện**, công tắc **Chế độ tối** đổi màu nền, chữ và thẻ nội dung cho toàn ứng dụng. Mặc định là giao diện sáng; lựa chọn bật/tắt được lưu tại `online-exam.theme` trên trình duyệt và giữ khi chuyển trang hoặc tải lại.

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

Backend trong ZIP chưa có API đề thi hoặc khôi phục mật khẩu. Trang chủ đang hiển thị trạng thái chưa có đề thi; trang quên mật khẩu thông báo đúng trạng thái hiện tại.

Ảnh nền lưu tại `public/images/study-background.jpg`, dùng được khi không có mạng. Ảnh trùng với tham chiếu thứ hai, lấy từ [nguồn ảnh](https://www.sainaptic.com/post/six-tips-on-how-to-stay-focused-during-gcse-revision). Tùy chỉnh bố cục trong `src/App.css`.

## Kiểm tra

```sh
npm run lint
npm run build
npm run test:e2e
```

Test E2E sử dụng Chrome đã cài trên máy và mock API, không tạo tài khoản hoặc thay đổi dữ liệu backend. Ảnh kiểm tra giao diện nằm trong `test-results/`. Nếu máy không có Chrome, cài Chrome hoặc điều chỉnh `channel` trong `playwright.config.ts`.

Khi triển khai production với `BrowserRouter`, cấu hình máy chủ trả về `index.html` cho các URL frontend để mở trực tiếp hoặc reload `/login`, `/dashboard`, `/profile`.
