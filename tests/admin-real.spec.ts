import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { AuthRole } from '../src/api/auth.api'

type Fixture = {
  kind: string
  admin: { id: string; email: string }
  target: { id: string; email: string }
  password: string
  apiUrl: string
  revokedTokenHashes?: string[]
}
type Login = { accessToken: string; user: { role: AuthRole } }
let fixture: Fixture

async function loginApi(request: APIRequestContext, email: string): Promise<Login> {
  const response = await request.post(`${fixture.apiUrl}/auth/login`, { data: { email, password: fixture.password } })
  expect(response.status()).toBe(200)
  return response.json() as Promise<Login>
}

async function verifyToken(request: APIRequestContext, accessToken: string, status: number, role?: AuthRole) {
  const response = await request.get(`${fixture.apiUrl}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
  expect(response.status()).toBe(status)
  if (role) expect((await response.json()).role).toBe(role)
}

async function loginUi(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Địa chỉ email', { exact: true }).fill(fixture.admin.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL('/dashboard')
}

async function changeRole(page: Page, role: AuthRole, own = false) {
  await page.getByLabel('Vai trò', { exact: true }).selectOption(role)
  await page.getByRole('button', { name: 'Lưu vai trò', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận đổi vai trò', exact: true }).click()
  if (own) await expect(page).toHaveURL('/login')
  else await expect(page.getByRole('status')).toContainText('Đã cập nhật vai trò')
}

test.describe('ADMIN UI with the live API and two owned accounts', () => {
  test.skip(process.env.REAL_API_E2E !== '1', 'Run npm run test:e2e:admin-real to create and clean dedicated temporary accounts')
  test.beforeAll(() => {
    if (!process.env.FRONT_ADMIN_FIXTURE) throw new Error('FRONT_ADMIN_FIXTURE is required for the real ADMIN suite')
    fixture = JSON.parse(readFileSync(process.env.FRONT_ADMIN_FIXTURE, 'utf8')) as Fixture
    if (fixture.kind !== 'online-exam-admin-ui-owned-fixture') throw new Error('Invalid ADMIN fixture')
  })

  test('role changes and account deletion invalidate old JWTs and ADMIN UI ends its own session', async ({ page, context }) => {
    test.setTimeout(90_000)
    const originalTarget = await loginApi(context.request, fixture.target.email)
    expect(originalTarget.user.role).toBe('STUDENT')
    await loginUi(page)
    const adminToken = await page.evaluate(() => localStorage.getItem('online-exam.access-token'))
    expect(adminToken).toBeTruthy()

    await page.getByRole('link', { name: 'Quản trị', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Quản lý tài khoản', exact: true })).toBeVisible()
    await page.getByLabel('Tìm tài khoản', { exact: true }).fill(fixture.target.email)
    await page.getByRole('button', { name: `Xem ${fixture.target.email}`, exact: true }).click()
    await expect(page.getByLabel('Vai trò', { exact: true })).toHaveValue('STUDENT')

    await changeRole(page, 'EXAM_MANAGER')
    await verifyToken(context.request, originalTarget.accessToken, 401)
    const manager = await loginApi(context.request, fixture.target.email)
    await verifyToken(context.request, manager.accessToken, 200, 'EXAM_MANAGER')

    await changeRole(page, 'STUDENT')
    await verifyToken(context.request, manager.accessToken, 401)
    // Returning to the previous role must not restore a JWT issued before the first role change.
    await verifyToken(context.request, originalTarget.accessToken, 401)
    const updatedStudent = await loginApi(context.request, fixture.target.email)
    await verifyToken(context.request, updatedStudent.accessToken, 200, 'STUDENT')
    await page.screenshot({ path: 'test-results/admin-real-accounts-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 320, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/admin-real-accounts-mobile.png', fullPage: true })
    await page.setViewportSize({ width: 1280, height: 800 })

    await page.getByRole('button', { name: 'Xóa tài khoản', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận xóa', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Đã xóa tài khoản.')
    await expect(page.getByRole('button', { name: `Xem ${fixture.target.email}`, exact: true })).toHaveCount(0)
    await verifyToken(context.request, updatedStudent.accessToken, 401)

    await page.getByLabel('Tìm tài khoản', { exact: true }).fill(fixture.admin.email)
    await page.getByRole('button', { name: `Xem ${fixture.admin.email}`, exact: true }).click()
    await expect(page.getByLabel('Vai trò', { exact: true })).toHaveValue('ADMIN')
    await changeRole(page, 'STUDENT', true)
    expect(await page.evaluate(() => localStorage.getItem('online-exam.access-token'))).toBeNull()
    await expect(page.getByRole('alert')).toContainText('Vai trò của bạn đã thay đổi')
    await verifyToken(context.request, adminToken!, 401)

    await loginUi(page)
    await expect(page.getByRole('link', { name: 'Quản trị', exact: true })).toHaveCount(0)
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'Chức năng dành cho quản trị viên', exact: true })).toBeVisible()
    const studentToken = await page.evaluate(() => localStorage.getItem('online-exam.access-token'))
    const forbidden = await context.request.get(`${fixture.apiUrl}/admin/users`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    expect(forbidden.status()).toBe(403)

    // Record ownership before logout so cleanup also handles a lost response or a failed assertion.
    fixture.revokedTokenHashes = [...(fixture.revokedTokenHashes ?? []), createHash('sha256').update(studentToken!).digest('hex')]
    writeFileSync(process.env.FRONT_ADMIN_FIXTURE!, JSON.stringify(fixture), { encoding: 'utf8', mode: 0o600 })
    await page.getByRole('link', { name: 'Cài đặt', exact: true }).click()
    await page.getByRole('button', { name: 'Đăng xuất tài khoản', exact: true }).click()
    await expect(page).toHaveURL('/login')
    expect(await page.evaluate(() => localStorage.getItem('online-exam.access-token'))).toBeNull()
    await verifyToken(context.request, studentToken!, 401)
  })
})
