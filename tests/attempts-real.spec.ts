import { expect, test } from '@playwright/test'
import type { Page, Response } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type RealFixture = {
  examId: string
  email: string
  password: string
  title?: string
  apiUrl?: string
}
type Session = {
  resumed: boolean
  attempt: { id: string; deadlineAt: string }
  exam: { id: string; title: string }
  questions: { id: string; content: string; options: string[] }[]
  answers: { questionId: string; selectedOptionIndex: number }[]
}
type Result = {
  attempt: { id: string; status: string }
  summary: { score: number; maxScore: number; totalQuestions: number; correctCount: number; unansweredCount: number }
  questions: { selectedOptionIndex: number | null; correctOptionIndex: number | null }[]
}

let fixture: RealFixture
let fixtureHelper: string
const tokenKey = 'online-exam.access-token'
const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })

function isApiResponse(response: Response, method: string, path: string): boolean {
  return response.request().method() === method
    && new URL(response.url()).pathname.endsWith(`/api/v1${path}`)
}

async function startAttempt(page: Page, fromDetail = false): Promise<Session> {
  const started = page.waitForResponse((response) => isApiResponse(response, 'POST', `/exams/${fixture.examId}/attempts`))
  if (fromDetail) await page.getByRole('link', { name: 'Bắt đầu / Tiếp tục bài', exact: true }).click()
  else await page.goto(`/exams/${fixture.examId}/take`)
  const response = await started
  expect(response.status()).toBe(201)
  const session = await response.json() as Session
  await expect(page.getByLabel('Thời gian còn lại')).toBeVisible()
  await expect(page.getByRole('radio').first()).toBeVisible()
  expect(session.questions).toHaveLength(2)
  expect(session.questions[0]).not.toHaveProperty('correctOptionIndex')
  return session
}

async function selectAnswer(page: Page, session: Session, questionIndex: number, optionIndex: number) {
  const question = session.questions[questionIndex]
  await page.getByRole('button', { name: new RegExp(`^Câu ${questionIndex + 1},`) }).click()
  const saved = page.waitForResponse((response) => isApiResponse(response, 'PUT', `/attempts/${session.attempt.id}/answers/${question.id}`))
  await page.getByRole('radio', { name: `${String.fromCharCode(65 + optionIndex)}. ${question.options[optionIndex]}`, exact: true }).check()
  const response = await saved
  expect(response.status()).toBe(200)
  expect((await response.json()).selectedOptionIndex).toBe(optionIndex)
  await expect(page.getByText('Đã lưu tất cả đáp án', { exact: true })).toBeVisible()
}

function changeDeadline(attemptId: string, offsetMs?: number) {
  execFileSync('node', [fixtureHelper, 'expire', attemptId, ...(offsetMs === undefined ? [] : [String(offsetMs)])], {
    encoding: 'utf8', timeout: 15_000,
  })
}

async function expectBackendScore(page: Page, result: Result) {
  await expect(page.getByRole('heading', { name: 'Kết quả bài làm', exact: true })).toBeVisible()
  await expect(page.getByLabel('Điểm bài thi', { exact: true }).locator('strong')).toHaveText(`${numberFormat.format(result.summary.score)} / ${numberFormat.format(result.summary.maxScore)}`)
  expect(result.attempt.status).toBe('SUBMITTED')
  expect(result.summary.totalQuestions).toBe(2)
  const correctCount = result.questions.filter((question) => question.selectedOptionIndex !== null && question.selectedOptionIndex === question.correctOptionIndex).length
  expect(result.summary.correctCount).toBe(correctCount)
  expect(result.summary.score).toBe(Math.round(correctCount / result.summary.totalQuestions * result.summary.maxScore * 100) / 100)
}

test.describe('API thật và dữ liệu kiểm thử riêng', () => {
  test.skip(process.env.REAL_API_E2E !== '1', 'Chỉ chạy khi bật REAL_API_E2E=1 và cung cấp fixture đã tạo riêng.')

  test.beforeAll(() => {
    const fixturePath = process.env.FRONT_REAL_FIXTURE || '.local/real-fixture.json'
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as RealFixture
    if (!fixture.examId || !fixture.email || !fixture.password) throw new Error('Fixture cần có examId, email và password.')
    fixtureHelper = resolve(process.env.FRONT_REAL_FIXTURE_HELPER || 'tests/fixtures/real-api.cjs')
  })

  test('lưu/đổi đáp án, tải lại, mất mạng, nộp lặp, hủy và hết giờ với MongoDB thật', async ({ page, context }) => {
    test.setTimeout(120_000)
    const startIds: string[] = []
    const submitIds: string[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (request.method() === 'POST' && path.endsWith(`/exams/${fixture.examId}/attempts`)) startIds.push(path)
      if (request.method() === 'POST' && /\/attempts\/[^/]+\/submit$/.test(path)) submitIds.push(path)
    })

    await page.goto('/login')
    await page.getByLabel('Địa chỉ email', { exact: true }).fill(fixture.email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL('/dashboard')

    await page.getByRole('link', { name: 'Khám phá đề thi' }).click()
    await expect(page.getByRole('heading', { name: 'Đề thi đang mở', exact: true })).toBeVisible()
    await page.getByLabel('Bạn đã có mã đề?', { exact: true }).fill(fixture.examId)
    await page.getByRole('button', { name: 'Mở đề thi', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Bắt đầu / Tiếp tục bài', exact: true })).toBeVisible()
    const session = await startAttempt(page, true)
    expect(session.resumed).toBe(false)
    await selectAnswer(page, session, 0, 0)
    await selectAnswer(page, session, 0, 1)

    const resumedResponse = page.waitForResponse((response) => isApiResponse(response, 'POST', `/exams/${fixture.examId}/attempts`))
    await page.reload()
    const resumed = await (await resumedResponse).json() as Session
    expect(resumed.resumed).toBe(true)
    expect(resumed.attempt.id).toBe(session.attempt.id)
    expect(resumed.attempt.deadlineAt).toBe(session.attempt.deadlineAt)
    expect(resumed.answers).toContainEqual({ questionId: session.questions[0].id, selectedOptionIndex: 1 })
    await expect(page.getByRole('radio', { name: `B. ${session.questions[0].options[1]}`, exact: true })).toBeChecked()

    await page.getByRole('button', { name: /^Câu 2,/ }).click()
    await context.setOffline(true)
    const queuedRadio = page.getByRole('radio', { name: `B. ${session.questions[1].options[1]}`, exact: true })
    await queuedRadio.check()
    await expect(queuedRadio).toBeChecked()
    await expect(page.getByText('Có đáp án chưa lưu', { exact: true })).toBeVisible()
    const reconnectedSave = page.waitForResponse((response) => isApiResponse(response, 'PUT', `/attempts/${session.attempt.id}/answers/${session.questions[1].id}`))
    await context.setOffline(false)
    expect((await reconnectedSave).status()).toBe(200)
    await expect(page.getByText('Đã lưu tất cả đáp án', { exact: true })).toBeVisible()

    const submittedResponse = page.waitForResponse((response) => isApiResponse(response, 'POST', `/attempts/${session.attempt.id}/submit`))
    await page.getByRole('button', { name: 'Nộp bài', exact: true }).click()
    const confirm = page.getByRole('button', { name: 'Xác nhận nộp bài', exact: true })
    await expect(confirm).toBeVisible()
    await confirm.evaluate((element) => {
      // Two clicks in one event turn exercise the immediate submission lock.
      const button = element as HTMLButtonElement
      button.click()
      button.click()
    })
    const submittedHttp = await submittedResponse
    expect(submittedHttp.status()).toBe(200)
    const submitted = await submittedHttp.json() as Result
    await expect(page).toHaveURL(`/attempts/${session.attempt.id}/result`)
    await expectBackendScore(page, submitted)
    expect(submitted.questions.map((question) => question.selectedOptionIndex)).toEqual([1, 1])
    expect(submitIds.filter((path) => path.endsWith(`/attempts/${session.attempt.id}/submit`))).toHaveLength(1)

    // Verify an ambiguous/repeated network submit returns the existing score.
    const token = await page.evaluate((key) => localStorage.getItem(key), tokenKey)
    const repeated = await context.request.post(`${fixture.apiUrl || 'http://localhost:3000/api/v1'}/attempts/${session.attempt.id}/submit`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(repeated.status()).toBe(200)
    const repeatedResult = await repeated.json() as Result
    expect(repeatedResult.attempt.id).toBe(session.attempt.id)
    expect(repeatedResult.summary).toEqual(submitted.summary)

    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'Lịch sử làm bài', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Xem kết quả' })).toBeVisible()
    await expect(page.locator('.history-score strong')).toHaveText(numberFormat.format(submitted.summary.score))

    const cancelled = await startAttempt(page)
    expect(cancelled.resumed).toBe(false)
    expect(cancelled.attempt.id).not.toBe(session.attempt.id)
    await selectAnswer(page, cancelled, 0, 0)
    const cancelResponse = page.waitForResponse((response) => isApiResponse(response, 'DELETE', `/attempts/${cancelled.attempt.id}`))
    await page.getByRole('button', { name: 'Hủy bài', exact: true }).click()
    await page.getByRole('button', { name: 'Xác nhận hủy bài', exact: true }).click()
    expect((await cancelResponse).status()).toBe(204)
    execFileSync('node', [fixtureHelper, 'verify-cancel', cancelled.attempt.id], { encoding: 'utf8', timeout: 15_000 })
    await expect(page).toHaveURL('/history')
    await page.getByLabel('Trạng thái bài làm', { exact: true }).selectOption('CANCELLED')
    await expect(page.locator('.attempt-history-card')).toHaveCount(1)
    await expect(page.locator('.attempt-history-card')).toContainText('Đã hủy')
    await expect(page.locator('.attempt-history-card')).toContainText('Không chấm điểm')
    await expect(page.getByRole('link', { name: 'Xem kết quả' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Tiếp tục bài' })).toHaveCount(0)

    const expired = await startAttempt(page)
    await selectAnswer(page, expired, 0, 1)
    changeDeadline(expired.attempt.id)
    const startsBeforeExpiredReload = startIds.length
    const expiredResultResponse = page.waitForResponse((response) => isApiResponse(response, 'GET', `/attempts/${expired.attempt.id}/result`) && response.status() === 200)
    await page.reload()
    const expiredResult = await (await expiredResultResponse).json() as Result
    await expect(page).toHaveURL(`/attempts/${expired.attempt.id}/result`)
    await expectBackendScore(page, expiredResult)
    expect(expiredResult.summary.unansweredCount).toBe(1)
    expect(startIds).toHaveLength(startsBeforeExpiredReload)

    const timed = await startAttempt(page)
    await selectAnswer(page, timed, 0, 1)
    changeDeadline(timed.attempt.id, 6_000)
    const refreshedResponse = page.waitForResponse((response) => isApiResponse(response, 'POST', `/exams/${fixture.examId}/attempts`))
    const automaticSubmitResponse = page.waitForResponse((response) => isApiResponse(response, 'POST', `/attempts/${timed.attempt.id}/submit`), { timeout: 20_000 })
    await page.reload()
    const timedResume = await (await refreshedResponse).json() as Session
    expect(timedResume.attempt.id).toBe(timed.attempt.id)
    await expect(page.getByLabel('Thời gian còn lại')).toHaveText(/00:0[0-6]/)
    const automaticResult = await (await automaticSubmitResponse).json() as Result
    await expect(page).toHaveURL(`/attempts/${timed.attempt.id}/result`)
    await expectBackendScore(page, automaticResult)
    expect(automaticResult.summary.unansweredCount).toBe(1)

    await page.screenshot({ path: 'test-results/real-attempt-result.png', fullPage: true })
    await page.goto('/history')
    await expect(page.locator('.attempt-history-card')).toHaveCount(4)
    await page.screenshot({ path: 'test-results/real-attempt-history.png', fullPage: true })
  })
})
