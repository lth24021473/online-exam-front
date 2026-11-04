import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

interface Fixture {
  manager: { id: string; email: string; fullName: string }
  student: { id: string; email: string; fullName: string }
  password: string
  examTitle: string
  apiUrl: string
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Địa chỉ email', { exact: true }).fill(email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL('/dashboard')
}

test.use({ actionTimeout: 15_000 })

test.describe('Smart Proctoring E2E Integration Tests', () => {
  test.skip(process.env.PROCTORING_API_E2E !== '1', 'Run test:e2e:proctoring-real with owned temporary fixtures.')

  test('Luồng trọn vẹn: Giáo viên tạo đề có giám sát -> Học sinh vi phạm 3 lần -> Tự động đình chỉ & thu bài -> Giáo viên đối soát nhật ký gian lận', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000)
    const fixture = JSON.parse(readFileSync(process.env.FRONT_PROCTORING_FIXTURE!, 'utf8')) as Fixture

    // -------------------------------------------------------------------------
    // BƯỚC 1: Giáo viên đăng nhập & tạo đề thi bật Giám sát thông minh
    // -------------------------------------------------------------------------
    await login(page, fixture.manager.email, fixture.password)
    await page.goto('/manage/exams/new')
    await expect(page.getByRole('heading', { name: 'Tạo đề thi mới', exact: true })).toBeVisible()

    await page.getByLabel('Tên đề thi', { exact: true }).fill(fixture.examTitle)
    await page.getByLabel('Thời gian làm bài (phút)', { exact: true }).fill('20')

    // Bật giám sát & kiểm tra cấu hình mặc định (3 lần vi phạm)
    const proctoringCheckbox = page.getByLabel('Bật giám sát thi thông minh (Heuristic Proctoring)', { exact: true })
    await expect(proctoringCheckbox).toBeChecked()

    // Điền câu hỏi 1
    const q1Input = page.getByLabel('Nội dung câu hỏi', { exact: true }).first()
    await q1Input.fill('Thủ đô của Việt Nam là gì?')
    await page.getByLabel('Đáp án 1', { exact: true }).fill('Hà Nội')
    await page.getByLabel('Đáp án 2', { exact: true }).fill('TP. Hồ Chí Minh')
    await page.getByLabel('Đáp án 3', { exact: true }).fill('Đà Nẵng')
    await page.getByLabel('Đáp án 4', { exact: true }).fill('Hải Phòng')
    await page.getByLabel('Đáp án đúng 1', { exact: true }).check()

    // Submit form tạo đề
    await page.getByRole('button', { name: 'Tạo đề thi', exact: true }).click()
    const confirmDialog = page.getByRole('dialog', { name: 'Bạn chắc chắn muốn tạo đề thi?' })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Xác nhận', exact: true }).click()

    // Chờ chuyển hướng tới trang chi tiết đề thi của giáo viên
    await expect(page).toHaveURL(/\/manage\/exams\/[a-f\d]{24}$/)
    const examUrl = page.url()
    const examId = examUrl.split('/').pop()!

    // Xuất bản đề thi
    const publishButton = page.getByRole('button', { name: 'Mở đề thi', exact: true })
    await publishButton.click()
    const publishConfirm = page.getByRole('dialog', { name: 'Mở đề thi?' })
    await expect(publishConfirm).toBeVisible()
    await publishConfirm.getByRole('button', { name: 'Xác nhận', exact: true }).click()
    await expect(page.getByText('Đang mở', { exact: true })).toBeVisible()

    // -------------------------------------------------------------------------
    // BƯỚC 2: Học sinh đăng nhập, làm bài & vi phạm quy chế
    // -------------------------------------------------------------------------
    const studentContext = await browser.newContext()
    const studentPage = await studentContext.newPage()

    await login(studentPage, fixture.student.email, fixture.password)
    await studentPage.goto(`/exams/${examId}`)

    // Bắt đầu làm bài thi
    const startExamLink = studentPage.getByRole('link', { name: 'Bắt đầu làm bài', exact: true })
    await startExamLink.click()

    await expect(studentPage).toHaveURL(`/exams/${examId}/take`)
    await expect(studentPage.getByText('GIÁM SÁT THI: BẬT')).toBeVisible()

    // Chọn đáp án A (Hà Nội)
    await studentPage.getByLabel('Hà Nội', { exact: false }).click()

    // --- VI PHẠM LẦN 1: Bấm F12 (DevTools) ---
    await studentPage.keyboard.press('F12')
    const warningModal = studentPage.getByRole('alertdialog')
    await expect(warningModal).toBeVisible({ timeout: 10_000 })
    await expect(warningModal.getByText('PHÁT HIỆN HÀNH VI ĐÁNG NGỜ!')).toBeVisible()
    await expect(warningModal.getByText('1 / 3')).toBeVisible()

    // Học sinh cam kết không tái phạm
    await warningModal.getByRole('button', { name: 'Tôi đã hiểu và cam kết không tái phạm', exact: true }).click()
    await expect(warningModal).toBeHidden()
    await expect(studentPage.getByText('Vi phạm: 1/3')).toBeVisible()

    // Đợi 3.2 giây để qua ngưỡng throttle
    await studentPage.waitForTimeout(3200)

    // --- VI PHẠM LẦN 2: Thao tác Clipboard (Ctrl+C) ---
    await studentPage.evaluate(() => {
      document.dispatchEvent(new ClipboardEvent('copy', { cancelable: true }))
    })
    await expect(warningModal).toBeVisible({ timeout: 10_000 })
    await expect(warningModal.getByText('2 / 3')).toBeVisible()
    await warningModal.getByRole('button', { name: 'Tôi đã hiểu và cam kết không tái phạm', exact: true }).click()
    await expect(warningModal).toBeHidden()
    await expect(studentPage.getByText('Vi phạm: 2/3')).toBeVisible()

    // Đợi 3.2 giây để qua ngưỡng throttle
    await studentPage.waitForTimeout(3200)

    // --- VI PHẠM LẦN 3: Thoát màn hình (Ctrl+U) -> Quá số lần -> Tự động đình chỉ ---
    await studentPage.keyboard.press('Control+u')

    // Modal đình chỉ bài thi hiển thị
    const terminatedModal = studentPage.getByRole('alertdialog')
    await expect(terminatedModal).toBeVisible({ timeout: 10_000 })
    await expect(terminatedModal.getByText('ĐÃ ĐÌNH CHỈ')).toBeVisible()
    await expect(terminatedModal.getByText('BÀI THI BỊ KHÓA VÀ THU HỒI TỰ ĐỘNG')).toBeVisible()

    // Bấm xem kết quả bài thi
    await terminatedModal.getByRole('button', { name: 'Xem kết quả bài thi', exact: true }).click()
    await expect(studentPage).toHaveURL(/\/attempts\/[a-f\d]{24}\/result/, { timeout: 15_000 })

    await studentContext.close()

    // -------------------------------------------------------------------------
    // BƯỚC 3: Giáo viên đối soát nhật ký gian lận (Cheat Timeline)
    // -------------------------------------------------------------------------
    await page.goto(`/manage/exams/${examId}/results`)
    await expect(page.getByRole('heading', { name: 'Kết quả học sinh', exact: true })).toBeVisible()

    // Kiểm tra dòng kết quả của học sinh có nhãn "Bị đình chỉ" và "Nguy cơ cao (3)"
    const studentRow = page.locator('tr').filter({ hasText: fixture.student.fullName })
    await expect(studentRow).toBeVisible()
    await expect(studentRow.getByText('Bị đình chỉ')).toBeVisible()
    await expect(studentRow.getByText('Nguy cơ cao (3)')).toBeVisible()

    // Bấm nút "Xem vi phạm"
    await studentRow.getByRole('button', { name: 'Xem vi phạm', exact: true }).click()

    // Cheat Timeline modal hiển thị
    const timelineModal = page.getByRole('dialog', { name: 'Dòng Thời Gian Vi Phạm (Proctoring Log)' })
    await expect(timelineModal).toBeVisible()

    await expect(timelineModal.getByText('3 / 3')).toBeVisible()
    await expect(timelineModal.getByText('Nguy cơ cao')).toBeVisible()
    await expect(timelineModal.getByText('Bị hệ thống đình chỉ')).toBeVisible()
    await expect(timelineModal.getByText('Chi tiết từng sự kiện vi phạm (3)')).toBeVisible()

    // Đóng modal
    await timelineModal.getByRole('button', { name: 'Đóng nhật ký', exact: true }).click()
    await expect(timelineModal).toBeHidden()
  })
})
