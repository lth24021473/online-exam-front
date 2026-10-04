import { expect, test as base } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

const tokenKey = 'online-exam.access-token'
const token = 'mock-admin-token'
type Role = 'STUDENT' | 'EXAM_MANAGER' | 'ADMIN'
type User = {
  id: string; email: string; fullName: string; role: Role; createdAt: string; updatedAt: string
}
const currentAdmin: User = {
  id: '67000aaaaaaaaaaaaaaaaaaa', email: 'admin@example.com', fullName: 'Nguyễn Quản Trị', role: 'ADMIN',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
}
const student: User = {
  ...currentAdmin, id: '67000bbbbbbbbbbbbbbbbbbb', email: 'learner@example.com', fullName: 'Trần Học Viên', role: 'STUDENT',
}
const manager: User = {
  ...currentAdmin, id: '67000ccccccccccccccccccc', email: 'manager@example.com', fullName: 'Lê Quản Lý', role: 'EXAM_MANAGER',
}
type Call = { key: string; body: unknown; authorization?: string }
type ApiMock = {
  calls: Call[]
  role: Role
  users: User[]
  handle: (key: string, handler: (route: Route) => Promise<void>) => void
}

const test = base.extend<{ api: ApiMock }>({
  api: [async ({ page }, use) => {
    const overrides = new Map<string, (route: Route) => Promise<void>>()
    const unexpected: string[] = []
    const api: ApiMock = {
      calls: [], role: 'ADMIN', users: [currentAdmin, student, manager].map((user) => ({ ...user })),
      handle: (key, handler) => overrides.set(key, handler),
    }
    // Seed once per browser context so navigating after a session is invalidated
    // cannot accidentally restore the token under test.
    await page.addInitScript(({ key, value }) => {
      if (!sessionStorage.getItem('admin-test-session-seeded')) {
        localStorage.setItem(key, value)
        sessionStorage.setItem('admin-test-session-seeded', 'true')
      }
    }, { key: tokenKey, value: token })

    // Every backend call is intercepted. This suite never changes real accounts.
    await page.route('http://localhost:3000/api/v1/**', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: {
          'access-control-allow-origin': 'http://localhost:5173',
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
        } })
        return
      }
      const path = new URL(request.url()).pathname.replace('/api/v1', '')
      const key = `${request.method()} ${path}`
      api.calls.push({ key, body: request.postDataJSON(), authorization: request.headers().authorization })
      const override = overrides.get(key)
      if (override) { await override(route); return }
      if (key === 'GET /users/me') {
        await route.fulfill({ json: { ...currentAdmin, role: api.role } })
        return
      }
      if (key === 'POST /auth/logout') {
        await route.fulfill({ status: 204 })
        return
      }
      if (key === 'GET /attempts') {
        await route.fulfill({ json: { items: [], meta: { page: 1, limit: 6, total: 0, totalPages: 0 } } })
        return
      }
      if (key === 'GET /exams') {
        await route.fulfill({ json: [] })
        return
      }
      if (key === 'GET /admin/users') {
        await route.fulfill({ json: api.users })
        return
      }
      const userId = path.split('/')[3]
      const selected = api.users.find((user) => user.id === userId)
      if (selected && key === `GET /admin/users/${userId}`) {
        await route.fulfill({ json: selected })
        return
      }
      if (selected && key === `PATCH /admin/users/${userId}/role`) {
        const { role } = request.postDataJSON() as { role: Role }
        selected.role = role
        selected.updatedAt = new Date().toISOString()
        await route.fulfill({ json: selected })
        return
      }
      if (selected && key === `DELETE /admin/users/${userId}`) {
        api.users = api.users.filter((user) => user.id !== userId)
        await route.fulfill({ status: 204 })
        return
      }
      unexpected.push(key)
      await route.fulfill({ status: 501, json: { message: 'Unexpected mocked admin endpoint' } })
    })
    await use(api)
    expect(unexpected, 'Every backend request must have an explicit mock').toEqual([])
  }, { auto: true }],
})

const adminCalls = (api: ApiMock) => api.calls.filter((call) => call.key.includes('/admin/'))
const mutationCalls = (api: ApiMock) => adminCalls(api).filter((call) => !call.key.startsWith('GET '))
const reply = (status: number, json: unknown) => async (route: Route) => route.fulfill({ status, json })

async function openAdmin(page: Page) {
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Quản lý tài khoản', exact: true })).toBeVisible()
}

async function selectUser(page: Page, user: User) {
  await page.getByRole('button', { name: `Xem ${user.email}`, exact: true }).click()
  await expect(page.getByRole('heading', { name: user.fullName, exact: true })).toBeVisible()
  await expect(page.getByLabel('Vai trò', { exact: true })).toHaveValue(user.role)
}

async function expectSessionEnded(page: Page) {
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào Tracnghiem.com' })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBeNull()
}

async function captureAdminPreview(page: Page, path: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))
  expect(dimensions.width, 'The admin page must fit the viewport without horizontal scrolling').toBeLessThanOrEqual(dimensions.viewport)
  await page.screenshot({ path, fullPage: true, clip: {
    x: 0, y: 0, width: dimensions.width, height: dimensions.height,
  } })
}

test('admin profile has the correct role and navigation; user role changes persist after reloading', async ({ page, api }) => {
  await page.goto('/profile')
  await expect(page.getByText('Quản trị viên', { exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Quản trị', exact: true }).click()
  await expect(page).toHaveURL('/admin/users')
  await expect(page.getByRole('heading', { name: 'Quản lý tài khoản', exact: true })).toBeVisible()
  await selectUser(page, student)
  await page.getByLabel('Vai trò', { exact: true }).selectOption('EXAM_MANAGER')
  await page.getByRole('button', { name: 'Lưu vai trò', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận đổi vai trò', exact: true }).click()
  await expect.poll(() => api.users.find((user) => user.id === student.id)?.role).toBe('EXAM_MANAGER')
  await expect(page.getByRole('status')).toContainText('vai trò')
  expect(mutationCalls(api)).toEqual([{
    key: `PATCH /admin/users/${student.id}/role`, body: { role: 'EXAM_MANAGER' }, authorization: `Bearer ${token}`,
  }])
  await page.reload()
  await selectUser(page, { ...student, role: 'EXAM_MANAGER' })
  expect(adminCalls(api).every((call) => call.authorization === `Bearer ${token}`)).toBe(true)
  await captureAdminPreview(page, 'test-results/admin-accounts-desktop.png')
  await page.setViewportSize({ width: 320, height: 900 })
  await expect(page.getByRole('heading', { name: student.fullName, exact: true })).toBeVisible()
  await captureAdminPreview(page, 'test-results/admin-accounts-mobile.png')
})

test('deleting another account requires explicit confirmation and refreshes the list', async ({ page, api }) => {
  await openAdmin(page)
  await selectUser(page, student)
  await page.getByRole('button', { name: 'Xóa tài khoản', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(student.email)
  expect(mutationCalls(api)).toEqual([])
  await dialog.getByRole('button', { name: 'Giữ tài khoản', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(mutationCalls(api)).toEqual([])
  await page.getByRole('button', { name: 'Xóa tài khoản', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận xóa', exact: true }).click()
  await expect(page.getByRole('button', { name: `Xem ${student.email}`, exact: true })).toHaveCount(0)
  expect(api.users.some((user) => user.id === student.id)).toBe(false)
  expect(mutationCalls(api)).toEqual([{
    key: `DELETE /admin/users/${student.id}`, body: null, authorization: `Bearer ${token}`,
  }])
})

for (const role of ['STUDENT', 'EXAM_MANAGER'] as const) {
  test(`${role} cannot open the administration route or trigger admin requests`, async ({ page, api }) => {
    api.role = role
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: /quản trị/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Quản trị', exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Vai trò', { exact: true })).toHaveCount(0)
    expect(adminCalls(api)).toEqual([])
    expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBe(token)
  })
}

test('a failed role change keeps the original role and can be retried', async ({ page, api }) => {
  let failed = false
  api.handle(`PATCH /admin/users/${student.id}/role`, async (route) => {
    if (!failed) {
      failed = true
      await route.fulfill({ status: 500, json: { message: 'Role update failed' } })
      return
    }
    const selected = api.users.find((user) => user.id === student.id)!
    selected.role = 'EXAM_MANAGER'
    await route.fulfill({ json: selected })
  })
  await openAdmin(page)
  await selectUser(page, student)
  await page.getByLabel('Vai trò', { exact: true }).selectOption('EXAM_MANAGER')
  await page.getByRole('button', { name: 'Lưu vai trò', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận đổi vai trò', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(api.users.find((user) => user.id === student.id)?.role).toBe('STUDENT')
  await page.getByRole('button', { name: 'Lưu vai trò', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận đổi vai trò', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('vai trò')
  expect(mutationCalls(api).map((call) => call.body)).toEqual([{ role: 'EXAM_MANAGER' }, { role: 'EXAM_MANAGER' }])
})

test('a pending role update prevents repeated submission', async ({ page, api }) => {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  api.handle(`PATCH /admin/users/${student.id}/role`, async (route) => {
    await pending
    await route.fulfill({ json: { ...student, role: 'EXAM_MANAGER' } })
  })
  await openAdmin(page)
  await selectUser(page, student)
  await page.getByLabel('Vai trò', { exact: true }).selectOption('EXAM_MANAGER')
  await page.getByRole('button', { name: 'Lưu vai trò', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận đổi vai trò', exact: true }).click()
  try {
    await expect.poll(() => mutationCalls(api).length).toBe(1)
    await expect(page.getByLabel('Vai trò', { exact: true })).toBeDisabled()
    await expect(page.getByRole('dialog').getByRole('button', { name: /Đang/ })).toBeDisabled()
  } finally { release() }
  await expect(page.getByRole('status')).toContainText('vai trò')
  expect(mutationCalls(api)).toHaveLength(1)
})

test('changing the current admin role ends the local session', async ({ page, api }) => {
  await openAdmin(page)
  await selectUser(page, currentAdmin)
  await page.getByLabel('Vai trò', { exact: true }).selectOption('STUDENT')
  await page.getByRole('button', { name: 'Lưu vai trò', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận đổi vai trò', exact: true }).click()
  await expectSessionEnded(page)
  await expect(page.getByRole('alert')).toContainText('Vai trò của bạn đã thay đổi')
  expect(mutationCalls(api)).toEqual([{
    key: `PATCH /admin/users/${currentAdmin.id}/role`, body: { role: 'STUDENT' }, authorization: `Bearer ${token}`,
  }])

  api.role = 'STUDENT'
  api.handle('POST /auth/login', reply(200, {
    accessToken: 'fresh-student-token', user: { ...currentAdmin, role: 'STUDENT' },
  }))
  await page.getByLabel('Địa chỉ email', { exact: true }).fill(currentAdmin.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('AdminPass123')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByRole('link', { name: 'Quản trị', exact: true })).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBe('fresh-student-token')
})

test('deleting the current account ends the session only after confirmation', async ({ page, api }) => {
  await openAdmin(page)
  await selectUser(page, currentAdmin)
  await page.getByRole('button', { name: 'Xóa tài khoản', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(currentAdmin.email)
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBe(token)
  expect(mutationCalls(api)).toEqual([])
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận xóa', exact: true }).click()
  await expectSessionEnded(page)
  await expect(page.getByRole('alert')).toContainText('Tài khoản của bạn đã được xóa')
  expect(mutationCalls(api)).toEqual([{
    key: `DELETE /admin/users/${currentAdmin.id}`, body: null, authorization: `Bearer ${token}`,
  }])
})

test('changed admin permissions end the session with a translated reason on login', async ({ page, api }) => {
  api.handle('GET /admin/users', reply(401, { message: 'Account permissions have changed. Please sign in again' }))
  await page.goto('/admin/users')
  await expectSessionEnded(page)
  await expect(page.getByRole('alert')).toContainText('Quyền tài khoản đã thay đổi')
  await expect(page.getByLabel('Vai trò', { exact: true })).toHaveCount(0)
  expect(mutationCalls(api)).toEqual([])
})

test('admin cannot enter student-only attempt, result, or history routes', async ({ page, api }) => {
  for (const path of [
    '/history',
    '/exams/670001111111111111111111/take',
    '/attempts/670002222222222222222222/result',
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Chức năng dành cho học sinh', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Lịch sử', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Quản trị', exact: true })).toBeVisible()
  }
  expect(api.calls.every((call) => call.key === 'GET /users/me')).toBe(true)
  expect(mutationCalls(api)).toEqual([])
})

test('admin catalog shows drafts and closed exams and detail counts questions from the backend array', async ({ page, api }) => {
  const published = {
    id: '670001111111111111111111', title: 'Đề đã mở', status: 'PUBLISHED',
    durationMinutes: 15, description: 'Bài kiểm tra kiến thức.', instructions: 'Chọn một đáp án.',
    _count: { questions: 3 },
  }
  const draft = { ...published, id: '670002222222222222222222', title: 'Đề bản nháp', status: 'DRAFT' }
  const closed = { ...published, id: '670003333333333333333333', title: 'Đề đã đóng', status: 'CLOSED' }
  api.handle('GET /exams', reply(200, [draft, published, closed]))
  api.handle(`GET /exams/${published.id}`, reply(200, {
    ...published, _count: undefined,
    questions: [
      { id: 'question-one', content: 'Câu hỏi một', position: 1 },
      { id: 'question-two', content: 'Câu hỏi hai', position: 2 },
      { id: 'question-three', content: 'Câu hỏi ba', position: 3 },
    ],
  }))
  await page.goto('/exams')
  for (const exam of [draft, published, closed]) {
    await expect(page.getByRole('heading', { name: exam.title, exact: true })).toBeVisible()
  }
  await page.locator('article').filter({ has: page.getByRole('heading', { name: published.title, exact: true }) })
    .getByRole('link', { name: 'Xem đề thi' }).click()
  await expect(page.getByRole('heading', { name: published.title, exact: true })).toBeVisible()
  await expect(page.getByText('3 câu', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Bắt đầu / Tiếp tục bài', exact: true })).toHaveCount(0)
  expect(mutationCalls(api)).toEqual([])
})

test('deleting an account that owns exams or attempts shows the translated conflict and preserves the account', async ({ page, api }) => {
  api.handle(`DELETE /admin/users/${student.id}`, reply(409, {
    message: 'User cannot be deleted while they own exams or attempts',
  }))
  await openAdmin(page)
  await selectUser(page, student)
  await page.getByRole('button', { name: 'Xóa tài khoản', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận xóa', exact: true }).click()

  await expect(page.getByRole('alert')).toHaveText('Không thể xóa tài khoản đang có đề thi hoặc bài làm. Hãy giữ tài khoản hoặc thay đổi vai trò phù hợp.')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: `Xem ${student.email}`, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: student.fullName, exact: true })).toBeVisible()
  expect(api.users.find((user) => user.id === student.id)).toEqual(student)
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBe(token)
  expect(mutationCalls(api)).toEqual([{
    key: `DELETE /admin/users/${student.id}`, body: null, authorization: `Bearer ${token}`,
  }])

  // The failure releases the controls so the admin can retry or keep the account.
  await expect(page.getByRole('button', { name: 'Xóa tài khoản', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Xóa tài khoản', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Xác nhận xóa', exact: true })).toBeEnabled()
  await page.getByRole('dialog').getByRole('button', { name: 'Giữ tài khoản', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(mutationCalls(api)).toHaveLength(1)
})
