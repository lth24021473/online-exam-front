import { expect, test as base } from '@playwright/test'
import type { Locator, Page, Route } from '@playwright/test'
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
function creationQuestion(page: Page, position = 1) {
  return page.getByRole('group', { name: `Câu hỏi ${position}`, exact: true })
}
async function fillCreationQuestion(question: Locator, content: string, correctAnswer = 2) {
  await question.getByRole('textbox', { name: 'Nội dung câu hỏi', exact: true }).fill(content)
  for (let index = 1; index <= 4; index++) await question.getByLabel(`Đáp án ${index}`, { exact: true }).fill(`Lựa chọn ${index}`)
  await question.getByLabel(`Đáp án đúng ${correctAnswer}`, { exact: true }).check()
}
async function confirmCreation(page: Page) {
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Bạn chắc chắn muốn tạo đề thi?', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click()
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

test('creates a complete draft with trimmed metadata and still supports detail editing', async ({ page, api }) => {
  await page.goto('/manage/exams')
  await page.getByRole('link', { name: 'Tạo đề thi', exact: true }).click()
  await expect(page).toHaveURL('/manage/exams/create')
  await expect(page.getByLabel('Hướng dẫn', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Tên đề thi cần')
  expect(mutations(api)).toEqual([])
  await page.getByLabel('Tên đề thi').fill('  Đề mới từ giao diện  ')
  await page.getByLabel('Mô tả', { exact: true }).fill('  Mô tả mới  ')
  await page.getByLabel('Thời gian làm bài (phút)').fill('0')
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Thời gian làm bài phải là số nguyên')
  expect(mutations(api)).toEqual([])
  await page.getByLabel('Thời gian làm bài (phút)').fill('25')
  await fillCreationQuestion(creationQuestion(page), '  Câu hỏi mới  ')
  await confirmCreation(page)
  await expect(page.getByRole('heading', { name: 'Đề mới từ giao diện', exact: true })).toBeVisible()
  expect(mutations(api)[0]).toMatchObject({ key: 'POST /exams', body: { title: 'Đề mới từ giao diện', description: 'Mô tả mới', instructions: '', durationMinutes: 25 } })
  await expect(page).toHaveURL(`/manage/exams/${api.exams.at(-1)!.id}`)
  await expect(page.getByRole('button', { name: 'Mở đề thi', exact: true })).toBeEnabled()
  await page.getByLabel('Tên đề thi').fill('Đề đã sửa')
  await page.getByLabel('Hướng dẫn').fill('Đọc kỹ câu hỏi')
  await page.getByLabel('Thời gian (phút)').fill('30')
  await page.getByRole('button', { name: 'Lưu thông tin đề' }).click()
  await expect(page.getByRole('heading', { name: 'Đề đã sửa', exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Đã lưu thông tin đề thi')
  expect(api.exams.at(-1)).toMatchObject({ title: 'Đề đã sửa', instructions: 'Đọc kỹ câu hỏi', durationMinutes: 30 })
})

test('creation confirmation waits for consent and cancelling retains all entered values', async ({ page, api }) => {
  await page.goto('/manage/exams/create')
  await page.getByLabel('Tên đề thi').fill('Đề chưa xác nhận')
  await page.getByLabel('Mô tả', { exact: true }).fill('Mô tả cần giữ')
  await page.getByLabel('Thời gian làm bài (phút)').fill('45')
  await fillCreationQuestion(creationQuestion(page), 'Câu chưa gửi', 3)
  await page.evaluate(() => window.scrollTo(0, 0))
  const clip = await page.evaluate(() => ({ x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
  await page.screenshot({ path: 'test-results/manager-create-desktop.png', fullPage: true, clip })
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Bạn chắc chắn muốn tạo đề thi?', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Hủy', exact: true })).toBeFocused()
  await page.screenshot({ path: 'test-results/manager-create-confirm-desktop.png' })
  expect(mutations(api)).toEqual([])
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tạo đề thi', exact: true })).toBeFocused()
  await expect(page).toHaveURL('/manage/exams/create')
  await expect(page.getByLabel('Tên đề thi')).toHaveValue('Đề chưa xác nhận')
  await expect(page.getByLabel('Mô tả', { exact: true })).toHaveValue('Mô tả cần giữ')
  await expect(page.getByLabel('Thời gian làm bài (phút)')).toHaveValue('45')
  await expect(creationQuestion(page).getByLabel('Nội dung câu hỏi')).toHaveValue('Câu chưa gửi')
  await expect(creationQuestion(page).getByLabel('Đáp án đúng 3', { exact: true })).toBeChecked()
  for (let index = 1; index <= 4; index++) await expect(creationQuestion(page).getByLabel(`Đáp án ${index}`, { exact: true })).toHaveValue(`Lựa chọn ${index}`)
  expect(mutations(api)).toEqual([])
})

test('creation validates each question and correct answer before opening confirmation', async ({ page, api }) => {
  await page.goto('/manage/exams/create')
  await page.getByLabel('Tên đề thi').fill('Đề cần kiểm tra')
  const first = creationQuestion(page)
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Hãy nhập nội dung câu hỏi')
  await first.getByLabel('Nội dung câu hỏi').fill('Câu đầu')
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Hãy nhập nội dung cho tất cả đáp án')
  for (let index = 1; index <= 4; index++) await first.getByLabel(`Đáp án ${index}`, { exact: true }).fill(`Lựa chọn ${index}`)
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Hãy chọn một đáp án đúng')
  await first.getByLabel('Đáp án đúng 1', { exact: true }).check()
  await page.getByRole('button', { name: 'Thêm câu hỏi', exact: true }).click()
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Hãy nhập nội dung câu hỏi')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(mutations(api)).toEqual([])
  await page.getByRole('button', { name: 'Xóa câu hỏi 2', exact: true }).click()
  await expect(creationQuestion(page, 2)).toHaveCount(0)
  await expect(first).toBeVisible()
  await expect(first.getByLabel('Đáp án đúng 1', { exact: true })).toBeChecked()
})

test('creation sends ordered questions and reindexes the selected answer after removing an option', async ({ page, api }) => {
  await page.goto('/manage/exams/create')
  await page.getByLabel('Tên đề thi').fill('Đề hai câu hỏi')
  await fillCreationQuestion(creationQuestion(page), '  Câu thứ nhất  ', 3)
  await creationQuestion(page).getByRole('button', { name: 'Bỏ đáp án 1', exact: true }).click()
  await expect(creationQuestion(page).getByLabel('Đáp án đúng 2', { exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Thêm câu hỏi', exact: true }).click()
  await fillCreationQuestion(creationQuestion(page, 2), '  Câu thứ hai  ', 4)
  await confirmCreation(page)
  await expect(page.getByRole('heading', { name: 'Đề hai câu hỏi', exact: true })).toBeVisible()
  const createdId = api.exams.at(-1)!.id
  expect(mutations(api).map((call) => ({ key: call.key, body: call.body }))).toEqual([
    { key: 'POST /exams', body: { title: 'Đề hai câu hỏi', description: '', instructions: '', durationMinutes: 15 } },
    { key: `POST /exams/${createdId}/questions`, body: { content: 'Câu thứ nhất', position: 1, options: ['Lựa chọn 2', 'Lựa chọn 3', 'Lựa chọn 4'], correctOptionIndex: 1 } },
    { key: `POST /exams/${createdId}/questions`, body: { content: 'Câu thứ hai', position: 2, options: ['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3', 'Lựa chọn 4'], correctOptionIndex: 3 } },
  ])
  expect(api.exams.at(-1)!.questions).toHaveLength(2)
  expect(api.exams.at(-1)!.questions!.map((question) => question.options.filter((option) => option.isCorrect).map((option) => option.content))).toEqual([['Lựa chọn 3'], ['Lựa chọn 4']])
})

test('retrying a partially saved creation preserves inputs without duplicating the draft or its questions', async ({ page, api }) => {
  const createdId = newId()
  api.handle('POST /exams', async (route) => {
    const exam = { ...makeExam(createdId, '', 'DRAFT'), ...route.request().postDataJSON() as ExamPayload, questions: [] }
    api.exams.push(exam)
    await route.fulfill({ status: 201, json: exam })
  })
  let failed = false
  api.handle(`POST /exams/${createdId}/questions`, async (route) => {
    const payload = route.request().postDataJSON() as QuestionPayload
    if (payload.position === 2 && !failed) {
      failed = true
      await route.fulfill({ status: 500, json: { message: 'Question save temporarily unavailable' } })
      return
    }
    const exam = api.exams.find((item) => item.id === createdId)!
    const question = { ...makeQuestion(payload.position, payload.content), options: payload.options.map((content, index) => ({ id: newId(), content, position: index + 1, isCorrect: index === payload.correctOptionIndex })) }
    exam.questions!.push(question)
    exam.totalQuestions = exam.questions!.length
    await route.fulfill({ status: 201, json: question })
  })
  await page.goto('/manage/exams/create')
  await page.getByLabel('Tên đề thi').fill('Đề thử lại')
  await fillCreationQuestion(creationQuestion(page), 'Câu đã lưu', 1)
  await page.getByRole('button', { name: 'Thêm câu hỏi', exact: true }).click()
  await fillCreationQuestion(creationQuestion(page, 2), 'Câu cần thử lại', 4)
  await confirmCreation(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL('/manage/exams/create')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Tên đề thi')).toHaveValue('Đề thử lại')
  await expect(creationQuestion(page, 2).getByLabel('Nội dung câu hỏi')).toHaveValue('Câu cần thử lại')
  await expect(creationQuestion(page, 2).getByLabel('Đáp án đúng 4', { exact: true })).toBeChecked()
  expect(api.exams.find((exam) => exam.id === createdId)!.questions).toHaveLength(1)
  await page.getByLabel('Tên đề thi').fill('Đề thử lại đã sửa')
  await creationQuestion(page).getByLabel('Nội dung câu hỏi').fill('Câu đã lưu được sửa')
  await confirmCreation(page)
  await expect(page).toHaveURL(`/manage/exams/${createdId}`)
  expect(mutations(api).filter((call) => call.key === 'POST /exams')).toHaveLength(1)
  const savedQuestions = mutations(api).filter((call) => call.key === `POST /exams/${createdId}/questions`).map((call) => call.body as QuestionPayload)
  expect(savedQuestions.map((question) => question.position)).toEqual([1, 2, 2])
  expect(api.exams.find((exam) => exam.id === createdId)!.title).toBe('Đề thử lại đã sửa')
  expect(api.exams.find((exam) => exam.id === createdId)!.questions!.map((question) => question.content)).toEqual(['Câu đã lưu được sửa', 'Câu cần thử lại'])
  expect(mutations(api).filter((call) => call.key.startsWith('PATCH '))).toHaveLength(2)
})

test('a saved question with a lost response is recovered on retry without creating it twice', async ({ page, api }) => {
  const createdId = newId()
  api.handle('POST /exams', async (route) => {
    const exam = { ...makeExam(createdId, '', 'DRAFT'), ...route.request().postDataJSON() as ExamPayload, questions: [] }
    api.exams.push(exam)
    await route.fulfill({ status: 201, json: exam })
  })
  api.handle(`POST /exams/${createdId}/questions`, async (route) => {
    const payload = route.request().postDataJSON() as QuestionPayload
    const exam = api.exams.find((item) => item.id === createdId)!
    exam.questions!.push({ ...makeQuestion(payload.position, payload.content), options: payload.options.map((content, index) => ({ id: newId(), content, position: index, isCorrect: index === payload.correctOptionIndex })) })
    exam.totalQuestions = exam.questions!.length
    await route.abort('connectionfailed')
  })
  await page.goto('/manage/exams/create')
  await page.getByLabel('Tên đề thi').fill('Đề đã lưu khi mất phản hồi')
  await fillCreationQuestion(creationQuestion(page), 'Câu đã được máy chủ lưu')
  await confirmCreation(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await confirmCreation(page)
  await expect(page).toHaveURL(`/manage/exams/${createdId}`)
  expect(mutations(api).map((call) => call.key)).toEqual(['POST /exams', `POST /exams/${createdId}/questions`])
  expect(api.exams.at(-1)!.questions).toHaveLength(1)
})

test('a lost exam creation response asks to check the saved drafts and prevents duplicate creation', async ({ page, api }) => {
  api.handle('POST /exams', async (route) => {
    api.exams.push({ ...makeExam(newId(), '', 'DRAFT'), ...route.request().postDataJSON() as ExamPayload })
    await route.abort('connectionfailed')
  })
  await page.goto('/manage/exams/create')
  await page.getByLabel('Tên đề thi').fill('Đề cần kiểm tra trước khi tạo lại')
  await fillCreationQuestion(creationQuestion(page), 'Câu đang soạn')
  await confirmCreation(page)
  await expect(page.getByRole('alert')).toContainText('Chưa thể xác nhận đề thi đã được tạo hay chưa')
  await expect(page.getByRole('button', { name: 'Tạo đề thi', exact: true })).toBeDisabled()
  await expect(creationQuestion(page).getByLabel('Nội dung câu hỏi')).toHaveValue('Câu đang soạn')
  await page.getByRole('link', { name: 'Kiểm tra danh sách đề thi', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Đề cần kiểm tra trước khi tạo lại', exact: true })).toBeVisible()
  expect(mutations(api).map((call) => call.key)).toEqual(['POST /exams'])
})

test('creation confirmation prevents repeated submission while a save is pending', async ({ page, api }) => {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  api.handle('POST /exams', async (route) => {
    await pending
    const exam = { ...makeExam(newId(), '', 'DRAFT'), ...route.request().postDataJSON() as ExamPayload }
    api.exams.push(exam)
    await route.fulfill({ status: 201, json: exam })
  })
  await page.goto('/manage/exams/create')
  await page.getByLabel('Tên đề thi').fill('Đề chỉ tạo một lần')
  await fillCreationQuestion(creationQuestion(page), 'Câu đầu')
  await confirmCreation(page)
  try {
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Đang tạo…', exact: true })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Hủy', exact: true })).toBeDisabled()
    await dialog.press('Escape')
    await expect(dialog).toBeVisible()
    expect(mutations(api)).toHaveLength(1)
  } finally { release() }
  await expect(page.getByRole('heading', { name: 'Đề chỉ tạo một lần', exact: true })).toBeVisible()
  expect(mutations(api).filter((call) => call.key === 'POST /exams')).toHaveLength(1)
})

test('mobile creation form and centered confirmation remain within the viewport', async ({ page, api }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto('/manage/exams/create')
  await page.getByLabel('Tên đề thi').fill('Đề trên điện thoại')
  await fillCreationQuestion(creationQuestion(page), 'Câu hỏi trên điện thoại')
  await noOverflow(page)
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Bạn chắc chắn muốn tạo đề thi?', exact: true })
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  expect(Math.abs(box!.y + box!.height / 2 - 380)).toBeLessThan(3)
  await noOverflow(page)
  await page.screenshot({ path: 'test-results/manager-create-confirm-mobile-320.png' })
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click()
  await expect(creationQuestion(page).getByLabel('Nội dung câu hỏi')).toHaveValue('Câu hỏi trên điện thoại')
  expect(mutations(api)).toEqual([])
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
    await expect(page.getByRole('button', { name: 'Sửa câu hỏi 1', exact: true, includeHidden: true })).toBeDisabled()
    expect(mutations(api).filter((call) => call.key.endsWith('/publish'))).toHaveLength(1)
  } finally { release() }
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Lưu thông tin đề' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Soạn câu hỏi' })).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'Thông tin đề thi', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Tên đề thi', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Xóa hẳn đề', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Đóng đề thi', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận đóng đề' }).click()
  await expect(page.getByRole('status')).toContainText('Đã đóng đề thi')
  expect(api.exams[0].status).toBe('CLOSED')
  await expect(page.getByRole('button', { name: 'Đóng đề thi', exact: true })).toHaveCount(0)
})

test('permanently deleting a draft returns to the refreshed list with success notice', async ({ page, api }) => {
  await openDraft(page)
  await page.getByRole('button', { name: 'Xóa hẳn đề', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận xóa đề', exact: true }).click()
  await expect(page).toHaveURL('/manage/exams')
  await expect(page.getByRole('heading', { name: 'Đề nháp', exact: true })).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Đã xóa hẳn đề thi')
  expect(mutations(api).map((call) => call.key)).toEqual([`DELETE /exams/${draftId}`])
})

test('closed details show compact metadata and cancellation preserves the exam and its questions', async ({ page, api }) => {
  const exam = api.exams.find((item) => item.id === closedId)!
  exam.questions = [makeQuestion(1, 'Câu hỏi đã khóa')]
  exam.totalQuestions = 1
  await page.goto(`/manage/exams/${closedId}`)
  await expect(page.getByRole('heading', { name: exam.title, exact: true })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Thông tin đề thi', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByText(exam.description!, { exact: true })).toBeVisible()
  await expect(page.getByText(exam.instructions!, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Câu hỏi (1)', exact: true })).toBeInViewport()
  await page.screenshot({ path: 'test-results/manager-closed-detail-desktop.png' })
  await expect(page.getByRole('link', { name: 'Kết quả học sinh', exact: true })).toHaveAttribute('href', `/manage/exams/${closedId}/results`)
  const remove = page.getByRole('button', { name: 'Xóa hẳn đề', exact: true })
  await remove.click()
  const dialog = page.getByRole('dialog', { name: 'Xóa hẳn đề thi?', exact: true })
  await expect(dialog).toContainText('không thể hoàn tác')
  await expect(dialog.getByRole('button', { name: 'Hủy', exact: true })).toBeFocused()
  expect(mutations(api)).toEqual([])
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(remove).toBeFocused()
  await expect(page).toHaveURL(`/manage/exams/${closedId}`)
  await expect(page.getByRole('heading', { name: 'Câu 1. Câu hỏi đã khóa', exact: true })).toBeVisible()
  expect(exam.questions).toHaveLength(1)
  expect(api.exams).toHaveLength(3)
  expect(mutations(api)).toEqual([])
  await page.setViewportSize({ width: 320, height: 760 })
  await noOverflow(page)
  await remove.click()
  const box = await dialog.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  await noOverflow(page)
  await page.screenshot({ path: 'test-results/manager-closed-delete-mobile-320.png' })
  await dialog.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(mutations(api)).toEqual([])
})

test('closed exam deletion waits for confirmation and sends one scoped request while pending', async ({ page, api }) => {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  api.handle(`DELETE /exams/${closedId}`, async (route) => {
    await pending
    api.exams = api.exams.filter((exam) => exam.id !== closedId)
    await route.fulfill({ status: 204 })
  })
  await page.goto(`/manage/exams/${closedId}`)
  await page.getByRole('button', { name: 'Xóa hẳn đề', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Xóa hẳn đề thi?', exact: true })
  expect(mutations(api)).toEqual([])
  await dialog.getByRole('button', { name: 'Xác nhận xóa đề', exact: true }).click()
  try {
    await expect(dialog.getByRole('button', { name: 'Đang xử lý…', exact: true })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Hủy', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Xóa hẳn đề', exact: true, includeHidden: true })).toBeDisabled()
    await page.keyboard.press('Tab')
    await expect(dialog).toBeFocused()
    await dialog.press('Escape')
    await expect(dialog).toBeVisible()
    expect(mutations(api).map((call) => call.key)).toEqual([`DELETE /exams/${closedId}`])
  } finally { release() }
  await expect(page).toHaveURL('/manage/exams')
  await expect(page.getByRole('heading', { name: 'Đề đã đóng', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Đề nháp', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Đề đang mở', exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Đã xóa hẳn đề thi')
  expect(api.exams.map((exam) => exam.id)).toEqual([draftId, publishedId])
  expect(mutations(api).map((call) => call.key)).toEqual([`DELETE /exams/${closedId}`])
})

test('a refused permanent deletion keeps the published exam available without an editor', async ({ page, api }) => {
  api.handle(`DELETE /exams/${publishedId}`, response(403, 'You do not own this exam'))
  await page.goto(`/manage/exams/${publishedId}`)
  await expect(page.getByRole('heading', { name: 'Đề đang mở', exact: true })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Thông tin đề thi', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Xóa hẳn đề', exact: true }).click()
  await page.getByRole('dialog', { name: 'Xóa hẳn đề thi?', exact: true }).getByRole('button', { name: 'Xác nhận xóa đề', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Bạn chưa có quyền quản lý đề thi này')
  await expect(page).toHaveURL(`/manage/exams/${publishedId}`)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Đề đang mở', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Xóa hẳn đề', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Đóng đề thi', exact: true })).toBeEnabled()
  expect(api.exams.some((exam) => exam.id === publishedId)).toBe(true)
  expect(mutations(api).map((call) => call.key)).toEqual([`DELETE /exams/${publishedId}`])
})

test('exam creation, updates and deletion notices each expire after one second', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-03T00:00:00Z') })
  await page.goto('/manage/exams')
  await page.getByRole('link', { name: 'Tạo đề thi', exact: true }).click()
  await page.getByLabel('Tên đề thi').fill('Đề kiểm tra thông báo')
  await fillCreationQuestion(creationQuestion(page), 'Câu kiểm tra thông báo')
  await page.clock.pauseAt(new Date('2026-10-03T01:00:00Z'))
  await confirmCreation(page)

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
  await page.getByRole('button', { name: 'Xóa hẳn đề', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận xóa đề', exact: true }).click()
  await expectNoticeToExpire('Đã xóa hẳn đề thi.')
})

test('students cannot mount privileged manager pages or call exam APIs', async ({ page, api }) => {
  api.role = 'STUDENT'
  for (const path of ['/manage/exams', '/manage/exams/create', `/manage/exams/${draftId}`, `/manage/exams/${draftId}/results`]) {
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
  await page.getByRole('link', { name: 'Tạo đề thi', exact: true }).click()
  await page.getByLabel('Tên đề thi').fill('Đề do quản trị tạo')
  await fillCreationQuestion(creationQuestion(page), 'Câu do quản trị tạo')
  await confirmCreation(page)
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
  await page.getByRole('button', { name: 'Xóa hẳn đề', exact: true }).click()
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
