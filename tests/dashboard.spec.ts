import { expect, test as base } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

type Role = 'STUDENT' | 'EXAM_MANAGER' | 'ADMIN'
type ApiMock = {
  role: Role
  calls: string[]
  handle: (key: string, handler: (route: Route) => Promise<void>) => void
}
const token = 'dashboard-mock-token'
const user = {
  id: 'dashboard-user', fullName: 'Nguyễn Minh Anh', email: 'dashboard@example.com',
  role: 'STUDENT', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
}
const examId = '670001111111111111111111'
const attemptId = '670002222222222222222222'
const history = [
  ...Array.from({ length: 13 }, (_, index) => ({
    id: index === 0 ? attemptId : String(index), status: 'IN_PROGRESS',
    exam: { id: examId, title: 'Bài đang làm ' + (index + 1) },
    startedAt: '2026-10-05T01:00:00Z', deadlineAt: index === 1 ? '2026-10-05T02:00:00Z' : '2099-10-05T02:00:00Z',
    submittedAt: null, cancelledAt: null, score: null, maxScore: 10,
    totalQuestions: 20, correctCount: null, incorrectCount: null, expired: index === 1,
  })),
  { id: 'graded-attempt', status: 'SUBMITTED', exam: { id: examId, title: 'Kết quả từ backend' },
    startedAt: '2026-10-05T01:00:00Z', deadlineAt: '2026-10-05T02:00:00Z',
    submittedAt: '2026-10-05T01:15:00Z', cancelledAt: null, score: 7.5, maxScore: 10,
    totalQuestions: 20, correctCount: 15, incorrectCount: 5, expired: false },
  { id: 'cancelled-attempt', status: 'CANCELLED', exam: { id: examId, title: 'Bài đã hủy' },
    startedAt: '2026-10-05T01:00:00Z', deadlineAt: '2026-10-05T02:00:00Z',
    submittedAt: null, cancelledAt: '2026-10-05T01:10:00Z', score: null, maxScore: 10,
    totalQuestions: 20, correctCount: null, incorrectCount: null, expired: false },
]
const examBase = { description: 'Ôn tập kiến thức', instructions: null, durationMinutes: 30, totalQuestions: 20 }
const catalog = [
  { ...examBase, id: 'draft-exam', title: 'Bản nháp riêng', status: 'DRAFT' },
  { ...examBase, id: 'closed-exam', title: 'Đề đã đóng', status: 'CLOSED' },
  ...Array.from({ length: 13 }, (_, index) => ({
    ...examBase, id: 'published-' + index, title: 'Đề đang mở ' + (index + 1), status: 'PUBLISHED',
  })),
]

async function fulfillHistory(route: Route, emptyOnly = false) {
  const url = new URL(route.request().url())
  const page = Number(url.searchParams.get('page') || 1)
  const limit = Number(url.searchParams.get('limit') || 6)
  const items = emptyOnly ? [] : history.filter((item) => item.status === url.searchParams.get('status'))
  await route.fulfill({ json: {
    items: items.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total: items.length, totalPages: Math.ceil(items.length / limit) },
  } })
}

const test = base.extend<{ api: ApiMock }>({
  api: [async ({ page }, use) => {
    const overrides = new Map<string, (route: Route) => Promise<void>>()
    const unexpected: string[] = []
    const api: ApiMock = { role: 'STUDENT', calls: [], handle: (key, handler) => overrides.set(key, handler) }
    await page.addInitScript((value) => localStorage.setItem('online-exam.access-token', value), token)
    // Intercept every backend call; homepage tests never write to real accounts.
    await page.route('http://localhost:3000/api/v1/**', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return }
      const url = new URL(request.url())
      const key = request.method() + ' ' + url.pathname.replace('/api/v1', '')
      api.calls.push(request.method() + ' ' + url.pathname.replace('/api/v1', '') + url.search)
      expect(request.headers().authorization).toBe('Bearer ' + token)
      const override = overrides.get(key)
      if (override) { await override(route); return }
      if (key === 'GET /users/me') { await route.fulfill({ json: { ...user, role: api.role } }); return }
      if (key === 'GET /attempts') { await fulfillHistory(route); return }
      if (key === 'GET /exams') { await route.fulfill({ json: catalog }); return }
      unexpected.push(key)
      await route.fulfill({ status: 501, json: { message: 'Unexpected dashboard request' } })
    })
    await use(api)
    expect(unexpected).toEqual([])
  }, { auto: true }],
})

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
}
async function preview(page: Page, path: string) {
  const clip = await page.evaluate(() => ({
    x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
  }))
  await page.screenshot({ path, fullPage: true, clip })
}

test('student tabs use real statuses, retain pagination and show backend scores and destinations', async ({ page, api }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Xin chào, ' + user.fullName + '!' })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveText(['Đang làm', 'Hoàn thành', 'Đã hủy'])
  await expect(page.getByRole('heading', { name: 'Bài đang làm 1', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tiếp tục làm bài', exact: true }).first()).toHaveAttribute('href', '/exams/' + examId + '/take')
  await expect(page.getByRole('heading', { name: 'Bài đang làm 2', exact: true }).locator('..').getByRole('link', { name: /Xem kết quả/ })).toHaveAttribute('href', '/attempts/1/result')
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
  await expect.poll(() => api.calls.some((call) => call.includes('page=2') && call.includes('status=IN_PROGRESS'))).toBe(true)
  await expect(page.getByRole('heading', { name: 'Bài đang làm 1', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Hoàn thành', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Kết quả từ backend', exact: true })).toBeVisible()
  await expect(page.getByLabel('Điểm bài thi', { exact: true })).toContainText('7,5')
  await expect(page.getByRole('link', { name: 'Xem kết quả', exact: true })).toHaveAttribute('href', '/attempts/graded-attempt/result')
  const completedCall = api.calls.filter((call) => call.includes('status=SUBMITTED')).at(-1)!
  expect(completedCall).toContain('page=1')
  await page.getByRole('tab', { name: 'Hoàn thành', exact: true }).press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Đã hủy', exact: true })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Bài đã hủy', exact: true })).toBeVisible()
  await expect(page.getByLabel('Điểm bài thi', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Tiếp tục làm bài', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Đã hủy', exact: true }).press('Home')
  await expect(page.getByRole('tab', { name: 'Đang làm', exact: true })).toBeFocused()
})

test('an open homepage switches an expired attempt to its existing result without starting another attempt', async ({ page, api }) => {
  await page.clock.install({ time: new Date('2026-10-05T01:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-05T01:00:01Z'))
  api.handle('GET /attempts', async (route) => route.fulfill({ json: {
    items: [{ ...history[0], deadlineAt: '2026-10-05T01:00:04Z', expired: false }],
    meta: { page: 1, limit: 12, total: 1, totalPages: 1 },
  } }))
  await page.goto('/dashboard')
  await expect(page.getByRole('link', { name: 'Tiếp tục làm bài', exact: true })).toBeVisible()
  await page.clock.runFor(4000)
  await expect(page.getByRole('link', { name: 'Tiếp tục làm bài', exact: true })).toHaveCount(0)
  await expect(page.getByText('Đã hết giờ', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Xem kết quả', exact: true })).toHaveAttribute('href', '/attempts/' + attemptId + '/result')
  expect(api.calls.every((call) => call.startsWith('GET '))).toBe(true)
})

for (const role of ['EXAM_MANAGER', 'ADMIN'] as const) {
  test(role + ' dashboard filters array catalog before pagination and never calls student APIs', async ({ page, api }) => {
    api.role = role
    await page.goto('/dashboard')
    await expect(page.getByRole('tab')).toHaveText(['Đang mở', 'Bản nháp', 'Đã đóng'])
    await expect(page.getByRole('heading', { name: 'Đề đang mở 1', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Bản nháp riêng', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Đề đang mở 13', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Bản nháp', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Bản nháp riêng', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Xem (đề thi|chi tiết)/ })).toHaveAttribute('href', '/exams/draft-exam')
    await expect(page.getByRole('heading', { name: 'Đề đang mở 13', exact: true })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Đã đóng', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Đề đã đóng', exact: true })).toBeVisible()
    expect(api.calls.every((call) => !call.includes('/attempts'))).toBe(true)
  })
}

test('a failed dashboard read offers retry and a slow previous tab cannot overwrite the new tab', async ({ page, api }) => {
  api.handle('GET /attempts', async (route) => route.abort('connectionfailed'))
  await page.goto('/dashboard')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.dashboard-empty')).toHaveCount(0)
  api.handle('GET /attempts', fulfillHistory)
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Bài đang làm 1', exact: true })).toBeVisible()
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  api.handle('GET /attempts', async (route) => {
    if (new URL(route.request().url()).searchParams.get('status') === 'SUBMITTED') await pending
    await fulfillHistory(route)
  })
  await page.getByRole('tab', { name: 'Hoàn thành', exact: true }).click()
  await expect.poll(() => api.calls.some((call) => call.includes('status=SUBMITTED'))).toBe(true)
  await page.getByRole('tab', { name: 'Đã hủy', exact: true }).click()
  try {
    await expect(page.getByRole('heading', { name: 'Bài đã hủy', exact: true })).toBeVisible()
  } finally { release() }
  await expect(page.getByRole('heading', { name: 'Kết quả từ backend', exact: true })).toHaveCount(0)
})

test('homepage empty layout and avatar fit desktop and mobile with light and dark themes', async ({ page, api }) => {
  api.handle('GET /attempts', async (route) => fulfillHistory(route, true))
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/dashboard')
  await expect(page.locator('.dashboard-empty')).toBeVisible()
  await expect(page.locator('.dashboard-hint')).toBeVisible()
  await expectNoOverflow(page)
  await preview(page, 'test-results/preview-dashboard-light-desktop.png')
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.getByRole('tab', { name: 'Đã hủy', exact: true })).toBeVisible()
    await expectNoOverflow(page)
  }
  await preview(page, 'test-results/preview-dashboard-light-mobile.png')
  await page.getByRole('link', { name: 'Cài đặt', exact: true }).click()
  await page.getByRole('switch', { name: 'Chế độ tối', exact: true }).click()
  await page.getByRole('link', { name: 'Trang chủ', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.dashboard-empty')).toBeVisible()
  await expectNoOverflow(page)
  await preview(page, 'test-results/preview-dashboard-dark-mobile.png')
})
