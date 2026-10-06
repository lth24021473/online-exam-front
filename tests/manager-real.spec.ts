import { test, expect } from '@playwright/test'
import type { Page, Response } from '@playwright/test'
import { readFileSync } from 'node:fs'

interface Fixture {
  manager: { id: string; email: string; fullName: string }
  student: { id: string; email: string; fullName: string }
  password: string; title: string; apiUrl: string
}
function apiResponse(response: Response, method: string, suffix: string) {
  return response.request().method() === method && new URL(response.url()).pathname.endsWith('/api/v1' + suffix)
}
async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Địa chỉ email', { exact: true }).fill(email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL('/dashboard')
}
async function question(page: Page, content: string, position: number, correctIndex: number) {
  await page.getByRole('textbox', { name: 'Nội dung câu hỏi', exact: true }).fill(content)
  await page.getByLabel('Vị trí câu hỏi', { exact: true }).fill(String(position))
  for (let i = 1; i <= 4; i++) await page.getByLabel('Đáp án ' + i, { exact: true }).fill('Lựa chọn ' + i)
  await page.getByRole('radio', { name: 'Đáp án đúng ' + (correctIndex + 1), exact: true }).check()
  await page.getByRole('button', { name: 'Lưu câu hỏi', exact: true }).click()
  await expect(page.getByRole('heading').filter({ hasText: content })).toBeVisible()
}
async function createWithQuestion(page: Page, content: string, correctIndex: number) {
  const question = page.getByRole('group', { name: 'Câu hỏi 1', exact: true })
  await question.getByLabel('Nội dung câu hỏi', { exact: true }).fill(content)
  for (let i = 1; i <= 4; i++) await question.getByLabel('Đáp án ' + i, { exact: true }).fill('Lựa chọn ' + i)
  await question.getByRole('radio', { name: 'Đáp án đúng ' + (correctIndex + 1), exact: true }).check()
  await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click()
}
test.use({ actionTimeout: 15_000 })

test.describe('Manager → học sinh → kết quả với API và MongoDB thật', () => {
  test.skip(process.env.MANAGER_API_E2E !== '1', 'Run test:e2e:manager-real with owned temporary fixtures.')
  test('soạn/sửa/xóa câu hỏi, mở đề, làm bài, xem điểm, đóng và xóa hẳn đề', async ({ page, browser }) => {
    test.setTimeout(120_000)
    const fixture = JSON.parse(readFileSync(process.env.FRONT_MANAGER_FIXTURE!, 'utf8')) as Fixture
    await login(page, fixture.manager.email, fixture.password)
    await page.getByRole('link', { name: 'Quản lý đề', exact: true }).click()
    await page.getByRole('link', { name: 'Tạo đề thi', exact: true }).click()
    await page.getByLabel('Tên đề thi', { exact: true }).fill(fixture.title)
    await page.getByLabel('Thời gian làm bài (phút)', { exact: true }).fill('15')
    await createWithQuestion(page, 'Câu kiểm thử thứ nhất', 1)
    await expect(page).toHaveURL(/\/manage\/exams\/[a-f\d]{24}$/)
    const examId = new URL(page.url()).pathname.split('/').pop()!
    await page.getByLabel('Mô tả', { exact: true }).fill('Đề tạo và hoàn thành qua giao diện thật')
    await page.getByRole('button', { name: 'Lưu thông tin đề', exact: true }).click()
    await question(page, 'Câu kiểm thử thứ hai', 2, 0)
    await question(page, 'Câu sẽ xóa', 3, 0)
    await page.getByRole('button', { name: 'Sửa câu hỏi 3', exact: true }).click()
    await page.getByRole('textbox', { name: 'Nội dung câu hỏi', exact: true }).fill('Câu đã sửa rồi xóa')
    await page.getByRole('button', { name: 'Lưu câu hỏi', exact: true }).click()
    await expect(page.getByRole('heading').filter({ hasText: 'Câu đã sửa rồi xóa' })).toBeVisible()
    await page.getByRole('button', { name: 'Xóa câu hỏi 3', exact: true }).click()
    await page.getByRole('button', { name: 'Xác nhận xóa câu hỏi', exact: true }).click()
    await expect(page.getByRole('heading').filter({ hasText: 'Câu đã sửa rồi xóa' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Mở đề thi', exact: true }).click()
    await page.getByRole('button', { name: 'Xác nhận mở đề', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Đóng đề thi', exact: true })).toBeVisible()

    let submittedAttemptId!: string
    let submittedStudentToken!: string | null
    const studentContext = await browser.newContext()
    try {
      const student = await studentContext.newPage()
      await login(student, fixture.student.email, fixture.password)
      await student.goto('/exams/' + examId)
      const started = student.waitForResponse((r) => apiResponse(r, 'POST', '/exams/' + examId + '/attempts'))
      await student.getByRole('link', { name: 'Bắt đầu / Tiếp tục bài', exact: true }).click()
      const session = await (await started).json() as { attempt: { id: string }; questions: { id: string; content: string; options: string[] }[] }
      submittedAttemptId = session.attempt.id
      expect(session.questions).toHaveLength(2)
      for (let i = 0; i < 2; i++) {
        await student.getByRole('button', { name: new RegExp('^Câu ' + (i + 1) + ',') }).click()
        const saved = student.waitForResponse((r) => apiResponse(r, 'PUT', '/attempts/' + session.attempt.id + '/answers/' + session.questions[i].id))
        // One correct and one incorrect answer: the backend must produce 5/10.
        await student.getByRole('radio', { name: 'B. ' + session.questions[i].options[1], exact: true }).check()
        expect((await saved).status()).toBe(200)
        await expect(student.getByText('Đã lưu tất cả đáp án', { exact: true })).toBeVisible()
      }
      const submitted = student.waitForResponse((r) => apiResponse(r, 'POST', '/attempts/' + session.attempt.id + '/submit'))
      await student.getByRole('button', { name: 'Nộp bài', exact: true }).click()
      await student.getByRole('button', { name: 'Xác nhận nộp bài', exact: true }).click()
      const result = await (await submitted).json() as { summary: { score: number; correctCount: number; incorrectCount: number } }
      expect(result.summary.score).toBe(5)
      expect(result.summary.correctCount).toBe(1)
      expect(result.summary.incorrectCount).toBe(1)
      await expect(student.getByLabel('Điểm bài thi', { exact: true }).locator('strong')).toHaveText('5 / 10')
      const studentToken = await student.evaluate(() => localStorage.getItem('online-exam.access-token'))
      submittedStudentToken = studentToken
      const denied = await studentContext.request.get(fixture.apiUrl + '/exams/' + examId + '/results', { headers: { Authorization: 'Bearer ' + studentToken } })
      expect(denied.status()).toBe(403)
      const repeated = await studentContext.request.post(fixture.apiUrl + '/attempts/' + session.attempt.id + '/submit', { headers: { Authorization: 'Bearer ' + studentToken } })
      expect((await repeated.json()).summary).toEqual(result.summary)
    } finally { await studentContext.close() }

    await page.getByRole('link', { name: 'Kết quả học sinh', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Kết quả học sinh', exact: true })).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: fixture.student.fullName })
    await expect(row).toContainText('5')
    await expect(row).toContainText('Đã nộp')
    await page.getByRole('combobox', { name: /Trạng thái bài làm/ }).selectOption('CANCELLED')
    await expect(page.getByRole('row').filter({ hasText: fixture.student.fullName })).toHaveCount(0)
    await page.getByRole('combobox', { name: /Trạng thái bài làm/ }).selectOption('SUBMITTED')
    await expect(page.getByRole('row').filter({ hasText: fixture.student.fullName })).toBeVisible()
    await page.screenshot({ path: 'test-results/real-manager-results.png', fullPage: true })
    await page.goto('/manage/exams/' + examId)
    const continuingContext = await browser.newContext()
    try {
      const continuingStudent = await continuingContext.newPage()
      await login(continuingStudent, fixture.student.email, fixture.password)
      const runningResponse = continuingStudent.waitForResponse((r) => apiResponse(r, 'POST', '/exams/' + examId + '/attempts'))
      await continuingStudent.goto('/exams/' + examId + '/take')
      const running = await (await runningResponse).json() as { attempt: { id: string; deadlineAt: string } }
      await expect(continuingStudent.getByLabel('Thời gian còn lại')).toBeVisible()
      await page.getByRole('button', { name: 'Đóng đề thi', exact: true }).click()
      await page.getByRole('button', { name: 'Xác nhận đóng đề', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Đóng đề thi', exact: true })).toHaveCount(0)
      const resumedResponse = continuingStudent.waitForResponse((r) => apiResponse(r, 'POST', '/exams/' + examId + '/attempts'))
      await continuingStudent.reload()
      const resumedHttp = await resumedResponse
      expect(resumedHttp.status()).toBe(201)
      const resumed = await resumedHttp.json() as { resumed: boolean; attempt: { id: string; deadlineAt: string } }
      expect(resumed.resumed).toBe(true)
      expect(resumed.attempt).toMatchObject(running.attempt)
      await expect(continuingStudent.getByLabel('Thời gian còn lại')).toBeVisible()
      const token = await continuingStudent.evaluate(() => localStorage.getItem('online-exam.access-token'))
      const cancelled = await continuingContext.request.delete(fixture.apiUrl + '/attempts/' + running.attempt.id, { headers: { Authorization: 'Bearer ' + token } })
      expect(cancelled.status()).toBe(204)
      const cannotStart = await continuingContext.request.post(fixture.apiUrl + '/exams/' + examId + '/attempts', { headers: { Authorization: 'Bearer ' + token } })
      expect(cannotStart.status()).toBe(409)
    } finally { await continuingContext.close() }
    const managerToken = await page.evaluate(() => localStorage.getItem('online-exam.access-token'))
    const detail = await page.request.get(fixture.apiUrl + '/exams/' + examId, { headers: { Authorization: 'Bearer ' + managerToken } })
    expect((await detail.json()).status).toBe('CLOSED')

    // Permanent deletion also removes the fixture's closed exam and its graded attempt.
    await page.getByRole('button', { name: 'Xóa hẳn đề', exact: true }).click()
    await page.getByRole('dialog', { name: 'Xóa hẳn đề thi?', exact: true }).getByRole('button', { name: 'Xác nhận xóa đề', exact: true }).click()
    await expect(page).toHaveURL('/manage/exams')
    const deletedClosedExam = await page.request.get(fixture.apiUrl + '/exams/' + examId, { headers: { Authorization: 'Bearer ' + managerToken } })
    expect(deletedClosedExam.status()).toBe(404)
    const deletedResult = await page.request.get(fixture.apiUrl + '/attempts/' + submittedAttemptId + '/result', { headers: { Authorization: 'Bearer ' + submittedStudentToken } })
    expect(deletedResult.status()).toBe(404)

    // A draft with dependent questions must be removable through the UI.
    await page.goto('/manage/exams')
    await page.getByRole('link', { name: 'Tạo đề thi', exact: true }).click()
    await page.getByLabel('Tên đề thi', { exact: true }).fill(fixture.title + ' nháp xóa')
    await createWithQuestion(page, 'Câu nháp xóa cùng đề', 0)
    await expect(page).toHaveURL(/\/manage\/exams\/[a-f\d]{24}$/)
    const draftId = new URL(page.url()).pathname.split('/').pop()!
    await page.getByRole('button', { name: 'Xóa hẳn đề', exact: true }).click()
    await page.getByRole('button', { name: 'Xác nhận xóa đề', exact: true }).click()
    await expect(page).toHaveURL('/manage/exams')
    const deleted = await page.request.get(fixture.apiUrl + '/exams/' + draftId, { headers: { Authorization: 'Bearer ' + managerToken } })
    expect(deleted.status()).toBe(404)
  })
})
