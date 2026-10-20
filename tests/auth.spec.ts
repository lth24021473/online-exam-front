import { expect, test as base } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const tokenKey = 'online-exam.access-token'
const token = 'mock-access-token'
const user = {
  id: 'test-student',
  fullName: 'Nguyễn Minh Anh',
  email: 'student@example.com',
  role: 'STUDENT',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}
const session = { accessToken: token, user }
type ApiCall = { key: string; body: unknown; authorization?: string }
type ApiMock = {
  calls: ApiCall[]
  handle: (key: string, handler: (route: Route) => Promise<void>) => void
}

// Every backend request is intercepted. Unexpected endpoints fail the test and
// receive a mock response, so these tests cannot change real backend accounts.
const test = base.extend<{ api: ApiMock }>({
  api: [async ({ page }, use) => {
    const handlers = new Map<string, (route: Route) => Promise<void>>()
    handlers.set('GET /attempts', async (route) => route.fulfill({ json: { items: [], meta: { page: 1, limit: 6, total: 0, totalPages: 0 } } }))
    const calls: ApiCall[] = []
    const unexpected: string[] = []
    await page.route('http://localhost:3000/api/v1/**', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: {
          'access-control-allow-origin': 'http://localhost:5173',
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
        } })
        return
      }
      const key = `${request.method()} ${new URL(request.url()).pathname.replace('/api/v1', '')}`
      calls.push({ key, body: request.postDataJSON(), authorization: request.headers().authorization })
      const handler = handlers.get(key)
      if (handler) await handler(route)
      else {
        unexpected.push(key)
        await route.fulfill({ status: 501, json: { message: 'Unexpected mocked API endpoint' } })
      }
    })
    await use({ calls, handle: (key, handler) => handlers.set(key, handler) })
    expect(unexpected, 'All backend requests must have an explicit mock').toEqual([])
  }, { auto: true }],
})

const reply = (status: number, json: unknown) => async (route: Route) => {
  await route.fulfill(status === 204 ? { status } : { status, json })
}

async function seedSession(page: Page) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: tokenKey, value: token })
}

async function fillLogin(page: Page) {
  await page.getByLabel('Địa chỉ email', { exact: true }).fill('Student@Example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('password123')
}

async function fillRegistration(page: Page, confirmation = 'password123') {
  await page.getByLabel('Họ và tên', { exact: true }).fill('  Nguyễn Minh Anh  ')
  await page.getByLabel('Địa chỉ email', { exact: true }).fill('Student@Example.com')
  await page.getByLabel('Mật khẩu (ít nhất 6 ký tự)', { exact: true }).fill('password123')
  await page.getByLabel('Nhập lại mật khẩu', { exact: true }).fill(confirmation)
}

async function expectNoOverflow(page: Page) {
  // Root dimensions stay in viewport coordinates when the body uses CSS zoom.
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
}

async function capturePreview(page: Page, path: string) {
  // Clip to physical document dimensions; body dimensions are unzoomed.
  const clip = await page.evaluate(() => ({
    x: 0,
    y: 0,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))
  await page.screenshot({ path, fullPage: true, clip })
}

test('public navigation, forgotten-password explanation, and 404 recovery', async ({ page, api }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào Tracnghiem.com' })).toBeVisible()
  await page.getByRole('link', { name: 'Tạo tài khoản mới', exact: true }).click()
  await expect(page).toHaveURL('/register')
  await expect(page.getByRole('heading', { name: 'Tạo tài khoản mới', exact: true })).toBeVisible()
  await page.locator('.auth-switch').getByRole('link', { name: 'Đăng nhập', exact: true }).click()
  await page.getByRole('link', { name: 'Quên mật khẩu?' }).click()
  await expect(page).toHaveURL('/forgot-password')
  await expect(page.getByText(/Tính năng khôi phục mật khẩu hiện chưa khả dụng/)).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
  await page.getByRole('link', { name: 'Quay lại đăng nhập' }).click()
  await expect(page).toHaveURL('/login')
  await page.goto('/route-that-does-not-exist')
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible()
  await page.getByRole('link', { name: 'Về trang chủ' }).click()
  await expect(page).toHaveURL('/login')
  expect(api.calls).toEqual([])
})

test('login preserves a protected destination, query and hash, and sends the exact payload', async ({ page, api }) => {
  api.handle('POST /auth/login', reply(200, session))
  await page.goto('/profile?tab=details#contact')
  await expect(page).toHaveURL('/login')
  await fillLogin(page)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL('/profile?tab=details#contact')
  await expect(page.getByRole('heading', { name: user.fullName })).toBeVisible()
  await expect(page.locator('dd').filter({ hasText: user.email })).toBeVisible()
  expect(api.calls).toEqual([{ key: 'POST /auth/login', body: {
    email: 'student@example.com', password: 'password123',
  }, authorization: undefined }])
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBe(token)
})

test('login prevents repeated submission while loading and translates backend errors', async ({ page, api }) => {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  api.handle('POST /auth/login', async (route) => {
    await pending
    await route.fulfill({ status: 401, json: { message: 'Email or password is incorrect' } })
  })
  await page.goto('/login')
  await fillLogin(page)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  try {
    await expect(page.getByRole('button', { name: 'Đang đăng nhập…' })).toBeDisabled()
    await expect(page.getByLabel('Địa chỉ email', { exact: true })).toBeDisabled()
    await expect(page.getByLabel('Mật khẩu', { exact: true })).toBeDisabled()
    await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true')
    await expect.poll(() => api.calls.length).toBe(1)
  } finally { release() }
  await expect(page.getByRole('alert')).toHaveText('Email hoặc mật khẩu chưa đúng.')
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeEnabled()
  await expect(page).toHaveURL('/login')
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBeNull()
})

test('registration validates confirmation, returns to login, and preserves the protected destination', async ({ page, api }) => {
  api.handle('POST /auth/register', reply(201, { ...session, accessToken: 'registration-token-must-not-be-used' }))
  api.handle('POST /auth/login', reply(200, session))
  await page.goto('/profile?source=registration#account')
  await expect(page).toHaveURL('/login')
  await page.getByRole('link', { name: 'Tạo tài khoản mới', exact: true }).click()
  await fillRegistration(page, 'different123')
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Mật khẩu xác nhận chưa khớp.')
  expect(api.calls).toEqual([])
  await page.getByLabel('Nhập lại mật khẩu', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click()
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('status')).toHaveText('Tạo tài khoản thành công! Vui lòng đăng nhập để tiếp tục.')
  await expect(page.getByLabel('Địa chỉ email', { exact: true })).toHaveValue('student@example.com')
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveValue('')
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBeNull()
  expect(api.calls).toEqual([{ key: 'POST /auth/register', body: {
    fullName: 'Nguyễn Minh Anh', email: 'student@example.com', password: 'password123',
  }, authorization: undefined }])

  await page.getByLabel('Mật khẩu', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL('/profile?source=registration#account')
  await expect(page.getByRole('heading', { name: user.fullName })).toBeVisible()
  expect(api.calls.at(-1)).toEqual({ key: 'POST /auth/login', body: {
    email: 'student@example.com', password: 'password123',
  }, authorization: undefined })
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBe(token)
})

test('direct registration shows success on login without creating an authenticated session', async ({ page, api }) => {
  await page.clock.install({ time: new Date('2026-10-03T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T00:00:01Z'))
  api.handle('POST /auth/register', reply(201, session))
  await page.goto('/register')
  await fillRegistration(page)
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click()
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('status')).toHaveText('Tạo tài khoản thành công! Vui lòng đăng nhập để tiếp tục.')
  await expect(page.getByLabel('Địa chỉ email', { exact: true })).toHaveValue('student@example.com')
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveValue('')
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBeNull()
  await capturePreview(page, 'test-results/registration-success.png')
  await page.clock.runFor(999)
  await expect(page.getByRole('status')).toBeVisible()
  await page.clock.runFor(1)
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.goto('/dashboard')
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào Tracnghiem.com' })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBeNull()
  expect(api.calls.map((call) => call.key)).toEqual(['POST /auth/register'])
})

test('failed registration remains on the form without a success notice or session', async ({ page, api }) => {
  api.handle('POST /auth/register', reply(409, { message: 'Email is already registered' }))
  await page.goto('/register')
  await fillRegistration(page)
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Email này đã được đăng ký. Bạn hãy đăng nhập.')
  await expect(page).toHaveURL('/register')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Đăng ký', exact: true })).toBeEnabled()
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBeNull()
})

test('saved session reloads through bearer /users/me and redirects authenticated guest routes', async ({ page, api }) => {
  await seedSession(page)
  api.handle('GET /users/me', reply(200, user))
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: user.fullName })).toBeVisible()
  const countBeforeReload = api.calls.length
  await page.reload()
  await expect(page.getByRole('heading', { name: user.fullName })).toBeVisible()
  expect(api.calls.length).toBeGreaterThan(countBeforeReload)
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path)
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByRole('heading', { name: `Xin chào, ${user.fullName}!` })).toBeVisible()
  }
  expect(api.calls.every((call) => ['GET /users/me', 'GET /attempts'].includes(call.key) && call.authorization === `Bearer ${token}`)).toBe(true)
})

test('logout clears the local session on success and network error', async ({ page, api }) => {
  await seedSession(page)
  api.handle('GET /users/me', reply(200, user))
  for (const outcome of ['success', 'network error'] as const) {
    api.handle('POST /auth/logout', outcome === 'success' ? reply(204, null) : async (route) => {
      await route.abort('connectionfailed')
    })
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: user.fullName })).toBeVisible()
    await expect(page.locator('.app-header').getByRole('button', { name: /Đăng xuất/ })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Cài đặt', exact: true })).toHaveCount(0)
    await page.getByRole('link', { name: 'Cài đặt', exact: true }).click()
    await expect(page).toHaveURL('/settings')
    await expect(page.getByRole('heading', { level: 1, name: 'Cài đặt', exact: true })).toBeVisible()
    await expect(page.getByText(user.email, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Đăng xuất tài khoản', exact: true }).click()
    await expect(page).toHaveURL('/login')
    expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBeNull()
    expect(api.calls.filter((call) => call.key === 'POST /auth/logout').at(-1)).toEqual(
      { key: 'POST /auth/logout', body: null, authorization: `Bearer ${token}` },
    )
    await page.getByRole('link', { name: 'Tạo tài khoản mới', exact: true }).click()
    await expect(page).toHaveURL('/register')
  }
})

test('401 while restoring an expired session removes the token and requires login', async ({ page, api }) => {
  await seedSession(page)
  api.handle('GET /users/me', reply(401, { message: 'Invalid or expired token' }))
  await page.goto('/profile')
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào Tracnghiem.com' })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBeNull()
  expect(api.calls.length).toBeGreaterThan(0)
  expect(api.calls.every((call) => call.authorization === `Bearer ${token}`)).toBe(true)
})

test('authentication remains usable in memory when browser storage writes fail', async ({ page, api }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage is unavailable', 'QuotaExceededError')
      original.call(this, name, value)
    }
  }, tokenKey)
  api.handle('POST /auth/login', reply(200, session))
  api.handle('POST /auth/logout', reply(204, null))
  await page.goto('/login')
  await fillLogin(page)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL('/dashboard')
  expect(await page.evaluate((key) => localStorage.getItem(key), tokenKey)).toBeNull()
  await page.getByRole('link', { name: 'Tài khoản', exact: true }).click()
  await expect(page.getByRole('heading', { name: user.fullName })).toBeVisible()
  await page.getByRole('link', { name: 'Cài đặt', exact: true }).click()
  await expect(page).toHaveURL('/settings')
  await page.getByRole('button', { name: 'Đăng xuất tài khoản', exact: true }).click()
  await expect(page).toHaveURL('/login')
  expect(api.calls.find((call) => call.key === 'POST /auth/logout')?.authorization).toBe(`Bearer ${token}`)
})

test('public and authenticated layouts fit 390px and 320px viewports', async ({ page, api }) => {
  api.handle('POST /auth/login', reply(200, session))
  api.handle('GET /users/me', reply(200, user))
  api.handle('POST /auth/logout', reply(204, null))
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    for (const path of ['/login', '/register', '/forgot-password', '/missing']) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await expectNoOverflow(page)
    }
    await page.goto('/login')
    await fillLogin(page)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL('/dashboard')
    await expectNoOverflow(page)
    await page.getByRole('link', { name: 'Tài khoản', exact: true }).click()
    await expect(page).toHaveURL('/profile')
    await expectNoOverflow(page)
    await page.getByRole('link', { name: 'Cài đặt', exact: true }).click()
    await expect(page).toHaveURL('/settings')
    await expectNoOverflow(page)
    await page.getByRole('button', { name: 'Đăng xuất tài khoản', exact: true }).click()
    await expect(page).toHaveURL('/login')
  }
})

test('the supplied study photo loads and login previews are captured', async ({ page }) => {
  await page.setViewportSize({ width: 1711, height: 733 })
  const photoResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/images/study-background.jpg')
  await page.goto('/login')
  const photo = await photoResponse
  expect(photo.status()).toBe(200)
  expect(photo.headers()['content-type']).toContain('image/jpeg')
  expect(await photo.body()).toEqual(await readFile('public/images/study-background.jpg'))
  const dimensions = await page.evaluate(async () => {
    const background = getComputedStyle(document.querySelector('.auth-layout')!, '::before').backgroundImage
    const image = new Image()
    image.src = background.slice(5, -2)
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight, background }
  })
  expect(dimensions.background).toContain('/images/study-background.jpg')
  expect(dimensions.width).toBeGreaterThan(0)
  expect(dimensions.height).toBeGreaterThan(0)
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào Tracnghiem.com' })).toBeVisible()
  await expectNoOverflow(page)
  await capturePreview(page, 'test-results/preview-login-desktop.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoOverflow(page)
  await capturePreview(page, 'test-results/preview-login-mobile.png')
})


test('a STUDENT login returns to dashboard when a saved destination requires manager access', async ({ page, api }) => {
  api.handle('POST /auth/login', reply(200, session))
  await page.goto('/manage/exams?status=DRAFT')
  await expect(page).toHaveURL('/login')
  await fillLogin(page)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL('/dashboard')
  expect(api.calls.some((call) => call.key.startsWith('GET /exams'))).toBe(false)
})
