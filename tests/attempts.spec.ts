import { expect, test as base } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

const examId = '670001111111111111111111'
const attemptId = '670002222222222222222222'
const questionIds = ['670003333333333333333333', '670004444444444444444444']
const token = 'mock-attempt-token'
const user = {
  id: 'attempt-student', fullName: 'Nguyễn Minh Anh', email: 'student@example.com',
  role: 'STUDENT', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
}
const exam = {
  id: examId, title: 'Kiểm tra kiến thức lập trình', description: 'Đề luyện tập gồm hai câu hỏi.',
  instructions: 'Chọn một đáp án cho mỗi câu.', durationMinutes: 5, status: 'PUBLISHED',
  totalQuestions: 2, questionCount: 2,
}
const questions = [
  { id: questionIds[0], position: 1, content: 'Kiểu nào dùng để biểu diễn đúng hoặc sai?', options: ['Chuỗi', 'Boolean', 'Số nguyên'] },
  { id: questionIds[1], position: 2, content: 'Lệnh nào khai báo một hằng số?', options: ['var', 'let', 'const'] },
]
type Call = { key: string; body: unknown; authorization?: string; url: string }
type HistoryItem = {
  id: string; status: 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED'; startedAt: string; deadlineAt: string;
  submittedAt: string | null; cancelledAt: string | null; score: number | null; totalQuestions: number;
  correctCount: number | null; incorrectCount: number | null; exam: { id: string; title: string }; maxScore: number; expired: boolean;
}
type ApiMock = {
  calls: Call[]
  answers: Map<string, number>
  role: 'STUDENT' | 'EXAM_MANAGER'
  deadlineAt: string
  submitted: boolean
  cancelled: boolean
  resultScore: number
  history: HistoryItem[] | null
  handle: (key: string, handler: (route: Route) => Promise<void>) => void
}

const test = base.extend<{ api: ApiMock }>({
  api: [async ({ page }, use) => {
    const overrides = new Map<string, (route: Route) => Promise<void>>()
    const unexpected: string[] = []
    let starts = 0
    const startedAt = new Date().toISOString()
    const api: ApiMock = {
      calls: [], answers: new Map(), role: 'STUDENT', deadlineAt: new Date(Date.now() + 300_000).toISOString(),
      submitted: false, cancelled: false, resultScore: 7.5, history: null,
      handle: (key, handler) => overrides.set(key, handler),
    }
    const result = () => ({
      attempt: { id: attemptId, examId, examTitle: exam.title, status: 'SUBMITTED', startedAt, deadlineAt: api.deadlineAt, submittedAt: new Date().toISOString() },
      summary: { score: api.resultScore, maxScore: 10, totalQuestions: 2, correctCount: 1, incorrectCount: 1, unansweredCount: 0 },
      questions: questions.map((question, index) => ({ ...question, selectedOptionIndex: api.answers.get(question.id) ?? null, correctOptionIndex: index === 0 ? 1 : 2, isCorrect: index === 0 })),
    })
    const historyItem = (): HistoryItem => ({
      id: attemptId, status: api.submitted ? 'SUBMITTED' : api.cancelled ? 'CANCELLED' : 'IN_PROGRESS',
      startedAt, deadlineAt: api.deadlineAt, submittedAt: api.submitted ? new Date().toISOString() : null,
      cancelledAt: api.cancelled ? new Date().toISOString() : null, score: api.submitted ? api.resultScore : null,
      totalQuestions: 2, correctCount: api.submitted ? 1 : null, incorrectCount: api.submitted ? 1 : null,
      exam: { id: examId, title: exam.title }, maxScore: 10, expired: false,
    })
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: 'online-exam.access-token', value: token })
    // All backend requests stay inside this mock, including unexpected routes.
    // The suite cannot create accounts or attempts in the real database.
    await page.route('http://localhost:3000/api/v1/**', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: {
          'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'access-control-allow-headers': 'authorization, content-type',
        } })
        return
      }
      const url = new URL(request.url())
      const key = `${request.method()} ${url.pathname.replace('/api/v1', '')}`
      api.calls.push({ key, body: request.postDataJSON(), authorization: request.headers().authorization, url: request.url() })
      const override = overrides.get(key)
      if (override) { await override(route); return }
      if (key === 'GET /users/me') { await route.fulfill({ json: { ...user, role: api.role } }); return }
      if (key === 'GET /exams') { await route.fulfill({ json: { items: [exam], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } } }); return }
      if (key === `GET /exams/${examId}`) { await route.fulfill({ json: exam }); return }
      if (key === `POST /exams/${examId}/attempts`) {
        const resumed = starts++ > 0
        await route.fulfill({ status: 201, json: {
          resumed, attempt: { id: attemptId, examId, status: 'IN_PROGRESS', startedAt, deadlineAt: api.deadlineAt, totalQuestions: 2 },
          exam: { id: examId, title: exam.title, instructions: exam.instructions, durationMinutes: exam.durationMinutes },
          questions, answers: [...api.answers].map(([questionId, selectedOptionIndex]) => ({ questionId, selectedOptionIndex })),
        } })
        return
      }
      if (key.startsWith(`PUT /attempts/${attemptId}/answers/`)) {
        const questionId = url.pathname.split('/').at(-1)!
        const { selectedOptionIndex } = request.postDataJSON() as { selectedOptionIndex: number }
        api.answers.set(questionId, selectedOptionIndex)
        await route.fulfill({ json: { questionId, selectedOptionIndex, savedAt: new Date().toISOString() } })
        return
      }
      if (key === `POST /attempts/${attemptId}/submit`) {
        api.submitted = true
        await route.fulfill({ json: result() })
        return
      }
      if (key === `GET /attempts/${attemptId}/result`) {
        await route.fulfill(api.submitted ? { json: result() } : { status: 409, json: { message: 'Attempt has not been submitted' } })
        return
      }
      if (key === `DELETE /attempts/${attemptId}`) {
        api.cancelled = true
        await route.fulfill({ status: 204 })
        return
      }
      if (key === 'GET /attempts') {
        const requestedStatus = url.searchParams.get('status')
        const items = (api.history ?? (starts ? [historyItem()] : [])).filter((item) => !requestedStatus || item.status === requestedStatus)
        const pageNumber = Number(url.searchParams.get('page') ?? 1)
        const limit = Number(url.searchParams.get('limit') ?? 10)
        await route.fulfill({ json: { items: items.slice((pageNumber - 1) * limit, pageNumber * limit), meta: { page: pageNumber, limit, total: items.length, totalPages: Math.ceil(items.length / limit) } } })
        return
      }
      unexpected.push(key)
      await route.fulfill({ status: 501, json: { message: 'Unexpected mocked endpoint' } })
    })
    await use(api)
    expect(unexpected, 'Every backend request must have an explicit mock').toEqual([])
  }, { auto: true }],
})

const radio = (page: Page, name: string) => page.getByRole('radio', { name: new RegExp(name) })
const saveCalls = (api: ApiMock) => api.calls.filter((call) => call.key.startsWith('PUT /attempts/'))
const submitCalls = (api: ApiMock) => api.calls.filter((call) => call.key.endsWith('/submit'))
async function openQuiz(page: Page) {
  await page.goto(`/exams/${examId}/take`)
  await expect(page.getByRole('heading', { name: exam.title, exact: true })).toBeVisible()
  await expect(radio(page, 'Boolean')).toBeVisible()
}
async function expectSaved(page: Page) {
  await expect(page.getByText('Đã lưu tất cả đáp án', { exact: true })).toBeVisible()
}
async function confirmSubmit(page: Page) {
  await page.getByRole('button', { name: 'Nộp bài', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận nộp bài', exact: true }).click()
}
async function capturePreview(page: Page, path: string) {
  const clip = await page.evaluate(() => ({ x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
  await page.screenshot({ path, fullPage: true, clip })
}
function item(id: string, status: HistoryItem['status'], title: string): HistoryItem {
  return { id, status, startedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 300_000).toISOString(),
    submittedAt: status === 'SUBMITTED' ? new Date().toISOString() : null, cancelledAt: status === 'CANCELLED' ? new Date().toISOString() : null,
    score: status === 'SUBMITTED' ? 7.5 : null, totalQuestions: 2, correctCount: status === 'SUBMITTED' ? 1 : null,
    incorrectCount: status === 'SUBMITTED' ? 1 : null, exam: { id: examId, title }, maxScore: 10, expired: false }
}

test('catalog and details lead to a real attempt shape using the current bearer token', async ({ page, api }) => {
  await page.goto('/exams')
  await expect(page.getByRole('heading', { name: exam.title, exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Xem đề thi', exact: true }).click()
  await expect(page).toHaveURL(`/exams/${examId}`)
  await expect(page.getByText(exam.instructions, { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Bắt đầu / Tiếp tục bài', exact: true }).click()
  await expect(page).toHaveURL(`/exams/${examId}/take`)
  await expect(radio(page, 'Boolean')).toBeVisible()
  expect(api.calls.filter((call) => call.key.includes('/attempts')).every((call) => call.authorization === `Bearer ${token}`)).toBe(true)
  await expect(page.getByText(/Đáp án đúng/)).toHaveCount(0)
})

test('an answer changed during a pending save is eventually stored as the latest choice', async ({ page, api }) => {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  let writes = 0
  api.handle(`PUT /attempts/${attemptId}/answers/${questionIds[0]}`, async (route) => {
    const selectedOptionIndex = (route.request().postDataJSON() as { selectedOptionIndex: number }).selectedOptionIndex
    if (writes++ === 0) await pending
    api.answers.set(questionIds[0], selectedOptionIndex)
    await route.fulfill({ json: { questionId: questionIds[0], selectedOptionIndex, savedAt: new Date().toISOString() } })
  })
  await openQuiz(page)
  await radio(page, 'Chuỗi').check()
  await expect.poll(() => saveCalls(api).length).toBe(1)
  try {
    await expect(page.getByText('Đang lưu đáp án…', { exact: true })).toBeVisible()
    await radio(page, 'Boolean').check()
    await expect(radio(page, 'Boolean')).toBeChecked()
  } finally { release() }
  await expectSaved(page)
  expect(api.answers.get(questionIds[0])).toBe(1)
  expect(saveCalls(api).at(-1)?.body).toEqual({ selectedOptionIndex: 1 })
})

test('failed answer save keeps the selection visible and retries the same answer', async ({ page, api }) => {
  let failed = false
  api.handle(`PUT /attempts/${attemptId}/answers/${questionIds[0]}`, async (route) => {
    if (!failed) {
      failed = true
      await route.fulfill({ status: 503, json: { message: 'Service temporarily unavailable' } })
      return
    }
    const selectedOptionIndex = (route.request().postDataJSON() as { selectedOptionIndex: number }).selectedOptionIndex
    api.answers.set(questionIds[0], selectedOptionIndex)
    await route.fulfill({ json: { questionId: questionIds[0], selectedOptionIndex, savedAt: new Date().toISOString() } })
  })
  await openQuiz(page)
  await radio(page, 'Boolean').check()
  await expect(page.getByRole('button', { name: 'Thử lưu lại', exact: true })).toBeVisible()
  await expect(radio(page, 'Boolean')).toBeChecked()
  await page.getByRole('button', { name: 'Thử lưu lại', exact: true }).click()
  await expectSaved(page)
  expect(api.answers.get(questionIds[0])).toBe(1)
  expect(saveCalls(api).map((call) => call.body)).toEqual([{ selectedOptionIndex: 1 }, { selectedOptionIndex: 1 }])
})

test('reload resumes saved choices with the original deadline', async ({ page, api }) => {
  await openQuiz(page)
  await radio(page, 'Boolean').check()
  await expectSaved(page)
  const deadlineAt = api.deadlineAt
  await page.reload()
  await expect(radio(page, 'Boolean')).toBeChecked()
  await expect(page.getByLabel('Thời gian còn lại', { exact: true })).toBeVisible()
  expect(api.deadlineAt).toBe(deadlineAt)
  expect(api.calls.filter((call) => call.key === `POST /exams/${examId}/attempts`).length).toBeGreaterThanOrEqual(2)
  expect(api.answers.get(questionIds[0])).toBe(1)
})

test('sidebar tracks answers and countdown while review marks survive navigation and reload', async ({ page, api }) => {
  const now = new Date('2026-10-04T10:00:00.000Z')
  api.deadlineAt = new Date(now.getTime() + 300_000).toISOString()
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  await openQuiz(page)

  const summary = page.locator('.exam-attempt-summary')
  const timer = summary.getByLabel('Thời gian còn lại', { exact: true })
  const questionNavigation = page.getByRole('navigation', { name: 'Chọn câu hỏi', exact: true })
  const firstQuestion = questionNavigation.getByRole('button', { name: /^Câu 1(?:,|$)/ })
  const secondQuestion = questionNavigation.getByRole('button', { name: /^Câu 2(?:,|$)/ })
  const reviewToggle = page.getByRole('button', { name: 'Đánh dấu xem lại', exact: true })
  await expect(summary).toContainText(/0\s*\/\s*2/)
  await expect(timer).toHaveText('00:05:00')
  await page.clock.fastForward(5_000)
  await expect(timer).toHaveText('00:04:55')

  await radio(page, 'Boolean').check()
  await expectSaved(page)
  await expect(summary).toContainText(/1\s*\/\s*2/)
  await expect(firstQuestion).toHaveClass(/is-answered/)
  await secondQuestion.click()
  await expect(radio(page, 'const')).toBeVisible()
  await expect(reviewToggle).toHaveAttribute('aria-pressed', 'false')
  await reviewToggle.click()
  await expect(reviewToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(secondQuestion).toHaveClass(/is-review/)
  await expect(secondQuestion).not.toHaveClass(/is-answered/)
  await expect(summary).toContainText(/1\s*\/\s*2/)
  await firstQuestion.click()
  await expect(radio(page, 'Boolean')).toBeChecked()
  await expect(reviewToggle).toHaveAttribute('aria-pressed', 'false')

  await page.reload()
  await expect(radio(page, 'Boolean')).toBeChecked()
  await expect(summary).toContainText(/1\s*\/\s*2/)
  await expect(timer).toHaveText('00:04:55')
  await expect(secondQuestion).toHaveClass(/is-review/)
  await secondQuestion.click()
  await expect(reviewToggle).toHaveAttribute('aria-pressed', 'true')
  await reviewToggle.click()
  await expect(secondQuestion).not.toHaveClass(/is-review/)
  await page.reload()
  await secondQuestion.click()
  await expect(reviewToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(secondQuestion).not.toHaveClass(/is-review/)
  expect(api.answers.size).toBe(1)
})

test('a locally pending answer survives reload and is retried against the resumed attempt', async ({ page, api }) => {
  api.handle(`PUT /attempts/${attemptId}/answers/${questionIds[0]}`, async (route) => route.abort('connectionfailed'))
  await openQuiz(page)
  await radio(page, 'Boolean').check()
  await expect(page.getByRole('button', { name: 'Thử lưu lại', exact: true })).toBeVisible()
  page.once('dialog', (dialog) => { void dialog.accept() })
  await page.reload()
  await expect(radio(page, 'Boolean')).toBeChecked()
  api.handle(`PUT /attempts/${attemptId}/answers/${questionIds[0]}`, async (route) => {
    const selectedOptionIndex = (route.request().postDataJSON() as { selectedOptionIndex: number }).selectedOptionIndex
    api.answers.set(questionIds[0], selectedOptionIndex)
    await route.fulfill({ json: { questionId: questionIds[0], selectedOptionIndex, savedAt: new Date().toISOString() } })
  })
  await page.getByRole('button', { name: 'Thử lưu lại', exact: true }).click()
  await expectSaved(page)
  expect(api.answers.get(questionIds[0])).toBe(1)
})

test('offline selection remains visible and reconnecting saves it automatically', async ({ page, context, api }) => {
  await openQuiz(page)
  await context.setOffline(true)
  await radio(page, 'Boolean').check()
  await expect(radio(page, 'Boolean')).toBeChecked()
  await expect(page.getByText(/mất mạng|ngoại tuyến|mất kết nối/i).first()).toBeVisible()
  expect(api.answers.has(questionIds[0])).toBe(false)
  await context.setOffline(false)
  await expectSaved(page)
  expect(api.answers.get(questionIds[0])).toBe(1)
})

test('a network failure restoring authentication keeps the token and permits retrying the quiz', async ({ page, api }) => {
  let unavailable = true
  api.handle('GET /users/me', async (route) => {
    if (unavailable) await route.abort('connectionfailed')
    else await route.fulfill({ json: user })
  })
  await page.goto(`/exams/${examId}/take`)
  await expect(page.getByRole('heading', { name: 'Chưa thể kiểm tra phiên đăng nhập', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('online-exam.access-token'))).toBe(token)
  expect(api.calls.some((call) => call.key.includes('/attempts'))).toBe(false)
  unavailable = false
  await page.getByRole('button', { name: 'Thử lại kết nối', exact: true }).click()
  await expect(radio(page, 'Boolean')).toBeVisible()
  await expect(page).toHaveURL(`/exams/${examId}/take`)
})

test('deadline submits automatically and shows the score returned by the backend', async ({ page, api }) => {
  const now = new Date('2026-10-04T10:00:00.000Z')
  api.deadlineAt = new Date(now.getTime() + 60_000).toISOString()
  await page.clock.install({ time: now })
  await openQuiz(page)
  await page.clock.fastForward(61_000)
  await expect(page).toHaveURL(`/attempts/${attemptId}/result`)
  await expect(page.getByLabel('Điểm bài thi', { exact: true })).toContainText(/7[,.]5\s*\/\s*10/)
  expect(submitCalls(api)).toHaveLength(1)
})

test('a deadline reached offline locks answers and submits as soon as connectivity returns', async ({ page, context, api }) => {
  const now = new Date('2026-10-04T10:00:00.000Z')
  api.deadlineAt = new Date(now.getTime() + 60_000).toISOString()
  await page.clock.install({ time: now })
  await openQuiz(page)
  await context.setOffline(true)
  await page.clock.fastForward(61_000)
  await expect(radio(page, 'Boolean')).toBeDisabled()
  await expect(page.getByText(/Đã hết thời gian/).first()).toBeVisible()
  expect(submitCalls(api)).toHaveLength(0)
  await context.setOffline(false)
  await expect(page).toHaveURL(`/attempts/${attemptId}/result`)
  expect(submitCalls(api)).toHaveLength(1)
})

test('manual submit waits for save and prevents another request while submission is pending', async ({ page, api }) => {
  let releaseSave: () => void = () => {}
  const pendingSave = new Promise<void>((resolve) => { releaseSave = resolve })
  api.handle(`PUT /attempts/${attemptId}/answers/${questionIds[0]}`, async (route) => {
    await pendingSave
    api.answers.set(questionIds[0], 1)
    await route.fulfill({ json: { questionId: questionIds[0], selectedOptionIndex: 1, savedAt: new Date().toISOString() } })
  })
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  api.handle(`POST /attempts/${attemptId}/submit`, async (route) => {
    await pending
    api.submitted = true
    await route.fulfill({ json: {
      attempt: { id: attemptId, examId, examTitle: exam.title, status: 'SUBMITTED', startedAt: new Date().toISOString(), deadlineAt: api.deadlineAt, submittedAt: new Date().toISOString() },
      summary: { score: 7.5, maxScore: 10, totalQuestions: 2, correctCount: 1, incorrectCount: 1, unansweredCount: 0 },
      questions: questions.map((question, index) => ({ ...question, selectedOptionIndex: index === 0 ? 1 : 0, correctOptionIndex: index === 0 ? 1 : 2, isCorrect: index === 0 })),
    } })
  })
  await openQuiz(page)
  await radio(page, 'Boolean').check()
  await expect.poll(() => saveCalls(api).length).toBe(1)
  await confirmSubmit(page)
  try {
    await expect(radio(page, 'Boolean')).toBeDisabled()
    expect(submitCalls(api)).toHaveLength(0)
    releaseSave()
    await expect.poll(() => submitCalls(api).length).toBe(1)
    await expect(page.getByRole('button', { name: /Đang nộp/ }).first()).toBeDisabled()
    await expect(radio(page, 'Boolean')).toBeDisabled()
    expect(submitCalls(api)).toHaveLength(1)
  } finally { releaseSave(); release() }
  await expect(page).toHaveURL(`/attempts/${attemptId}/result`)
  expect(api.calls.findIndex((call) => call.key.endsWith('/submit'))).toBeGreaterThan(api.calls.findIndex((call) => call.key.startsWith('PUT /attempts/')))
})

test('reloading an already submitted attempt retrieves its result without starting another attempt', async ({ page, api }) => {
  await openQuiz(page)
  const startCount = api.calls.filter((call) => call.key === `POST /exams/${examId}/attempts`).length
  api.submitted = true
  await page.reload()
  await expect(page).toHaveURL(`/attempts/${attemptId}/result`)
  expect(api.calls.filter((call) => call.key === `POST /exams/${examId}/attempts`)).toHaveLength(startCount)
})

test('a lost successful submit response recovers the graded result without resubmitting', async ({ page, api }) => {
  api.handle(`POST /attempts/${attemptId}/submit`, async (route) => {
    api.submitted = true
    await route.abort('connectionfailed')
  })
  await openQuiz(page)
  await confirmSubmit(page)
  await expect(page).toHaveURL(`/attempts/${attemptId}/result`)
  await expect(page.getByLabel('Điểm bài thi', { exact: true })).toContainText(/7[,.]5\s*\/\s*10/)
  expect(submitCalls(api)).toHaveLength(1)
})

test('cancel requires confirmation and leaves a cancelled entry in history', async ({ page, api }) => {
  await openQuiz(page)
  await radio(page, 'Boolean').check()
  await expectSaved(page)
  await page.getByRole('button', { name: 'Hủy bài', exact: true }).click()
  await page.getByRole('button', { name: 'Tiếp tục làm bài', exact: true }).click()
  expect(api.calls.filter((call) => call.key.startsWith('DELETE'))).toHaveLength(0)
  await page.getByRole('button', { name: 'Hủy bài', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận hủy bài', exact: true }).click()
  await expect(page).toHaveURL('/history')
  await expect(page.getByRole('article').getByText('Đã hủy', { exact: true })).toBeVisible()
  expect(api.calls.filter((call) => call.key === `DELETE /attempts/${attemptId}`)).toHaveLength(1)
  expect(submitCalls(api)).toHaveLength(0)
  expect(api.answers.get(questionIds[0])).toBe(1)
})

test('result renders authoritative backend scoring and answer explanations', async ({ page, api }) => {
  api.submitted = true
  api.resultScore = 8.25
  api.answers.set(questionIds[0], 1)
  api.answers.set(questionIds[1], 0)
  await page.goto(`/attempts/${attemptId}/result`)
  await expect(page.getByRole('heading', { name: 'Kết quả bài làm', exact: true })).toBeVisible()
  await expect(page.getByLabel('Điểm bài thi', { exact: true })).toContainText(/8[,.]25\s*\/\s*10/)
  await expect(page.getByText(questions[0].content, { exact: true })).toBeVisible()
  await expect(page.getByText(questions[1].content, { exact: true })).toBeVisible()
  await expect(page.getByText(/Đáp án đúng/).first()).toBeVisible()
  expect(submitCalls(api)).toHaveLength(0)
})

test('history filters server records and only offers actions appropriate to each status', async ({ page, api }) => {
  api.history = [item(attemptId, 'SUBMITTED', 'Bài đã chấm'), item('670005555555555555555555', 'IN_PROGRESS', 'Bài đang làm'), item('670006666666666666666666', 'CANCELLED', 'Bài đã hủy')]
  await page.goto('/history')
  await expect(page.getByRole('heading', { name: 'Lịch sử làm bài', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Xem kết quả', exact: true })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Tiếp tục bài', exact: true })).toHaveCount(1)
  await page.getByLabel('Trạng thái bài làm', { exact: true }).selectOption('CANCELLED')
  await expect(page.getByText('Bài đã hủy', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Xem kết quả', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Tiếp tục bài', exact: true })).toHaveCount(0)
  await expect(page.getByText('Bài đã chấm', { exact: true })).toHaveCount(0)
  expect(api.calls.filter((call) => call.key === 'GET /attempts').at(-1)?.url).toContain('status=CANCELLED')
})

test('history pagination requests a new server page', async ({ page, api }) => {
  api.history = Array.from({ length: 12 }, (_, index) => item(`6700077777777777777777${String(index).padStart(2, '0')}`, 'SUBMITTED', `Bài kiểm tra ${index + 1}`))
  await page.goto('/history')
  await expect(page.getByText('Bài kiểm tra 1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
  await expect(page.getByText('Bài kiểm tra 11', { exact: true })).toBeVisible()
  await expect(page.getByText('Bài kiểm tra 1', { exact: true })).toHaveCount(0)
  expect(api.calls.filter((call) => call.key === 'GET /attempts').at(-1)?.url).toContain('page=2')
  await page.getByRole('button', { name: 'Trang trước', exact: true }).click()
  await expect(page.getByText('Bài kiểm tra 1', { exact: true })).toBeVisible()
})

test('exam managers cannot open student-only quiz and history routes', async ({ page, api }) => {
  api.role = 'EXAM_MANAGER'
  for (const path of [`/exams/${examId}/take`, '/history', `/attempts/${attemptId}/result`]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Chức năng dành cho học sinh', exact: true })).toBeVisible()
    await expect(page.getByRole('radio')).toHaveCount(0)
  }
  expect(api.calls.some((call) => call.key.includes('/attempts'))).toBe(false)
})

test('quiz and result remain usable at small widths and in dark mode', async ({ page, api }) => {
  await page.addInitScript(() => localStorage.setItem('online-exam.theme', 'dark'))
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await openQuiz(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: 'Nộp bài', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
  await capturePreview(page, 'test-results/preview-quiz-dark-mobile.png')
  api.submitted = true
  api.answers.set(questionIds[0], 1)
  api.answers.set(questionIds[1], 0)
  await page.goto(`/attempts/${attemptId}/result`)
  await expect(page.getByLabel('Điểm bài thi', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await capturePreview(page, 'test-results/preview-attempt-result-dark-mobile.png')
})
