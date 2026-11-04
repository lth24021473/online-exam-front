import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

const examId = '670001111111111111111111'
const attemptId = '670002222222222222222222'
const questionId = '670003333333333333333333'
const token = 'mock-proctoring-token'

const studentUser = {
  id: 'student-id-1',
  fullName: 'Trần Văn An',
  email: 'student@example.com',
  role: 'STUDENT',
}

const managerUser = {
  id: 'manager-id-1',
  fullName: 'Cô Mai Quản Lý',
  email: 'teacher@example.com',
  role: 'EXAM_MANAGER',
}

async function setupMock(
  page: Page,
  role: 'STUDENT' | 'EXAM_MANAGER',
  customHandlers: Record<string, (route: Route) => Promise<void>> = {},
) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value)
    },
    { key: 'online-exam.access-token', value: token },
  )

  await page.route('http://localhost:3000/api/v1/**', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': 'http://localhost:5173',
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
        },
      })
      return
    }

    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    const key = `${request.method()} ${path}`

    if (customHandlers[key]) {
      await customHandlers[key](route)
      return
    }

    if (key === 'GET /users/me') {
      await route.fulfill({
        json: role === 'STUDENT' ? studentUser : managerUser,
      })
      return
    }

    if (key === 'GET /exams') {
      await route.fulfill({
        json: {
          items: [],
          meta: { page: 1, limit: 12, total: 0, totalPages: 0 },
        },
      })
      return
    }

    await route.fulfill({ status: 404, json: { message: 'Not found' } })
  })
}

test.describe('Smart Proctoring Frontend Tests', () => {
  test('Học sinh làm bài thi: Nhận diện F12, hiển thị cảnh báo, vi phạm tăng', async ({ page }) => {
    let violationCount = 0

    await setupMock(page, 'STUDENT', {
      [`POST /exams/${examId}/attempts`]: async (route) => {
        await route.fulfill({
          status: 201,
          json: {
            resumed: false,
            attempt: {
              id: attemptId,
              examId,
              status: 'IN_PROGRESS',
              startedAt: new Date().toISOString(),
              deadlineAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
              totalQuestions: 1,
              violationCount: 0,
            },
            exam: {
              id: examId,
              title: 'Kiểm tra Đột phá với Giám Sát Thi',
              instructions: 'Làm bài trung thực, không chuyển tab.',
              durationMinutes: 20,
              enableProctoring: true,
              maxViolations: 3,
            },
            questions: [
              {
                id: questionId,
                position: 1,
                content: 'Một cộng một bằng mấy?',
                options: ['1', '2', '3', '4'],
              },
            ],
            answers: [],
          },
        })
      },
      [`POST /attempts/${attemptId}/violations`]: async (route) => {
        violationCount += 1
        await route.fulfill({
          json: {
            violation: {
              id: `v-${violationCount}`,
              attemptId,
              type: 'DEVTOOLS_OPEN',
              detail: 'Phím tắt F12 (Developer Tools)',
              createdAt: new Date().toISOString(),
            },
            violationCount,
            maxViolations: 3,
            terminated: false,
            submitted: false,
            result: null,
          },
        })
      },
    })

    await page.goto(`/exams/${examId}/take`)

    // Verify taking workspace (no redundant badge or fullscreen button)
    await expect(page.getByRole('heading', { name: 'Kiểm tra Đột phá với Giám Sát Thi' })).toBeVisible()
    await expect(page.getByText('GIÁM SÁT THI: BẬT')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Toàn màn hình', exact: true })).not.toBeVisible()

    // Verify global navigation bar and footer are hidden during exam taking
    await expect(page.locator('.app-header')).toBeHidden()
    await expect(page.locator('.app-footer')).toBeHidden()

    // 1st violation: Press F12
    await page.keyboard.press('F12')
    const warningModal = page.getByRole('alertdialog')
    await expect(warningModal).toBeVisible()
    await expect(warningModal.getByText('PHÁT HIỆN HÀNH VI ĐÁNG NGỜ!')).toBeVisible()
    await expect(warningModal.getByText('1 / 3')).toBeVisible()

    // Dismiss warning
    await warningModal.getByRole('button', { name: 'Tôi đã hiểu và cam kết không tái phạm', exact: true }).click()
    await expect(warningModal).toBeHidden()
    await expect(page.getByText('Vi phạm: 1/3')).toBeVisible()
  })

  test('Giáo viên xem kết quả: Hiển thị badge mức độ rủi ro & mở modal Cheat Timeline', async ({ page }) => {
    await setupMock(page, 'EXAM_MANAGER', {
      [`GET /exams/${examId}/results`]: async (route) => {
        await route.fulfill({
          json: {
            exam: {
              id: examId,
              title: 'Đề thi trắc nghiệm Toán đại cương',
              status: 'PUBLISHED',
              durationMinutes: 45,
              enableProctoring: true,
              maxViolations: 3,
            },
            data: [
              {
                id: attemptId,
                status: 'SUBMITTED',
                startedAt: '2026-10-20T10:00:00.000Z',
                deadlineAt: '2026-10-20T10:45:00.000Z',
                submittedAt: '2026-10-20T10:25:00.000Z',
                cancelledAt: null,
                score: 4.5,
                totalQuestions: 10,
                correctCount: 4,
                incorrectCount: 6,
                violationCount: 3,
                terminatedReason: 'EXCEEDED_VIOLATIONS',
                violations: [
                  {
                    id: 'v1',
                    attemptId,
                    type: 'TAB_SWITCH',
                    detail: 'Thí sinh chuyển sang tab hoặc ứng dụng khác',
                    createdAt: '2026-10-20T10:05:00.000Z',
                  },
                  {
                    id: 'v2',
                    attemptId,
                    type: 'FULLSCREEN_EXIT',
                    detail: 'Thí sinh đã thoát chế độ toàn màn hình',
                    createdAt: '2026-10-20T10:12:00.000Z',
                  },
                  {
                    id: 'v3',
                    attemptId,
                    type: 'DEVTOOLS_OPEN',
                    detail: 'Phím tắt F12 (Developer Tools)',
                    createdAt: '2026-10-20T10:25:00.000Z',
                  },
                ],
                user: {
                  id: 'student-id-1',
                  fullName: 'Lê Văn Hoàng',
                  email: 'hoang.le@example.com',
                },
              },
            ],
            meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
            summary: {
              totalAttempts: 1,
              inProgressCount: 0,
              submittedCount: 1,
              cancelledCount: 0,
              averageScore: 4.5,
              highestScore: 4.5,
              lowestScore: 4.5,
            },
          },
        })
      },
    })

    await page.goto(`/manage/exams/${examId}/results`)

    // Verify row rendered with badges
    await expect(page.getByText('Lê Văn Hoàng')).toBeVisible()
    await expect(page.getByText('Bị đình chỉ')).toBeVisible()
    await expect(page.getByText('Nguy cơ cao (3)')).toBeVisible()

    // Click "Xem vi phạm"
    await page.getByRole('button', { name: 'Xem vi phạm', exact: true }).click()

    // Cheat Timeline modal opens
    const dialog = page.getByRole('dialog', { name: 'NHẬT KÝ GIÁM SÁT' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('3 / 3')).toBeVisible()
    await expect(dialog.getByText('Nguy cơ cao')).toBeVisible()
    await expect(dialog.getByText('Bị hệ thống đình chỉ')).toBeVisible()
    await expect(dialog.getByText('Chi tiết từng sự kiện vi phạm (3)')).toBeVisible()
    await expect(dialog.getByText('Chuyển tab hoặc rời giao diện thi', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Thoát chế độ toàn màn hình', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Thao tác mở công cụ DevTools (F12)', { exact: true })).toBeVisible()

    // Close modal
    await dialog.getByRole('button', { name: 'Đóng nhật ký', exact: true }).click()
    await expect(dialog).toBeHidden()
  })

  test('Giáo viên tạo đề thi: Cho phép cấu hình bật/tắt giám sát & số lần vi phạm tối đa', async ({ page }) => {
    await setupMock(page, 'EXAM_MANAGER')

    await page.goto('/manage/exams/create')

    const proctoringCheckbox = page.getByLabel('Bật giám sát thi thông minh (Heuristic Proctoring)', { exact: true })
    await expect(proctoringCheckbox).toBeChecked()

    const maxViolationsInput = page.getByLabel('Số lần vi phạm tối đa trước khi thu bài', { exact: true })
    await expect(maxViolationsInput).toBeVisible()
    await expect(maxViolationsInput).toHaveValue('3')

    // Change max violations to 5
    await maxViolationsInput.fill('5')
    await expect(maxViolationsInput).toHaveValue('5')

    // Verify camera checkbox is removed
    const cameraCheckbox = page.getByLabel('Yêu cầu bật Camera (Giám sát khuôn mặt thí sinh)', { exact: true })
    await expect(cameraCheckbox).not.toBeVisible()

    // Uncheck proctoring hides sub-options
    await proctoringCheckbox.uncheck()
    await expect(maxViolationsInput).toBeHidden()
  })
})
