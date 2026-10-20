import { test, expect } from '@playwright/test';
import axios from 'axios';

test('Hai trình duyệt (Chrome và Edge) đồng bộ hồ sơ, tên, nơi ở, nơi làm việc và ảnh đại diện thời gian thực qua MongoDB backend', async ({ browser }) => {
  const email = `sync-${Date.now()}@example.com`;
  const password = 'Password123!';
  const initialName = 'Học Viên Thử Nghiệm';

  // 1. Đăng ký tài khoản trên backend MongoDB thật
  const regRes = await axios.post('http://localhost:3000/api/v1/auth/register', {
    email,
    password,
    fullName: initialName,
  });
  const token = regRes.data.accessToken;

  // 2. Mở Context 1 (giả lập Chrome) và Context 2 (giả lập Edge)
  const contextChrome = await browser.newContext();
  const pageChrome = await contextChrome.newPage();

  const contextEdge = await browser.newContext();
  const pageEdge = await contextEdge.newPage();

  await pageChrome.addInitScript((tok) => {
    localStorage.setItem('online-exam.access-token', tok);
  }, token);
  await pageEdge.addInitScript((tok) => {
    localStorage.setItem('online-exam.access-token', tok);
  }, token);

  await pageChrome.goto('/profile?tab=edit');
  await pageEdge.goto('/profile');

  // Edge hiển thị tên ban đầu
  await expect(pageEdge.getByRole('heading', { level: 1 })).toContainText(initialName);

  // 3. Trên Chrome: đổi ảnh đại diện, đổi tên, nơi làm việc, nơi ở
  const newName = 'Nguyễn Đồng Bộ Siêu Tốc';
  const newWorkplace = 'Google DeepMind AI';
  const newResidence = 'Hà Nội Việt Nam';

  const avatarBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwrP79HwAFLwKnCwNlfgAAAABJRU5ErkJggg==', 'base64');
  await pageChrome.getByLabel('Chọn ảnh đại diện', { exact: true }).setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: avatarBuffer,
  });

  await pageChrome.getByLabel('Tên tài khoản', { exact: true }).fill(newName);
  await pageChrome.getByLabel('Nơi làm việc', { exact: true }).fill(newWorkplace);
  await pageChrome.getByLabel('Nơi ở hiện tại', { exact: true }).fill(newResidence);
  await pageChrome.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();

  await expect(pageChrome.getByRole('status').filter({ hasText: 'Đã lưu thay đổi tài khoản.' })).toBeVisible();
  await expect(pageChrome.getByRole('heading', { level: 1 })).toContainText(newName);

  // 4. Kiểm tra trên Edge: focus hoặc đợi background interval đồng bộ
  await pageEdge.bringToFront();

  // Edge tự động cập nhật tên mới mà không cần F5
  await expect(pageEdge.getByRole('heading', { level: 1 })).toContainText(newName, { timeout: 10000 });

  // Edge tự động hiển thị ảnh đại diện mới
  const edgeAvatar = pageEdge.locator('.account-avatar img').first();
  await expect(edgeAvatar).toBeVisible({ timeout: 10000 });

  // Edge tab Giới thiệu hiển thị đúng nơi làm việc và nơi ở mới
  const about = pageEdge.locator('#profile-panel-about');
  await expect(about).toContainText(newWorkplace);
  await expect(about).toContainText(newResidence);

  // 5. Thử reload Edge (F5) để kiểm chứng dữ liệu backend bền vững tuyệt đối
  await pageEdge.reload();
  await expect(pageEdge.getByRole('heading', { level: 1 })).toContainText(newName);
  await expect(pageEdge.locator('.account-avatar img').first()).toBeVisible();
  const aboutAfterReload = pageEdge.locator('#profile-panel-about');
  await expect(aboutAfterReload).toContainText(newWorkplace);
  await expect(aboutAfterReload).toContainText(newResidence);

  // Dọn dẹp
  await contextChrome.close();
  await contextEdge.close();
});
