import { expect, test as base } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import type { ExamPayload, ExamStudentResult, ManagerExam, ManagerQuestion, QuestionPayload } from '../src/api/manager-exams'

type Role = 'STUDENT' | 'EXAM_MANAGER' | 'ADMIN'
const draftId = '67000aaaaaaaaaaaaaaaaaaa'
const publishedId = '67000bbbbbbbbbbbbbbbbbbb'
const closedId = '67000ccccccccccccccccccc'
const token = 'mock-manager-token'
const timestamp = '2026-09-01T08:00:00.000Z'
let serial = 500
const newId = () => (++serial).toString(16).padStart(24, 'a')
const makeQuestion = (position: number, content = `Câu hỏi gốc ${position}`): ManagerQuestion => ({
  id: newId(), content, position,
  options: ['Một', 'Hai', 'Ba', 'Bốn'].map((value, index) => ({ id: newId(), content: value, position: index + 1, isCorrect: index === 1 })),
})
const makeExam = (id: string, title: string, status: ManagerExam['status'], questions: ManagerQuestion[] = []): ManagerExam => ({
  id, title, status, description: 'Mô tả đề', instructions: 'Chọn một đáp án.', durationMinutes: 15,
  totalQuestions: questions.length, questions,
})
type Call = { key: string; body: unknown; authorization?: string; url: string }
type MockApi = {
  role: Role; calls: Call[]; exams: ManagerExam[]; rows: ExamStudentResult[]
  handle: (key: string, handler: (route: Route) => Promise<void>) => void
}
const test = base.extend<{ api: MockApi }>({
  api: [async ({ page }, use) => {
    const overrides = new Map<string, (route: Route) => Promise<void>>()
    const unexpected: string[] = []
    const api: MockApi = {
      role: 'EXAM_MANAGER', calls: [], handle: (key, handler) => overrides.set(key, handler),
      exams: [makeExam(draftId, 'Đề nháp', 'DRAFT', [makeQuestion(1), makeQuestion(2)]), makeExam(publishedId, 'Đề đang mở', 'PUBLISHED'), makeExam(closedId, 'Đề đã đóng', 'CLOSED')],
      rows: Array.from({ length: 13 }, (_, index): ExamStudentResult => ({
        id: newId(), status: index < 11 ? 'SUBMITTED' : index === 11 ? 'CANCELLED' : 'IN_PROGRESS',
        startedAt: timestamp, deadlineAt: timestamp,
        submittedAt: index < 11 ? timestamp : null, cancelledAt: index === 11 ? timestamp : null,
        score: index < 11 ? 8.75 : null, totalQuestions: 20, correctCount: index < 11 ? 17 : null, incorrectCount: index < 11 ? 3 : null,
        user: { id: newId(), email: `student${index + 1}@example.com`, fullName: `Học sinh ${index + 1}` },
      })),
    }
    await page.addInitScript((value) => {
      if (!sessionStorage.getItem('manager-mock-seeded')) {
        localStorage.setItem('online-exam.access-token', value)
        sessionStorage.setItem('manager-mock-seeded', 'true')
      }
    }, token)
    // All calls are intercepted: CRUD tests never write to real exams or users.
    await page.route('http://localhost:3000/api/v1/**', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: {
          'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
        } })
        return
      }
      const url = new URL(request.url())
      const path = url.pathname.replace('/api/v1', '')
      const key = `${request.method()} ${path}`
      api.calls.push({ key, body: request.postDataJSON(), authorization: request.headers().authorization, url: url.toString() })
      const override = overrides.get(key)
      if (override) { await override(route); return }
      if (key === 'GET /users/me') {
        await route.fulfill({ json: { id: '67000ddddddddddddddddddd', email: 'manager@example.com', fullName: 'Nguyễn Quản Lý', role: api.role, createdAt: timestamp, updatedAt: timestamp } }); return
      }
      if (key === 'GET /attempts') { await route.fulfill({ json: { items: [], meta: { page: 1, limit: 6, total: 0, totalPages: 0 } } }); return }
      if (key === 'GET /exams') { await route.fulfill({ json: api.exams }); return }
      if (key === 'POST /exams') {
        const payload = request.postDataJSON() as ExamPayload
        const exam = { ...makeExam(newId(), payload.title, 'DRAFT'), ...payload }
        api.exams.push(exam); await route.fulfill({ status: 201, json: exam }); return
      }
      const parts = path.split('/')
      const exam = api.exams.find((item) => item.id === parts[2])
      if (exam && parts.length === 3) {
        if (request.method() === 'GET') { await route.fulfill({ json: exam }); return }
        if (request.method() === 'PATCH') { Object.assign(exam, request.postDataJSON()); await route.fulfill({ json: exam }); return }
        if (request.method() === 'DELETE') { api.exams = api.exams.filter((item) => item.id !== exam.id); await route.fulfill({ status: 204 }); return }
      }
      if (exam && key === `PUT /exams/${exam.id}/publish`) {
        exam.status = 'PUBLISHED'; await route.fulfill({ json: exam }); return
      }
      if (exam && key === `PUT /exams/${exam.id}/close`) {
        exam.status = 'CLOSED'; await route.fulfill({ json: exam }); return
      }
      if (exam && parts[3] === 'questions') {
        const questions = exam.questions ?? []
        const selected = questions.find((question) => question.id === parts[4])
        if ((request.method() === 'POST' && parts.length === 4) || (request.method() === 'PATCH' && selected)) {
          const payload = request.postDataJSON() as QuestionPayload
          const question: ManagerQuestion = { id: selected?.id ?? newId(), content: payload.content, position: payload.position,
            options: payload.options.map((content, index) => ({ id: newId(), content, position: index + 1, isCorrect: index === payload.correctOptionIndex })),
          }
          exam.questions = selected ? questions.map((item) => item.id === selected.id ? question : item) : [...questions, question]
          exam.totalQuestions = exam.questions.length
          await route.fulfill({ status: request.method() === 'POST' ? 201 : 200, json: question }); return
        }
        if (request.method() === 'DELETE' && selected) {
          exam.questions = questions.filter((question) => question.id !== selected.id); exam.totalQuestions = exam.questions.length
          await route.fulfill({ status: 204 }); return
        }
      }
      if (exam && key === `GET /exams/${exam.id}/results`) {
        const pageNumber = Number(url.searchParams.get('page') ?? 1)
        const limit = Number(url.searchParams.get('limit') ?? 10)
        const status = url.searchParams.get('status')
        const filtered = api.rows.filter((row) => !status || row.status === status)
        await route.fulfill({ json: { exam, data: filtered.slice((pageNumber - 1) * limit, pageNumber * limit),
          meta: { page: pageNumber, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) },
          // Deliberately differs from visible row scores: the UI must use server statistics.
          summary: { totalAttempts: 13, submittedCount: 11, inProgressCount: 1, cancelledCount: 1, averageScore: 3.25, highestScore: 9.75, lowestScore: 1.5 },
        } }); return
      }
      unexpected.push(key)
      await route.fulfill({ status: 501, json: { message: 'Unexpected manager mock endpoint' } })
    })
    await use(api)
    expect(unexpected, 'Every manager API call requires an explicit mock').toEqual([])
    expect(api.calls.every((call) => call.authorization === `Bearer ${token}`), 'All protected requests carry the current token').toBe(true)
  }, { auto: true }],
})
const mutations = (api: MockApi) => api.calls.filter((call) => !call.key.startsWith('GET '))
const response = (status: number, message: string) => async (route: Route) => { await route.fulfill({ status, json: { message } }) }
async function openDraft(page: Page) {
  await page.goto(`/manage/exams/${draftId}`)
  await expect(page.getByRole('heading', { name: 'Đề nháp', exact: true })).toBeVisible()
}
async function fillQuestion(page: Page, content: string) {
  await page.getByRole('textbox', { name: 'Nội dung câu hỏi', exact: true }).fill(content)
  for (let index = 1; index <= 4; index++) await page.getByLabel(`Đáp án ${index}`, { exact: true }).fill(`Lựa chọn ${index}`)
}
async function changeSpaPath(page: Page, path: string) {
  await page.evaluate((target) => {
    history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}
async function noOverflow(page: Page) {
  const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(width.content).toBeLessThanOrEqual(width.viewport)
}

test('manager list filters all statuses, searches and resets pagination', async ({ page, api }) => {
  api.exams.push(...Array.from({ length: 12 }, (_, index) => makeExam(newId(), `Đề bổ sung ${index}`, 'DRAFT')))
  await page.goto('/manage/exams')
  await expect(page.getByRole('heading', { name: 'Quản lý đề thi', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Quản lý đề', exact: true })).toBeVisible()
  const pagination = page.getByRole('navigation', { name: 'Phân trang đề quản lý' })
  await expect(pagination).toContainText('Trang 1 / 2')
  await pagination.getByRole('button', { name: 'Trang sau' }).click()
  await expect(pagination).toContainText('Trang 2 / 2')
  await page.getByLabel('Trạng thái đề').selectOption('PUBLISHED')
  await expect(page.getByRole('heading', { name: 'Đề đang mở', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Đề nháp', exact: true })).toHaveCount(0)
  await expect(pagination).toHaveCount(0)
  await page.getByLabel('Trạng thái đề').selectOption('CLOSED')
  await expect(page.getByRole('heading', { name: 'Đề đã đóng', exact: true })).toBeVisible()
  await page.getByLabel('Trạng thái đề').selectOption('')
  await page.getByLabel('Tìm đề thi').fill('  ĐỀ NHÁP  ')
  await expect(page.getByRole('heading', { name: 'Đề nháp', exact: true })).toBeVisible()
  expect(mutations(api)).toEqual([])
})

test('creates and edits a draft with trimmed metadata and integer duration', async ({ page, api }) => {
  await page.goto('/manage/exams')
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  await page.getByRole('button', { name: 'Lưu đề mới' }).click()
  await expect(page.getByRole('alert')).toContainText('Tên đề thi cần')
  expect(mutations(api)).toEqual([])
  await page.getByLabel('Tên đề thi').fill('  Đề mới từ giao diện  ')
  await page.getByLabel('Mô tả', { exact: true }).fill('  Mô tả mới  ')
  await page.getByLabel('Hướng dẫn').fill('  Đọc kỹ câu hỏi  ')
  await page.getByLabel('Thời gian (phút)').fill('0')
  await page.getByRole('button', { name: 'Lưu đề mới' }).click()
  await expect(page.getByRole('alert')).toContainText('Thời gian phải là số nguyên')
  expect(mutations(api)).toEqual([])
  await page.getByLabel('Thời gian (phút)').fill('25')
  await page.getByRole('button', { name: 'Lưu đề mới' }).click()
  await expect(page.getByRole('heading', { name: 'Đề mới từ giao diện', exact: true })).toBeVisible()
  expect(mutations(api)[0]).toMatchObject({ key: 'POST /exams', body: { title: 'Đề mới từ giao diện', description: 'Mô tả mới', instructions: 'Đọc kỹ câu hỏi', durationMinutes: 25 } })
  await expect(page.getByRole('button', { name: 'Mở đề thi', exact: true })).toBeDisabled()
  await page.getByLabel('Tên đề thi').fill('Đề đã sửa')
  await page.getByRole('button', { name: 'Lưu thông tin đề' }).click()
  await expect(page.getByRole('heading', { name: 'Đề đã sửa', exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Đã lưu thông tin đề thi')
  expect(api.exams.at(-1)?.title).toBe('Đề đã sửa')
})

test('question validation, creation and correct-option reindexing send the agreed API payload', async ({ page, api }) => {
  await openDraft(page)
  await page.getByRole('button', { name: 'Lưu câu hỏi' }).click()
  await expect(page.getByRole('alert')).toContainText('Hãy nhập nội dung câu hỏi')
  await page.getByLabel('Nội dung câu hỏi').fill('  Câu mới  ')
  await page.getByRole('button', { name: 'Lưu câu hỏi' }).click()
  await expect(page.getByRole('alert')).toContainText('ít nhất hai đáp án có nội dung')
  await fillQuestion(page, '  Câu mới  ')
  await page.getByRole('button', { name: 'Lưu câu hỏi' }).click()
  await expect(page.getByRole('alert')).toContainText('Hãy chọn đúng một đáp án đúng')
  expect(mutations(api)).toEqual([])
  await page.getByLabel('Đáp án đúng 3', { exact: true }).check()
  await page.getByRole('button', { name: 'Lưu câu hỏi' }).click()
  await expect(page.getByRole('heading').filter({ hasText: 'Câu 3. Câu mới' })).toBeVisible()
  expect(mutations(api)[0]).toMatchObject({ key: `POST /exams/${draftId}/questions`, body: { content: 'Câu mới', position: 3, options: ['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3', 'Lựa chọn 4'], correctOptionIndex: 2 } })
  await page.getByRole('button', { name: 'Sửa câu hỏi 3', exact: true }).click()
  await page.getByLabel('Nội dung câu hỏi').fill('Câu đã sửa')
  await page.getByRole('button', { name: 'Bỏ đáp án 1', exact: true }).click()
  await expect(page.getByLabel('Đáp án đúng 2', { exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Lưu câu hỏi' }).click()
  await expect(page.getByRole('heading').filter({ hasText: 'Câu 3. Câu đã sửa' })).toBeVisible()
  expect(mutations(api).at(-1)?.body).toEqual({ content: 'Câu đã sửa', position: 3, options: ['Lựa chọn 2', 'Lựa chọn 3', 'Lựa chọn 4'], correctOptionIndex: 1 })
  expect(api.exams[0].questions?.at(-1)?.options.filter((option) => option.isCorrect)).toHaveLength(1)
})

test('deleting a question requires confirmation and cancelling keeps all options', async ({ page, api }) => {
  await openDraft(page)
  const questionId = api.exams[0].questions![0].id
  await page.getByRole('button', { name: 'Xóa câu hỏi 1', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Câu hỏi gốc 1')
  await page.getByRole('dialog').getByRole('button', { name: 'Hủy', exact: true }).click()
  expect(mutations(api)).toEqual([])
  expect(api.exams[0].questions![0].options).toHaveLength(4)
  await page.getByRole('button', { name: 'Xóa câu hỏi 1', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận xóa câu hỏi' }).click()
  await expect(page.getByRole('heading').filter({ hasText: 'Câu 1. Câu hỏi gốc 1' })).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Đã xóa câu hỏi')
  expect(mutations(api).map((call) => call.key)).toEqual([`DELETE /exams/${draftId}/questions/${questionId}`])
})

test('publish and close are confirmed, blocked while saving and lock draft editing', async ({ page, api }) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  api.handle(`PUT /exams/${draftId}/publish`, async (route) => {
    await held
    api.exams[0].status = 'PUBLISHED'
    await route.fulfill({ json: api.exams[0] })
  })
  await openDraft(page)
  await page.getByRole('button', { name: 'Mở đề thi', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Hủy', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  expect(mutations(api)).toEqual([])
  await page.getByRole('button', { name: 'Mở đề thi', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận mở đề' }).click()
  try {
    await expect(page.getByRole('button', { name: 'Đang xử lý…' })).toBeDisabled()
    await expect(page.getByLabel('Tên đề thi')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Sửa câu hỏi 1', exact: true })).toBeDisabled()
    expect(mutations(api).filter((call) => call.key.endsWith('/publish'))).toHaveLength(1)
  } finally { release() }
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Lưu thông tin đề' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Soạn câu hỏi' })).toHaveCount(0)
  await expect(page.getByLabel('Tên đề thi')).toBeDisabled()
  await page.getByRole('button', { name: 'Đóng đề thi', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận đóng đề' }).click()
  await expect(page.getByRole('status')).toContainText('Đã đóng đề thi')
  expect(api.exams[0].status).toBe('CLOSED')
  await expect(page.getByRole('button', { name: 'Đóng đề thi', exact: true })).toHaveCount(0)
})

test('deleting a draft returns to the refreshed list with success notice', async ({ page, api }) => {
  await openDraft(page)
  await page.getByRole('button', { name: 'Xóa đề thi', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận xóa đề', exact: true }).click()
  await expect(page).toHaveURL('/manage/exams')
  await expect(page.getByRole('heading', { name: 'Đề nháp', exact: true })).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Đã xóa đề thi')
  expect(mutations(api).map((call) => call.key)).toEqual([`DELETE /exams/${draftId}`])
})

test('exam creation, updates and deletion notices each expire after one second', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-03T00:00:00Z') })
  await page.goto('/manage/exams')
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  await page.getByLabel('Tên đề thi').fill('Đề kiểm tra thông báo')
  await page.clock.pauseAt(new Date('2026-10-03T01:00:00Z'))
  await page.getByRole('button', { name: 'Lưu đề mới', exact: true }).click()

  async function expectNoticeToExpire(text: string) {
    const notice = page.getByRole('status').filter({ hasText: text })
    await expect(notice).toBeVisible()
    await page.clock.runFor(999)
    await expect(notice).toBeVisible()
    await page.clock.runFor(1)
    await expect(notice).toHaveCount(0)
  }

  await expectNoticeToExpire('Đã tạo đề thi bản nháp.')
  await page.getByRole('button', { name: 'Lưu thông tin đề', exact: true }).click()
  await expectNoticeToExpire('Đã lưu thông tin đề thi.')
  await page.getByRole('button', { name: 'Xóa đề thi', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận xóa đề', exact: true }).click()
  await expectNoticeToExpire('Đã xóa đề thi.')
})

test('students cannot mount privileged manager pages or call exam APIs', async ({ page, api }) => {
  api.role = 'STUDENT'
  for (const path of ['/manage/exams', `/manage/exams/${draftId}`, `/manage/exams/${draftId}/results`]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Chức năng dành cho người quản lý đề thi' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Quản lý đề', exact: true })).toHaveCount(0)
  }
  expect(api.calls.filter((call) => call.key.includes('/exams'))).toEqual([])
})

test('ADMIN can create exams using its own identity without an invented managerId', async ({ page, api }) => {
  api.role = 'ADMIN'
  await page.goto('/manage/exams')
  await expect(page.getByText('Quản lý đề thi của toàn hệ thống.')).toBeVisible()
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  await page.getByLabel('Tên đề thi').fill('Đề do quản trị tạo')
  await page.getByRole('button', { name: 'Lưu đề mới' }).click()
  await expect(page.getByRole('heading', { name: 'Đề do quản trị tạo', exact: true })).toBeVisible()
  expect(mutations(api)[0].body).toEqual({ title: 'Đề do quản trị tạo', description: '', instructions: '', durationMinutes: 15 })
})

test('student results use backend scores, whole-exam statistics, server filters and pagination', async ({ page, api }) => {
  await page.goto(`/manage/exams/${draftId}/results`)
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'student1@example.com' })).toContainText('8,75 / 10')
  await expect(page.getByRole('region', { name: 'Thống kê toàn bộ đề thi' })).toContainText('3,25')
  const pagination = page.getByRole('navigation', { name: 'Phân trang kết quả học sinh' })
  await expect(pagination).toContainText('Trang 1 / 2 · 13 lượt')
  await pagination.getByRole('button', { name: 'Trang sau' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'student11@example.com' })).toBeVisible()
  await expect(pagination).toContainText('Trang 2 / 2')
  await page.getByLabel('Trạng thái bài làm').selectOption('CANCELLED')
  await expect(pagination).toContainText('Trang 1 / 1 · 1 lượt')
  await expect(page.getByRole('row').filter({ hasText: 'student12@example.com' })).toContainText('Đã hủy')
  await expect(page.getByRole('region', { name: 'Thống kê toàn bộ đề thi' })).toContainText('3,25')
  const query = new URL(api.calls.filter((call) => call.key.endsWith('/results')).at(-1)!.url).searchParams
  expect(Object.fromEntries(query)).toEqual({ page: '1', limit: '10', status: 'CANCELLED' })
  await page.setViewportSize({ width: 320, height: 760 })
  await noOverflow(page)
})

test('a failed question save preserves the editor and a retry succeeds', async ({ page, api }) => {
  api.handle(`POST /exams/${draftId}/questions`, response(409, 'Position already taken'))
  await openDraft(page)
  await fillQuestion(page, 'Câu cần thử lại')
  await page.getByLabel('Đáp án đúng 1', { exact: true }).check()
  await page.getByRole('button', { name: 'Lưu câu hỏi' }).click()
  await expect(page.getByRole('alert')).toContainText('Vị trí câu hỏi đã được dùng')
  await expect(page.getByLabel('Nội dung câu hỏi')).toHaveValue('Câu cần thử lại')
  await expect(page.getByLabel('Đáp án đúng 1', { exact: true })).toBeChecked()
  api.handle(`POST /exams/${draftId}/questions`, async (route) => {
    const payload = route.request().postDataJSON() as QuestionPayload
    const question = { ...makeQuestion(payload.position, payload.content), options: payload.options.map((content, index) => ({ id: newId(), content, position: index + 1, isCorrect: index === payload.correctOptionIndex })) }
    api.exams[0].questions!.push(question)
    await route.fulfill({ status: 201, json: question })
  })
  await page.getByRole('button', { name: 'Lưu câu hỏi' }).click()
  await expect(page.getByRole('heading').filter({ hasText: 'Câu 3. Câu cần thử lại' })).toBeVisible()
  expect(mutations(api)).toHaveLength(2)
})

test('list load failures are retryable and forbidden detail exposes no editor or answer keys', async ({ page, api }) => {
  api.handle('GET /exams', response(500, 'Temporary catalog failure'))
  await page.goto('/manage/exams')
  await expect(page.getByRole('alert')).toBeVisible()
  api.handle('GET /exams', async (route) => { await route.fulfill({ json: api.exams }) })
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Đề nháp', exact: true })).toBeVisible()
  api.handle(`GET /exams/${draftId}`, response(403, 'You do not own this exam'))
  await page.goto(`/manage/exams/${draftId}`)
  await expect(page.getByRole('alert')).toContainText('Bạn chưa có quyền quản lý đề thi này')
  await expect(page.getByRole('region', { name: 'Soạn câu hỏi' })).toHaveCount(0)
  await expect(page.getByText('Đáp án đúng', { exact: true })).toHaveCount(0)
  expect(mutations(api)).toEqual([])
})

test('SPA changes to another exam discard the old question editor and destructive confirmation', async ({ page, api }) => {
  const second = makeExam(newId(), 'Đề nháp thứ hai', 'DRAFT', [makeQuestion(1, 'Câu của đề thứ hai')])
  api.exams.push(second)
  await openDraft(page)
  await page.getByRole('button', { name: 'Sửa câu hỏi 1', exact: true }).click()
  await page.getByLabel('Nội dung câu hỏi').fill('Nội dung chưa lưu ở đề cũ')
  await page.getByRole('button', { name: 'Xóa đề thi', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await changeSpaPath(page, `/manage/exams/${second.id}`)
  await expect(page.getByRole('heading', { name: second.title, exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Nội dung câu hỏi')).toHaveValue('')
  await expect(page.getByRole('heading', { name: 'Thêm câu hỏi', exact: true })).toBeVisible()
  expect(mutations(api)).toEqual([])
  expect(api.exams.some((exam) => exam.id === draftId)).toBe(true)
  await page.setViewportSize({ width: 320, height: 760 })
  await noOverflow(page)
  await page.screenshot({ path: 'test-results/manager-mobile-320.png', fullPage: true })
})
