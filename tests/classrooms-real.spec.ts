import { test, expect } from '@playwright/test'
import type { Page, Response } from '@playwright/test'
import { readFileSync } from 'node:fs'

interface Fixture {
  manager: { id: string; email: string; fullName: string }
  student: { id: string; email: string; fullName: string }
  password: string
  className: string
  classDescription: string
  classPassword: string
  examTitle: string
  apiUrl: string
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

test.use({ actionTimeout: 15_000 })

test.describe('Classrooms E2E Multi-role Integration Tests', () => {
  test.skip(process.env.CLASSROOMS_API_E2E !== '1', 'Run test:e2e:classrooms-real with owned temporary fixtures.')

  test('8 bước: Tạo lớp -> Học sinh nhập sai pass -> Học sinh nhập đúng pass -> Tạo đề trong lớp -> Scope isolation -> Làm bài thi -> Kiểm tra kết quả & thành viên -> Chặn xóa lớp', async ({ page, browser }) => {
    test.setTimeout(120_000)
    const fixture = JSON.parse(readFileSync(process.env.FRONT_CLASSROOMS_FIXTURE!, 'utf8')) as Fixture

    // -------------------------------------------------------------------------
    // BƯỚC 1: Giáo viên đăng nhập & tạo Lớp học mới
    // -------------------------------------------------------------------------
    await login(page, fixture.manager.email, fixture.password)
    await page.goto('/manage/classes')
    await expect(page.getByRole('heading', { name: 'Quản lý lớp học', exact: true })).toBeVisible()
    await expect(page.getByText('Đang tải danh sách lớp học…')).toBeHidden()

    await page.getByRole('button', { name: 'Tạo lớp học mới', exact: true }).click()
    const createModal = page.getByRole('dialog', { name: 'Tạo lớp học mới' })
    await expect(createModal).toBeVisible()

    await createModal.getByLabel('Tên lớp học', { exact: true }).fill(fixture.className)
    await createModal.getByLabel('Mô tả (tùy chọn)', { exact: true }).fill(fixture.classDescription)
    await createModal.getByLabel('Mật khẩu lớp', { exact: true }).fill(fixture.classPassword)

    await createModal.getByRole('button', { name: 'Tạo lớp học', exact: true }).click()
    await expect(createModal).toBeHidden()

    const classCard = page.locator('article.manager-class-card').filter({ hasText: fixture.className })
    await expect(classCard).toBeVisible()

    const classCodeBadge = classCard.locator('.manager-class-code-badge')
    await expect(classCodeBadge).toBeVisible()
    const classCode = (await classCodeBadge.textContent())?.trim()
    expect(classCode).toMatch(/^[A-Z0-9]{6}$/)

    const detailHref = await classCard.getByRole('link', { name: 'Xem chi tiết', exact: true }).getAttribute('href')
    const classId = detailHref!.split('/').pop()!
    expect(classId).toMatch(/^[a-f\d]{24}$/)

    // -------------------------------------------------------------------------
    // BƯỚC 2 & 3: Học sinh tham gia lớp (mật khẩu sai -> báo lỗi, mật khẩu đúng -> thành công)
    // -------------------------------------------------------------------------
    const studentContext = await browser.newContext()
    let examId = ''
    try {
      const student = await studentContext.newPage()
      await login(student, fixture.student.email, fixture.password)

      await student.goto('/classes')
      await expect(student.getByRole('heading', { name: 'Lớp học của tôi', exact: true })).toBeVisible()
      await expect(student.getByText('Đang tải danh sách lớp học…')).toBeHidden()

      // Bấm tham gia lớp học
      await student.getByRole('button', { name: /Tham gia lớp học/ }).first().click()
      const joinModal = student.getByRole('dialog', { name: 'Tham gia lớp học' })
      await expect(joinModal).toBeVisible()

      // Bước 2: Nhập mã lớp và mật khẩu sai -> Báo lỗi
      await joinModal.getByLabel('Mã lớp học', { exact: true }).fill(classCode!)
      await joinModal.getByLabel('Mật khẩu lớp học', { exact: true }).fill('SaiMatKhau123')
      await joinModal.getByRole('button', { name: 'Tham gia', exact: true }).click()

      const joinAlert = joinModal.getByRole('alert')
      await expect(joinAlert).toBeVisible()
      await expect(joinAlert).toContainText('Mật khẩu lớp học không chính xác')

      // Bước 3: Nhập đúng mật khẩu -> Thành công
      await joinModal.getByLabel('Mật khẩu lớp học', { exact: true }).fill(fixture.classPassword)
      await joinModal.getByRole('button', { name: 'Tham gia', exact: true }).click()
      await expect(joinModal).toBeHidden()

      // Thẻ lớp học xuất hiện trong danh sách lớp của học sinh
      const studentClassCard = student.locator('article.student-class-card').filter({ hasText: fixture.className })
      await expect(studentClassCard).toBeVisible()
      await expect(studentClassCard.locator('.student-class-code-badge')).toHaveText(classCode!)

      // -----------------------------------------------------------------------
      // BƯỚC 4: Giáo viên tạo đề thi trong lớp và mở đề
      // -----------------------------------------------------------------------
      await page.goto('/manage/classes/' + classId)
      await expect(page).toHaveURL('/manage/classes/' + classId)
      await expect(page.getByRole('heading', { name: fixture.className, exact: true })).toBeVisible()

      await page.getByRole('button', { name: 'Tạo đề thi cho lớp', exact: true }).click()
      await expect(page).toHaveURL(new RegExp('/manage/exams/create\\?classroomId=' + classId))

      // Xác nhận có badge báo đề thi thuộc lớp học này
      await expect(page.getByText('Đề thi được tạo cho lớp học này.')).toBeVisible()

      // Điền thông tin đề thi và câu hỏi
      await page.getByLabel('Tên đề thi', { exact: true }).fill(fixture.examTitle)
      await page.getByLabel('Thời gian làm bài (phút)', { exact: true }).fill('15')

      const questionGroup = page.getByRole('group', { name: 'Câu hỏi 1', exact: true })
      await questionGroup.getByLabel('Nội dung câu hỏi', { exact: true }).fill('Giá trị của x thỏa mãn phương trình 2x + 4 = 10 là:')
      await questionGroup.getByLabel('Đáp án 1', { exact: true }).fill('x = 3')
      await questionGroup.getByLabel('Đáp án 2', { exact: true }).fill('x = 5')
      await questionGroup.getByLabel('Đáp án 3', { exact: true }).fill('x = 7')
      await questionGroup.getByLabel('Đáp án 4', { exact: true }).fill('x = 2')
      await questionGroup.getByRole('radio', { name: 'Đáp án đúng 1', exact: true }).check()

      await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click()

      await expect(page).toHaveURL(/\/manage\/exams\/[a-f\d]{24}$/)
      examId = new URL(page.url()).pathname.split('/').pop()!

      // Xác nhận tạo đề thi nháp thành công
      await expect(page.getByText('Bản nháp', { exact: true })).toBeVisible()

      // Xuất bản đề thi ("Mở đề thi")
      await page.getByRole('button', { name: 'Mở đề thi', exact: true }).click()
      await page.getByRole('button', { name: 'Xác nhận mở đề', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Đóng đề thi', exact: true })).toBeVisible()

      // -----------------------------------------------------------------------
      // BƯỚC 5: Cô lập phạm vi hiển thị (Strict Scope Isolation)
      // -----------------------------------------------------------------------
      // Học sinh vào trang /exams công khai: Đề thi lớp KHÔNG hiển thị
      await student.goto('/exams')
      await expect(student.getByRole('heading', { name: 'Khám phá đề thi', exact: true })).toBeVisible()
      await expect(student.getByText('Đang tải danh sách đề thi…')).toBeHidden()
      await expect(student.getByRole('heading', { name: fixture.examTitle })).toHaveCount(0)

      // Giáo viên vào trang /manage/exams chung: Đề thi lớp KHÔNG hiển thị
      await page.goto('/manage/exams')
      await expect(page.getByRole('heading', { name: 'Quản lý đề thi', exact: true })).toBeVisible()
      await expect(page.getByText('Đang tải danh sách đề thi…')).toBeHidden()
      await expect(page.getByRole('heading', { name: fixture.examTitle })).toHaveCount(0)

      // -----------------------------------------------------------------------
      // BƯỚC 6: Học sinh làm bài thi trong lớp
      // -----------------------------------------------------------------------
      await student.goto('/classes/' + classId)
      await expect(student.getByRole('heading', { name: fixture.className, exact: true })).toBeVisible()
      await expect(student.getByText('Đang tải thông tin lớp học…')).toBeHidden()

      // Đề thi của lớp hiển thị đầy đủ
      const classExamCard = student.locator('article.student-class-exam-card').filter({ hasText: fixture.examTitle })
      await expect(classExamCard).toBeVisible()

      // Bấm "Vào làm bài"
      await classExamCard.getByRole('link', { name: 'Vào làm bài', exact: true }).click()
      await expect(student).toHaveURL('/exams/' + examId)

      // Bấm "Bắt đầu / Tiếp tục bài"
      const started = student.waitForResponse((r) => apiResponse(r, 'POST', '/exams/' + examId + '/attempts'))
      await student.getByRole('link', { name: 'Bắt đầu / Tiếp tục bài', exact: true }).click()
      const session = await (await started).json() as { attempt: { id: string }; questions: { id: string; content: string; options: string[] }[] }
      await expect(student).toHaveURL('/exams/' + examId + '/take')

      // Chọn đáp án đúng (A. x = 3)
      await student.getByRole('button', { name: /^Câu 1,/ }).click()
      const saved = student.waitForResponse((r) => apiResponse(r, 'PUT', '/attempts/' + session.attempt.id + '/answers/' + session.questions[0].id))
      await student.getByRole('radio', { name: 'A. ' + session.questions[0].options[0], exact: true }).check()
      expect((await saved).status()).toBe(200)
      await expect(student.getByText('Đã lưu tất cả đáp án', { exact: true })).toBeVisible()

      // Nộp bài thi
      const submitted = student.waitForResponse((r) => apiResponse(r, 'POST', '/attempts/' + session.attempt.id + '/submit'))
      await student.getByRole('button', { name: 'Nộp bài', exact: true }).click()
      await student.getByRole('button', { name: 'Xác nhận nộp bài', exact: true }).click()
      const result = await (await submitted).json() as { summary: { score: number; correctCount: number; incorrectCount: number } }
      expect(result.summary.score).toBe(10)
      expect(result.summary.correctCount).toBe(1)
      expect(result.summary.incorrectCount).toBe(0)

      await expect(student).toHaveURL('/attempts/' + session.attempt.id + '/result')
      await expect(student.getByLabel('Điểm bài thi', { exact: true }).locator('strong')).toHaveText('10 / 10')

      // -----------------------------------------------------------------------
      // BƯỚC 7: Giáo viên kiểm tra thành viên và kết quả
      // -----------------------------------------------------------------------
      await page.goto('/manage/classes/' + classId)
      await expect(page.getByRole('heading', { name: fixture.className, exact: true })).toBeVisible()
      await expect(page.getByText('Đang tải thông tin lớp học…')).toBeHidden()

      // Chuyển tab danh sách thành viên
      await page.getByRole('tab', { name: /Danh sách thành viên/ }).click()
      await expect(page.locator('.manager-class-member-name').filter({ hasText: fixture.student.fullName })).toBeVisible()

      // Xem kết quả đề thi
      await page.goto('/manage/exams/' + examId + '/results')
      await expect(page.getByRole('heading', { name: 'Kết quả học sinh', exact: true })).toBeVisible()

      const row = page.getByRole('row').filter({ hasText: fixture.student.fullName })
      await expect(row).toBeVisible()
      await expect(row).toContainText('10')
      await expect(row).toContainText('Đã nộp')

      // -----------------------------------------------------------------------
      // BƯỚC 8: Chặn xóa lớp khi đang có đề thi / bài làm
      // -----------------------------------------------------------------------
      await page.goto('/manage/classes')
      await expect(page.getByRole('heading', { name: 'Quản lý lớp học', exact: true })).toBeVisible()
      await expect(page.getByText('Đang tải danh sách lớp học…')).toBeHidden()

      const deleteCard = page.locator('article.manager-class-card').filter({ hasText: fixture.className })
      await expect(deleteCard).toBeVisible()
      await deleteCard.getByRole('button', { name: 'Xóa lớp', exact: true }).click()

      const deleteModal = page.getByRole('dialog', { name: 'Xác nhận xóa lớp học' })
      await expect(deleteModal).toBeVisible()

      await deleteModal.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click()

      // Báo lỗi chặn xóa từ hệ thống
      const deleteAlert = deleteModal.getByRole('alert')
      await expect(deleteAlert).toBeVisible()
      await expect(deleteAlert).toContainText('Không thể xóa lớp học')

      // Đóng modal và kiểm tra lớp học vẫn tồn tại an toàn
      await deleteModal.getByRole('button', { name: 'Hủy', exact: true }).click()
      await expect(deleteModal).toBeHidden()
      await expect(page.locator('article.manager-class-card').filter({ hasText: fixture.className })).toBeVisible()
    } finally {
      await studentContext.close()
    }
  })
})
