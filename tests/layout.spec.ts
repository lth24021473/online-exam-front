import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

type Role = 'STUDENT' | 'EXAM_MANAGER' | 'ADMIN'
const token = 'mock-layout-token'
const examId = '670001111111111111111111'
const attemptId = '670002222222222222222222'
const timestamp = '2026-09-01T00:00:00Z'
const user = {
  id: 'layout-user', fullName: 'Nguyễn Minh Anh', email: 'layout@example.com',
  createdAt: timestamp, updatedAt: timestamp,
}
const exam = {
  id: examId, title: 'Đề thi kiểm tra bố cục', description: 'Luyện tập kiến thức.',
  instructions: 'Chọn một đáp án.', status: 'PUBLISHED', durationMinutes: 15,
  totalQuestions: 1, questions: [],
}
const questions = [{ id: 'layout-question', position: 1, content: 'Một cộng một bằng bao nhiêu?', options: ['Một', 'Hai', 'Ba'] }]

async function mockApi(page: Page, role: Role) {
  const unexpected: string[] = []
  await page.addInitScript((value) => localStorage.setItem('online-exam.access-token', value), token)
  // Block all backend traffic, including any unexpected mutation from a route.
  await page.route('http://localhost:3000/api/v1/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return }
    expect(request.headers().authorization).toBe('Bearer ' + token)
    const key = request.method() + ' ' + new URL(request.url()).pathname.replace('/api/v1', '')
    if (key === 'GET /users/me') { await route.fulfill({ json: { ...user, role } }); return }
    if (key === 'GET /exams') { await route.fulfill({ json: [exam] }); return }
    if (key === 'GET /exams/' + examId) { await route.fulfill({ json: exam }); return }
    if (key === 'GET /attempts') {
      await route.fulfill({ json: { items: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } } }); return
    }
    if (key === 'POST /exams/' + examId + '/attempts') {
      await route.fulfill({ status: 201, json: {
        resumed: false,
        attempt: { id: attemptId, examId, status: 'IN_PROGRESS', startedAt: timestamp, deadlineAt: new Date(Date.now() + 900_000).toISOString(), totalQuestions: 1 },
        exam, questions, answers: [],
      } }); return
    }
    if (key === 'GET /attempts/' + attemptId + '/result') {
      await route.fulfill({ json: {
        attempt: { id: attemptId, examId, examTitle: exam.title, status: 'SUBMITTED', startedAt: timestamp, deadlineAt: timestamp, submittedAt: timestamp },
        summary: { score: 10, maxScore: 10, totalQuestions: 1, correctCount: 1, incorrectCount: 0, unansweredCount: 0 },
        questions: questions.map((question) => ({ ...question, selectedOptionIndex: 1, correctOptionIndex: 1, isCorrect: true })),
      } }); return
    }
    if (key === 'GET /exams/' + examId + '/results') {
      await route.fulfill({ json: {
        exam, data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
        summary: { totalAttempts: 0, submittedCount: 0, inProgressCount: 0, cancelledCount: 0, averageScore: null, highestScore: null, lowestScore: null },
      } }); return
    }
    if (key === 'GET /admin/users') { await route.fulfill({ json: [{ ...user, role }] }); return }
    unexpected.push(key)
    await route.fulfill({ status: 501, json: { message: 'Unexpected layout request' } })
  })
  return unexpected
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect()
      return { x: value.x, y: value.y, width: value.width, height: value.height }
    }
    const header = document.querySelector('.app-header')!
    const brand = header.querySelector('.brand')!
    const main = document.querySelector('.app-main')!
    const footer = document.querySelector('.app-footer')!
    return {
      header: rect(header), brand: rect(brand),
      brandFont: getComputedStyle(brand).fontSize,
      navigation: [...header.querySelectorAll('.app-nav > a')].map((link) => ({
        label: link.textContent!.trim(), ...rect(link),
        font: getComputedStyle(link).fontSize,
      })),
      main: rect(main), content: rect(main.firstElementChild!), footer: rect(footer),
      background: getComputedStyle(document.querySelector('.app-layout')!).backgroundColor,
      viewport: document.documentElement.clientWidth, contentWidth: document.documentElement.scrollWidth,
    }
  })
}

const sharedRoutes = [
  ['/profile', user.fullName],
  ['/profile?tab=edit', user.fullName],
  ['/settings', 'Cài đặt'],
  ['/exams', 'Khám phá đề thi'],
  ['/exams/' + examId, exam.title],
]
const studentRoutes = [
  ['/history', 'Lịch sử làm bài'],
  ['/exams/' + examId + '/take', exam.title],
  ['/attempts/' + attemptId + '/result', 'Kết quả bài làm'],
]
const managerRoutes = [
  ['/manage/exams', 'Quản lý đề thi'],
  ['/manage/exams/' + examId, exam.title],
  ['/manage/exams/' + examId + '/results', 'Kết quả học sinh'],
]

for (const role of ['STUDENT', 'EXAM_MANAGER', 'ADMIN'] as const) {
  for (const width of [1920, 320]) {
    test(`${role} pages share homepage header, navigation and content geometry at ${width}px`, async ({ page }) => {
      const unexpected = await mockApi(page, role)
      await page.setViewportSize({ width, height: 1080 })
      await page.goto('/dashboard')
      await expect(page.getByRole('heading', { name: 'Xin chào, ' + user.fullName + '!', exact: true })).toBeVisible()
      const reference = await geometry(page)
      const expectedNavigation = role === 'STUDENT'
        ? ['Trang chủ', 'Đề thi', 'Lịch sử', 'Tài khoản', 'Cài đặt']
        : ['Trang chủ', 'Quản lý đề', ...(role === 'ADMIN' ? ['Quản trị'] : []), 'Tài khoản', 'Cài đặt']
      expect(reference.navigation.map((link) => link.label)).toEqual(expectedNavigation)
      expect(reference.contentWidth).toBeLessThanOrEqual(reference.viewport)
      expect(reference.brand.x).toBeCloseTo(reference.main.x, 0)
      // The desktop reference should retain the wide homepage rather than a narrow centered column.
      if (width === 1920) expect(reference.main.width).toBeGreaterThan(1400)
      const routes = [...sharedRoutes, ...(role === 'STUDENT' ? studentRoutes : managerRoutes), ...(role === 'ADMIN' ? [['/admin/users', 'Quản lý tài khoản']] : [])]
      for (const [path, title] of routes) {
        await test.step(path, async () => {
          await page.goto(path)
          await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
          const actual = await geometry(page)
          expect(actual.header).toEqual(reference.header)
          expect(actual.brand).toEqual(reference.brand)
          expect(actual.brandFont).toBe(reference.brandFont)
          expect(actual.navigation).toEqual(reference.navigation)
          expect(actual.background).toBe(reference.background)
          for (const dimension of ['x', 'y', 'width'] as const) {
            expect(actual.main[dimension], path + ' main ' + dimension).toBeCloseTo(reference.main[dimension], 0)
          }
          expect(actual.content.x, path + ' content left edge').toBeCloseTo(actual.main.x, 0)
          expect(actual.content.width, path + ' content width').toBeCloseTo(actual.main.width, 0)
          expect(actual.footer.x).toBeCloseTo(reference.footer.x, 0)
          expect(actual.footer.width).toBeCloseTo(reference.footer.width, 0)
          expect(actual.contentWidth, path + ' horizontal overflow').toBeLessThanOrEqual(actual.viewport)
          if (role === 'EXAM_MANAGER' && ['/profile', '/settings', '/manage/exams'].includes(path)) {
            const clip = await page.evaluate(() => ({
              x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
            }))
            await page.screenshot({ path: `test-results/layout-regression/layout-${path.slice(1).replace('/', '-')}-${width}.png`, fullPage: true, clip })
          }
        })
      }
      expect(unexpected, 'All backend requests must use an explicit mock').toEqual([])
    })
  }
}
