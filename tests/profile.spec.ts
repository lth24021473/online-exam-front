import { expect, test as base } from '@playwright/test'
import type { Page } from '@playwright/test'

const token = 'mock-profile-token'
const user = {
  id: 'profile-student',
  fullName: 'Nguyễn Minh Anh',
  email: 'student@example.com',
  role: 'STUDENT',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}
const avatarKey = `online-exam.avatar.${user.id}`
const coverKey = `online-exam.cover.${user.id}`
const profileKey = `online-exam.profile.${user.id}`
const defaultCover = '/images/study-background.jpg'
const avatar = {
  name: 'avatar.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwrP79HwAFLwKnCwNlfgAAAABJRU5ErkJggg==', 'base64'),
}
const cover = { ...avatar, name: 'cover.png' }
type ProfileApi = { calls: string[]; setName: (name: string) => void }

// Never send profile tests to the live backend, including unexpected writes.
const test = base.extend<{ api: ProfileApi }>({
  api: [async ({ page }, use) => {
    let fullName = user.fullName
    const calls: string[] = []
    const unexpected: string[] = []
    await page.addInitScript((value) => {
      localStorage.setItem('online-exam.access-token', value)
    }, token)
    await page.route('http://localhost:3000/api/v1/**', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: {
          'access-control-allow-origin': 'http://localhost:5173',
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
        } })
        return
      }
      const key = `${request.method()} ${new URL(request.url()).pathname.replace('/api/v1', '')}`
      calls.push(key)
      if (key === 'GET /users/me') {
        expect(request.headers().authorization).toBe(`Bearer ${token}`)
        await route.fulfill({ status: 200, json: { ...user, fullName } })
      } else if (key === 'GET /attempts') {
        expect(request.headers().authorization).toBe(`Bearer ${token}`)
        await route.fulfill({ json: { items: [], meta: { page: 1, limit: 6, total: 0, totalPages: 0 } } })
      } else {
        unexpected.push(key)
        await route.fulfill({ status: 501, json: { message: 'Unexpected mocked profile endpoint' } })
      }
    })
    await use({ calls, setName: (name) => { fullName = name } })
    expect(unexpected, 'Profile interactions must not write to the API').toEqual([])
  }, { auto: true }],
})

async function expectNoOverflow(page: Page) {
  // Root dimensions stay in viewport coordinates when the body uses CSS zoom.
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
}

async function capturePreview(page: Page, path: string) {
  // Clip to physical document dimensions; body dimensions are unzoomed.
  const clip = await page.evaluate(() => ({
    x: 0,
    y: 0,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))
  await page.screenshot({ path, fullPage: true, clip })
}

async function expectActiveTabVisible(page: Page) {
  await expect.poll(() => page.getByRole('tablist').locator('[aria-selected="true"]').evaluate((element) => {
    const tab = element.getBoundingClientRect()
    const bar = element.parentElement!.getBoundingClientRect()
    return tab.left >= bar.left - 1 && tab.right <= bar.right + 1
  })).toBe(true)
}

test('profile shows real account details and four tabs with persistent query navigation', async ({ page, api }) => {
  await page.goto('/profile?source=account')
  await expect(page.getByRole('heading', { level: 1, name: user.fullName })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveText(['Giới thiệu', 'Lớp học', 'Nhiệm vụ', 'Chỉnh sửa tài khoản'])
  await expect(page.getByRole('tab', { name: 'Giới thiệu', exact: true })).toHaveAttribute('aria-selected', 'true')
  const details = page.getByRole('tabpanel').locator('dd')
  await expect(details.filter({ hasText: user.email })).toBeVisible()
  await expect(details.filter({ hasText: 'Học viên' })).toBeVisible()
  await expect(details.filter({ hasText: '1/9/2026' })).toBeVisible()

  for (const [label, value] of [['Lớp học', 'classes'], ['Nhiệm vụ', 'tasks'], ['Chỉnh sửa tài khoản', 'edit'], ['Giới thiệu', 'about']]) {
    await page.getByRole('tab', { name: label, exact: true }).click()
    await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true')
    expect(new URL(page.url()).searchParams.get('tab')).toBe(value)
    expect(new URL(page.url()).searchParams.get('source')).toBe('account')
    await expect(page.getByRole('tabpanel')).toBeVisible()
    if (value === 'classes') await expect(page.getByRole('heading', { name: 'Chưa có lớp học để hiển thị' })).toBeVisible()
    if (value === 'tasks') await expect(page.getByRole('heading', { name: 'Chưa có nhiệm vụ để hiển thị' })).toBeVisible()
  }

  await page.getByRole('tab', { name: 'Lớp học', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Lớp học', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.goto('/profile?tab=unknown&source=account')
  await expect(page.getByRole('tab', { name: 'Giới thiệu', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL('/profile?tab=unknown&source=account')
  expect(api.calls.length).toBeGreaterThan(0)
  expect(api.calls.every((call) => ['GET /users/me', 'GET /attempts'].includes(call))).toBe(true)
})

test('tabs support arrow keys, Home, End, focus and roving tabindex', async ({ page }) => {
  await page.goto('/profile')
  const about = page.getByRole('tab', { name: 'Giới thiệu', exact: true })
  await about.focus()
  for (const [key, label] of [
    ['ArrowRight', 'Lớp học'], ['ArrowRight', 'Nhiệm vụ'], ['ArrowRight', 'Chỉnh sửa tài khoản'],
    ['ArrowRight', 'Giới thiệu'], ['ArrowLeft', 'Chỉnh sửa tài khoản'], ['End', 'Chỉnh sửa tài khoản'],
    ['Home', 'Giới thiệu'], ['ArrowLeft', 'Chỉnh sửa tài khoản'], ['ArrowRight', 'Giới thiệu'],
  ]) {
    await page.keyboard.press(key)
    const selected = page.getByRole('tab', { name: label, exact: true })
    await expect(selected).toBeFocused()
    await expect(selected).toHaveAttribute('aria-selected', 'true')
    await expect(selected).toHaveAttribute('tabindex', '0')
    await expect(page.getByRole('tablist').locator('[role="tab"][tabindex="0"]')).toHaveCount(1)
    await expect(page.getByRole('tablist').locator('[role="tab"][tabindex="-1"]')).toHaveCount(3)
  }
})

test('saved profile edits update account details and home greeting and persist after reload', async ({ page, api }) => {
  await page.goto('/profile?tab=edit')
  const fullName = page.getByLabel('Tên tài khoản', { exact: true })
  const workplace = page.getByLabel('Nơi làm việc', { exact: true })
  const currentResidence = page.getByLabel('Nơi ở hiện tại', { exact: true })
  await expect(fullName).toHaveValue(user.fullName)
  await expect(workplace).toHaveValue('')
  await expect(currentResidence).toHaveValue('')
  await fullName.fill('  Trần Hà Linh  ')
  await workplace.fill('  Trường Đại học Bách khoa  ')
  await currentResidence.fill('  Thành phố Hồ Chí Minh  ')
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Đã lưu thay đổi tài khoản.')
  await expect(page.getByRole('heading', { level: 1, name: 'Trần Hà Linh', exact: true })).toBeVisible()
  await expect(fullName).toHaveValue('Trần Hà Linh')
  const saved = { fullName: 'Trần Hà Linh', workplace: 'Trường Đại học Bách khoa', currentResidence: 'Thành phố Hồ Chí Minh' }
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), profileKey)).toEqual(saved)

  await page.getByRole('tab', { name: 'Giới thiệu', exact: true }).click()
  const about = page.getByRole('tabpanel')
  await expect(about.getByText(saved.fullName, { exact: true })).toBeVisible()
  await expect(about.getByText(saved.workplace, { exact: true })).toBeVisible()
  await expect(about.getByText(saved.currentResidence, { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Trang chủ', exact: true }).click()
  await expect(page.getByRole('heading', { name: `Xin chào, ${saved.fullName}!`, exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: `Xin chào, ${saved.fullName}!`, exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Tài khoản', exact: true }).click()
  await page.getByRole('tab', { name: 'Chỉnh sửa tài khoản', exact: true }).click()
  await expect(fullName).toHaveValue(saved.fullName)
  await expect(workplace).toHaveValue(saved.workplace)
  await expect(currentResidence).toHaveValue(saved.currentResidence)
  expect(api.calls.every((call) => ['GET /users/me', 'GET /attempts'].includes(call))).toBe(true)
})

test('account save notices expire after one second and repeated saves restart their lifetime', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-03T00:00:00Z') })
  await page.goto('/profile?tab=edit')
  const save = page.getByRole('button', { name: 'Lưu thay đổi', exact: true })
  const notice = page.getByRole('status').filter({ hasText: 'Đã lưu thay đổi tài khoản.' })
  await expect(save).toBeVisible()
  await page.clock.pauseAt(new Date('2026-10-03T01:00:00Z'))

  await save.click()
  await expect(notice).toBeVisible()
  await page.clock.runFor(999)
  await expect(notice).toBeVisible()
  await page.clock.runFor(1)
  await expect(notice).toHaveCount(0)

  await save.click()
  await expect(notice).toBeVisible()
  await page.clock.runFor(500)
  await save.click()
  await expect(notice).toBeVisible()
  await page.clock.runFor(500)
  await expect(notice).toBeVisible()
  await page.clock.runFor(499)
  await expect(notice).toBeVisible()
  await page.clock.runFor(1)
  await expect(notice).toHaveCount(0)

  await page.getByLabel('Tên tài khoản', { exact: true }).fill('   ')
  await save.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.clock.runFor(2000)
  await expect(page.getByRole('alert')).toBeVisible()
})

test('cancel restores the last saved profile and optional location fields can be cleared', async ({ page }) => {
  await page.goto('/profile?tab=edit')
  const fullName = page.getByLabel('Tên tài khoản', { exact: true })
  const workplace = page.getByLabel('Nơi làm việc', { exact: true })
  const currentResidence = page.getByLabel('Nơi ở hiện tại', { exact: true })
  await fullName.fill('Tên chưa lưu')
  await workplace.fill('Nơi làm việc chưa lưu')
  await currentResidence.fill('Nơi ở chưa lưu')
  await page.getByRole('button', { name: 'Hủy thay đổi', exact: true }).click()
  await expect(fullName).toHaveValue(user.fullName)
  await expect(workplace).toHaveValue('')
  await expect(currentResidence).toHaveValue('')
  await expect(page.getByRole('heading', { level: 1, name: user.fullName })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), profileKey)).toBeNull()

  await workplace.fill('Hà Nội')
  await currentResidence.fill('Đà Nẵng')
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Đã lưu thay đổi tài khoản.')
  await fullName.fill('Tên chưa lưu lần nữa')
  await workplace.fill('Nơi khác')
  await currentResidence.fill('Nơi khác nữa')
  await page.getByRole('button', { name: 'Hủy thay đổi', exact: true }).click()
  await expect(fullName).toHaveValue(user.fullName)
  await expect(workplace).toHaveValue('Hà Nội')
  await expect(currentResidence).toHaveValue('Đà Nẵng')

  await workplace.fill('')
  await currentResidence.fill('')
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click()
  await page.reload()
  await expect(workplace).toHaveValue('')
  await expect(currentResidence).toHaveValue('')
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), profileKey)).toEqual({
    fullName: user.fullName, workplace: '', currentResidence: '',
  })
})

test('blank names and browser storage failures leave the saved account unchanged', async ({ page }) => {
  await page.goto('/profile?tab=edit')
  const fullName = page.getByLabel('Tên tài khoản', { exact: true })
  await fullName.fill('   ')
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: user.fullName })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), profileKey)).toBeNull()

  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage is full', 'QuotaExceededError')
      original.call(this, name, value)
    }
  }, profileKey)
  await fullName.fill('Tên không lưu được')
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: user.fullName })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), profileKey)).toBeNull()
  await page.getByRole('link', { name: 'Trang chủ', exact: true }).click()
  await expect(page.getByRole('heading', { name: `Xin chào, ${user.fullName}!`, exact: true })).toBeVisible()
})

test('profile metadata for another account does not affect the current account', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('online-exam.profile.another-student', JSON.stringify({
      fullName: 'Tên tài khoản khác', workplace: 'Nơi làm việc khác', currentResidence: 'Nơi ở khác',
    }))
  })
  await page.goto('/profile?tab=edit')
  await expect(page.getByRole('heading', { level: 1, name: user.fullName })).toBeVisible()
  await expect(page.getByLabel('Tên tài khoản', { exact: true })).toHaveValue(user.fullName)
  await expect(page.getByLabel('Nơi làm việc', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Nơi ở hiện tại', { exact: true })).toHaveValue('')
})

test('avatar upload persists locally across reload and can be removed', async ({ page, api }) => {
  await page.goto('/profile?tab=edit')
  await expect(page.getByRole('button', { name: 'Đổi ảnh đại diện', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chỉnh sửa ảnh đại diện', exact: true })).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Chỉnh sửa ảnh đại diện', exact: true }).click()
  await (await chooser).setFiles(avatar)
  const photo = page.locator('.account-avatar-shell img')
  await expect(photo).toBeVisible()
  await expect(photo).toHaveAttribute('alt', `Ảnh đại diện của ${user.fullName}`)
  await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), avatarKey)).toMatch(/^data:image\/png;base64,/)
  await page.reload()
  await expect(photo).toBeVisible()
  await page.getByRole('button', { name: 'Xóa ảnh đại diện', exact: true }).click()
  await expect(photo).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), avatarKey)).toBeNull()
  await page.reload()
  await expect(photo).toHaveCount(0)
  expect(api.calls.every((call) => ['GET /users/me', 'GET /attempts'].includes(call))).toBe(true)
})

test('overlapping avatar and cover notices expire independently after one second', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-03T00:00:00Z') })
  await page.goto('/profile?tab=edit')
  await expect(page.getByRole('button', { name: 'Chỉnh sửa ảnh đại diện', exact: true })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-10-03T01:00:00Z'))
  const avatarNotice = page.getByRole('status').filter({ hasText: 'Ảnh đại diện đã được lưu trên trình duyệt này.' })
  const coverNotice = page.getByRole('status').filter({ hasText: 'Ảnh bìa đã được lưu trên trình duyệt này.' })

  await page.getByLabel('Chọn ảnh đại diện', { exact: true }).setInputFiles(avatar)
  await expect(avatarNotice).toBeVisible()
  await page.clock.runFor(500)
  await page.getByLabel('Chọn ảnh bìa', { exact: true }).setInputFiles(cover)
  await expect(coverNotice).toBeVisible()
  await page.clock.runFor(499)
  await expect(avatarNotice).toBeVisible()
  await expect(coverNotice).toBeVisible()
  await page.clock.runFor(1)
  await expect(avatarNotice).toHaveCount(0)
  await expect(coverNotice).toBeVisible()
  await page.clock.runFor(499)
  await expect(coverNotice).toBeVisible()
  await page.clock.runFor(1)
  await expect(coverNotice).toHaveCount(0)

  await page.getByRole('button', { name: 'Xóa ảnh đại diện', exact: true }).click()
  await page.getByRole('button', { name: 'Xóa ảnh bìa', exact: true }).click()
  const removalNotices = page.getByRole('status').filter({ hasText: 'đã được xóa trên trình duyệt này.' })
  await expect(removalNotices).toHaveCount(2)
  await page.clock.runFor(999)
  await expect(removalNotices).toHaveCount(2)
  await page.clock.runFor(1)
  await expect(removalNotices).toHaveCount(0)
})

test('unsupported or oversized avatar files show an error and retain the existing avatar', async ({ page }) => {
  await page.goto('/profile?tab=edit')
  const input = page.getByLabel('Chọn ảnh đại diện', { exact: true })
  await input.setInputFiles(avatar)
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), avatarKey)).toMatch(/^data:image\/png;base64,/)
  const saved = await page.evaluate((key) => localStorage.getItem(key), avatarKey)
  for (const file of [
    { name: 'avatar.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
    { name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) },
  ]) {
    await input.setInputFiles(file)
    await expect(page.getByRole('alert')).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key), avatarKey)).toBe(saved)
    await expect(page.locator('.account-avatar-shell img')).toBeVisible()
  }
})

test('cover editor uploads an image that persists independently of the avatar and can be removed', async ({ page, api }) => {
  await page.goto('/profile?tab=edit')
  const photo = page.locator('.account-cover img')
  const header = page.locator('.account-profile-header')
  const editor = page.getByRole('tabpanel')
  const editButton = editor.getByRole('button', { name: 'Chọn ảnh bìa mới', exact: true })
  await expect(photo).toBeVisible()
  await expect(photo).toHaveAttribute('alt', `Ảnh bìa của ${user.fullName}`)
  await expect(photo).toHaveAttribute('src', defaultCover)
  await expect(editButton).toBeVisible()
  await expect(header.getByRole('button', { name: 'Chỉnh sửa ảnh bìa', exact: true })).toHaveCount(0)
  await expect(header.getByRole('button', { name: 'Xóa ảnh bìa', exact: true })).toHaveCount(0)
  await expect(editor.getByRole('button', { name: 'Xóa ảnh bìa', exact: true })).toHaveCount(0)

  await page.getByLabel('Chọn ảnh đại diện', { exact: true }).setInputFiles(avatar)
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), avatarKey)).toMatch(/^data:image\/png;base64,/)
  const savedAvatar = await page.evaluate((key) => localStorage.getItem(key), avatarKey)
  const chooser = page.waitForEvent('filechooser')
  await editButton.click()
  await (await chooser).setFiles(cover)
  await expect(photo).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  const savedCover = await page.evaluate((key) => localStorage.getItem(key), coverKey)
  expect(savedCover).toMatch(/^data:image\/png;base64,/)
  expect(await page.evaluate((key) => localStorage.getItem(key), avatarKey)).toBe(savedAvatar)
  await expect(editor.getByRole('button', { name: 'Xóa ảnh bìa', exact: true })).toBeVisible()
  await expect(header.getByRole('button', { name: 'Xóa ảnh bìa', exact: true })).toHaveCount(0)

  await page.reload()
  await expect(photo).toHaveAttribute('src', savedCover!)
  await expect(page.locator('.account-avatar-shell img')).toHaveAttribute('src', savedAvatar!)
  const editChooser = page.waitForEvent('filechooser')
  await editButton.click()
  await (await editChooser).setFiles(cover)
  await expect(photo).toHaveAttribute('src', savedCover!)
  await editor.getByRole('button', { name: 'Xóa ảnh bìa', exact: true }).click()
  await expect(photo).toHaveAttribute('src', defaultCover)
  expect(await page.evaluate((key) => localStorage.getItem(key), coverKey)).toBeNull()
  await expect(page.locator('.account-avatar-shell img')).toHaveAttribute('src', savedAvatar!)
  await expect(page.getByRole('button', { name: 'Xóa ảnh bìa', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(photo).toHaveAttribute('src', defaultCover)
  await expect(page.locator('.account-avatar-shell img')).toHaveAttribute('src', savedAvatar!)
  expect(api.calls.every((call) => ['GET /users/me', 'GET /attempts'].includes(call))).toBe(true)
})

test('invalid cover files preserve the saved image and report a cover error', async ({ page }) => {
  await page.goto('/profile?tab=edit')
  const input = page.getByLabel('Chọn ảnh bìa', { exact: true })
  const photo = page.locator('.account-cover img')
  await input.setInputFiles(cover)
  await expect(photo).toHaveAttribute('src', /^data:image\/png;base64,/)
  const savedCover = await page.evaluate((key) => localStorage.getItem(key), coverKey)

  for (const { file, message } of [
    {
      file: { name: 'cover.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
      message: /PNG|JPG|WebP/i,
    },
    {
      file: { name: 'large-cover.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) },
      message: /2 MB/,
    },
    {
      file: { name: 'corrupt-cover.png', mimeType: 'image/png', buffer: Buffer.from('not a valid PNG image') },
      message: /lỗi|không hợp lệ/i,
    },
  ]) {
    await input.setInputFiles(file)
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByRole('alert')).toContainText(/ảnh bìa/i)
    await expect(photo).toHaveAttribute('src', savedCover!)
    expect(await page.evaluate((key) => localStorage.getItem(key), coverKey)).toBe(savedCover)
  }
})

test('profile fits 390px and 320px with a long Vietnamese name in every tab', async ({ page, api }) => {
  const longName = 'Nguyễn Thị Minh Anh Hoàng Lê Trần Phương Thảo'
  api.setName(longName)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/profile')
    await expect(page.getByRole('heading', { level: 1, name: longName })).toBeVisible()
    await expect(page.locator('.account-cover img')).toBeVisible()
    const header = page.locator('.account-profile-header')
    await expect(header.getByRole('button', { name: 'Chỉnh sửa ảnh bìa', exact: true })).toHaveCount(0)
    await expect(header.getByRole('button', { name: 'Xóa ảnh bìa', exact: true })).toHaveCount(0)
    for (const label of ['Giới thiệu', 'Lớp học', 'Nhiệm vụ', 'Chỉnh sửa tài khoản']) {
      await page.getByRole('tab', { name: label, exact: true }).click()
      await expect(page.getByRole('tabpanel')).toBeVisible()
      if (label === 'Chỉnh sửa tài khoản') {
        await expect(page.getByRole('tabpanel').getByRole('button', { name: 'Chọn ảnh bìa mới', exact: true })).toBeVisible()
      }
      await expectNoOverflow(page)
    }
  }
})

test('dark mode works with the keyboard, persists and follows account and home navigation', async ({ page }) => {
  const themeKey = 'online-exam.theme'
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/profile?tab=settings')
  await expect(page).toHaveURL('/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Cài đặt', exact: true })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  const toggle = page.getByRole('switch', { name: 'Chế độ tối', exact: true })
  const visibleCard = page.locator('.account-settings-card')
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 247, 251)')
  await expect(visibleCard).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 24, 39)')
  await expect(visibleCard).toHaveCSS('background-color', 'rgb(31, 41, 55)')
  await expect(page.getByRole('heading', { level: 1, name: 'Cài đặt', exact: true })).toHaveCSS('color', 'rgb(243, 244, 246)')
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), themeKey)).toBe('dark')
  await expectNoOverflow(page)
  await capturePreview(page, 'test-results/preview-settings-dark-desktop.png')

  await page.reload()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(visibleCard).toHaveCSS('background-color', 'rgb(31, 41, 55)')
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(toggle).toBeVisible()
    await expectNoOverflow(page)
  }
  await capturePreview(page, 'test-results/preview-settings-dark-mobile.png')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('link', { name: 'Trang chủ', exact: true }).click()
  await expect(page).toHaveURL('/dashboard')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 24, 39)')
  await expect(page.locator('.app-header')).toHaveCSS('background-color', 'rgb(31, 41, 55)')
  await expect(page.locator('.dashboard-hint')).toHaveCSS('background-color', 'rgb(38, 50, 68)')
  await capturePreview(page, 'test-results/preview-dashboard-dark-desktop.png')
  await page.getByRole('link', { name: 'Tài khoản', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Cài đặt', exact: true })).toHaveCount(0)
  await expect(page.locator('.account-name h1')).toHaveCSS('color', 'rgb(243, 244, 246)')
  await page.getByRole('link', { name: 'Cài đặt', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 247, 251)')
  await expect(visibleCard).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), themeKey)).toBe('light')
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('dark OS preference and invalid saved themes still default to light mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/profile?tab=settings')
  await expect(page).toHaveURL('/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Cài đặt', exact: true })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  const toggle = page.getByRole('switch', { name: 'Chế độ tối', exact: true })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 247, 251)')
  await page.evaluate(() => localStorage.setItem('online-exam.theme', 'invalid-theme'))
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('profile desktop and mobile previews are captured', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/profile')
  await expect(page.getByRole('heading', { level: 1, name: user.fullName })).toBeVisible()
  await expectNoOverflow(page)
  await capturePreview(page, 'test-results/preview-profile-desktop.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoOverflow(page)
  await capturePreview(page, 'test-results/preview-profile-mobile.png')

  await page.getByRole('tab', { name: 'Chỉnh sửa tài khoản', exact: true }).click()
  await expect(page.getByLabel('Tên tài khoản', { exact: true })).toHaveValue(user.fullName)
  await expectNoOverflow(page)
  await capturePreview(page, 'test-results/preview-profile-edit-mobile.png')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expectNoOverflow(page)
  await capturePreview(page, 'test-results/preview-profile-edit-desktop.png')
  await page.getByRole('link', { name: 'Cài đặt', exact: true }).click()
  await expectNoOverflow(page)
  await capturePreview(page, 'test-results/preview-settings-desktop.png')
  await page.getByRole('switch', { name: 'Chế độ tối', exact: true }).click()
  await page.getByRole('link', { name: 'Tài khoản', exact: true }).click()
  await page.getByRole('tab', { name: 'Chỉnh sửa tài khoản', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expectNoOverflow(page)
  await capturePreview(page, 'test-results/preview-profile-edit-dark-desktop.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoOverflow(page)
  await expectActiveTabVisible(page)
  await capturePreview(page, 'test-results/preview-profile-edit-dark-mobile.png')
})
