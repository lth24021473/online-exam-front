import { expect, test as base } from '@playwright/test'
import type { Request, Route } from '@playwright/test'

type MockApi = {
  calls: Request[]
  handle: (key: string, handler: (route: Route) => Promise<void>) => void
}

// Every API request is mocked, including unexpected endpoints and preflights.
const test = base.extend<{ mockApi: MockApi }>({
  mockApi: [async ({ page }, use) => {
    const handlers = new Map<string, (route: Route) => Promise<void>>()
    const calls: Request[] = []
    const unexpected: string[] = []
    await page.route('**/api/v1/**', async (route) => {
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
      calls.push(request)
      const key = `${request.method()} ${new URL(request.url()).pathname.replace('/api/v1', '')}`
      const handler = handlers.get(key)
      if (handler) await handler(route)
      else {
        unexpected.push(key)
        await route.fulfill({ status: 501, json: { message: 'Unexpected mocked API endpoint' } })
      }
    })
    await use({ calls, handle: (key, handler) => handlers.set(key, handler) })
    expect(unexpected, 'All API calls must use explicit mocks').toEqual([])
  }, { auto: true }],
})

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
})

test('JSON and FormData use the correct wire format and bearer token', async ({ page, mockApi }) => {
  mockApi.handle('POST /client-json', async (route) => { await route.fulfill({ json: { ok: true } }) })
  mockApi.handle('POST /client-upload', async (route) => { await route.fulfill({ json: { ok: true } }) })

  const defaults = await page.evaluate(async () => {
    const modulePath = '/src/api/axios.ts'
    const { api, setAccessToken } = await import(modulePath)
    setAccessToken('client-token')
    await api.post('/client-json', { title: 'Bài kiểm tra', count: 2 })
    const form = new FormData()
    form.append('title', 'Bài kiểm tra')
    form.append('file', new File(['file contents'], 'questions.txt', { type: 'text/plain' }))
    await api.post('/client-upload', form)
    return { withCredentials: api.defaults.withCredentials, timeout: api.defaults.timeout }
  })

  expect(defaults).toEqual({ withCredentials: true, timeout: 15_000 })
  expect(mockApi.calls).toHaveLength(2)
  const [json, upload] = mockApi.calls
  expect(json.headers()['content-type']).toContain('application/json')
  expect(json.postDataJSON()).toEqual({ title: 'Bài kiểm tra', count: 2 })
  expect(upload.headers()['content-type']).toMatch(/^multipart\/form-data; boundary=.+/)
  expect(upload.postData()).toContain('name="title"\r\n\r\nBài kiểm tra')
  expect(upload.postData()).toContain('name="file"; filename="questions.txt"')
  expect(upload.postData()).toContain('Content-Type: text/plain\r\n\r\nfile contents')
  for (const request of mockApi.calls) {
    expect(request.headers().authorization).toBe('Bearer client-token')
    expect(request.headers().accept).toBe('application/json')
  }
})

test('a late 401 for an old token preserves a newly established session', async ({ page, mockApi }) => {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  mockApi.handle('GET /client-protected', async (route) => {
    await pending
    await route.fulfill({ status: 401, json: { message: 'Invalid or expired token' } })
  })
  const resultPromise = page.evaluate(async () => {
    const modulePath = '/src/api/axios.ts'
    const { api, getAccessToken, setAccessToken, SESSION_EXPIRED_EVENT } = await import(modulePath)
    let expired = 0
    window.addEventListener(SESSION_EXPIRED_EVENT, () => { expired += 1 })
    setAccessToken('old-token')
    const request = api.get('/client-protected').catch((error: { response?: { status: number } }) => error.response?.status)
    await request
    return { token: getAccessToken(), expired }
  })
  try {
    await expect.poll(() => mockApi.calls.length).toBe(1)
    expect(mockApi.calls[0].headers().authorization).toBe('Bearer old-token')
    await page.evaluate(async () => {
      const modulePath = '/src/api/axios.ts'
      const { setAccessToken } = await import(modulePath)
      setAccessToken('new-token')
    })
  } finally { release() }
  expect(await resultPromise).toEqual({ token: 'new-token', expired: 0 })
})

for (const endpoint of ['/auth/login', '/auth/register']) {
  test(`${endpoint} 401 rejects without expiring the existing token`, async ({ page, mockApi }) => {
    mockApi.handle(`POST ${endpoint}`, async (route) => {
      await route.fulfill({ status: 401, json: { message: 'Email or password is incorrect' } })
    })
    const result = await page.evaluate(async (path) => {
      const modulePath = '/src/api/axios.ts'
      const { api, getAccessToken, setAccessToken, SESSION_EXPIRED_EVENT } = await import(modulePath)
      let expired = 0
      window.addEventListener(SESSION_EXPIRED_EVENT, () => { expired += 1 })
      setAccessToken('existing-token')
      const status = await api.post(path, { email: 'mock@example.com', password: 'mock-password' })
        .catch((error: { response?: { status: number } }) => error.response?.status)
      return { token: getAccessToken(), expired, status }
    }, endpoint)
    expect(result).toEqual({ token: 'existing-token', expired: 0, status: 401 })
    expect(mockApi.calls).toHaveLength(1)
    expect(mockApi.calls[0].headers().authorization).toBe('Bearer existing-token')
  })
}

test('concurrent protected 401 responses expire a session only once', async ({ page, mockApi }) => {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  mockApi.handle('GET /client-protected', async (route) => {
    await pending
    await route.fulfill({ status: 401, json: { message: 'Invalid or expired token' } })
  })
  const resultPromise = page.evaluate(async () => {
    const modulePath = '/src/api/axios.ts'
    const { api, getAccessToken, setAccessToken, SESSION_EXPIRED_EVENT } = await import(modulePath)
    let expired = 0
    window.addEventListener(SESSION_EXPIRED_EVENT, () => { expired += 1 })
    setAccessToken('expiring-token')
    const responses = await Promise.allSettled([api.get('/client-protected'), api.get('/client-protected')])
    return { token: getAccessToken(), expired, outcomes: responses.map((response) => response.status) }
  })
  try {
    await expect.poll(() => mockApi.calls.length).toBe(2)
    expect(mockApi.calls.every((request) => request.headers().authorization === 'Bearer expiring-token')).toBe(true)
  } finally { release() }
  expect(await resultPromise).toEqual({ token: null, expired: 1, outcomes: ['rejected', 'rejected'] })
})
