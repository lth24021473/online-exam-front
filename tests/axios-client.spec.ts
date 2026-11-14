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

test('silent refresh transparently retries concurrent 401 requests once and updates tokens', async ({ page, mockApi }) => {
  let releaseRefresh: () => void = () => {}
  const pendingRefresh = new Promise<void>((resolve) => { releaseRefresh = resolve })

  mockApi.handle('GET /client-protected', async (route) => {
    const auth = route.request().headers().authorization
    if (auth === 'Bearer fresh-access-token') {
      await route.fulfill({ json: { ok: true, token: auth } })
      return
    }
    await route.fulfill({ status: 401, json: { message: 'Invalid or expired token' } })
  })
  mockApi.handle('POST /auth/refresh', async (route) => {
    await pendingRefresh
    await route.fulfill({
      json: { accessToken: 'fresh-access-token', refreshToken: 'fresh-refresh-token' },
    })
  })

  const resultPromise = page.evaluate(async () => {
    const modulePath = '/src/api/axios.ts'
    const {
      api, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken,
      SESSION_EXPIRED_EVENT, TOKEN_REFRESHED_EVENT,
    } = await import(modulePath)
    let expired = 0
    let refreshed = 0
    window.addEventListener(SESSION_EXPIRED_EVENT, () => { expired += 1 })
    window.addEventListener(TOKEN_REFRESHED_EVENT, () => { refreshed += 1 })
    setAccessToken('expired-access-token')
    setRefreshToken('valid-refresh-token')
    const [a, b, c] = await Promise.all([
      api.get('/client-protected'),
      api.get('/client-protected'),
      api.get('/client-protected'),
    ])
    return {
      data: [a.data, b.data, c.data],
      accessToken: getAccessToken(),
      refreshToken: getRefreshToken(),
      expired,
      refreshed,
    }
  })

  try {
    await expect.poll(() => mockApi.calls.filter((req) => new URL(req.url()).pathname.endsWith('/auth/refresh')).length).toBe(1)
  } finally {
    releaseRefresh()
  }

  const result = await resultPromise
  expect(result).toEqual({
    data: [
      { ok: true, token: 'Bearer fresh-access-token' },
      { ok: true, token: 'Bearer fresh-access-token' },
      { ok: true, token: 'Bearer fresh-access-token' },
    ],
    accessToken: 'fresh-access-token',
    refreshToken: 'fresh-refresh-token',
    expired: 0,
    refreshed: 1,
  })
  const refreshCalls = mockApi.calls.filter((req) => new URL(req.url()).pathname.endsWith('/auth/refresh'))
  expect(refreshCalls).toHaveLength(1)
  expect(refreshCalls[0].postDataJSON()).toEqual({ refreshToken: 'valid-refresh-token' })
  expect(refreshCalls[0].headers().authorization).toBeUndefined()
})

test('a late 401 for an already-refreshed token retries without calling /auth/refresh again', async ({ page, mockApi }) => {
  let releaseLate: () => void = () => {}
  const pendingLate = new Promise<void>((resolve) => { releaseLate = resolve })

  mockApi.handle('GET /client-fast', async (route) => {
    const auth = route.request().headers().authorization
    if (auth === 'Bearer fresh-access-token') {
      await route.fulfill({ json: { ok: 'fast' } })
      return
    }
    await route.fulfill({ status: 401, json: { message: 'Invalid or expired token' } })
  })
  mockApi.handle('GET /client-slow', async (route) => {
    const auth = route.request().headers().authorization
    if (auth === 'Bearer fresh-access-token') {
      await route.fulfill({ json: { ok: 'slow' } })
      return
    }
    await pendingLate
    await route.fulfill({ status: 401, json: { message: 'Invalid or expired token' } })
  })
  mockApi.handle('POST /auth/refresh', async (route) => {
    await route.fulfill({ json: { accessToken: 'fresh-access-token', refreshToken: 'fresh-refresh-token' } })
  })

  const resultPromise = page.evaluate(async () => {
    const modulePath = '/src/api/axios.ts'
    const { api, setAccessToken, setRefreshToken } = await import(modulePath)
    setAccessToken('expired-access-token')
    setRefreshToken('valid-refresh-token')
    const slowPromise = api.get('/client-slow')
    const fastResponse = await api.get('/client-fast')
    window.dispatchEvent(new CustomEvent('test:fast-done'))
    const slowResponse = await slowPromise
    return { fast: fastResponse.data, slow: slowResponse.data }
  })

  try {
    await expect.poll(() => mockApi.calls.filter((req) => new URL(req.url()).pathname.endsWith('/auth/refresh')).length).toBe(1)
    await expect.poll(() => mockApi.calls.filter((req) => new URL(req.url()).pathname.endsWith('/client-fast')).length).toBe(2)
  } finally {
    releaseLate()
  }

  expect(await resultPromise).toEqual({ fast: { ok: 'fast' }, slow: { ok: 'slow' } })
  expect(mockApi.calls.filter((req) => new URL(req.url()).pathname.endsWith('/auth/refresh'))).toHaveLength(1)
})

test('failed refresh (401) expires session once, clears both tokens, and translates the error', async ({ page, mockApi }) => {
  mockApi.handle('GET /client-protected', async (route) => {
    await route.fulfill({ status: 401, json: { message: 'Invalid or expired token' } })
  })
  mockApi.handle('POST /auth/refresh', async (route) => {
    await route.fulfill({ status: 401, json: { message: 'Invalid or expired refresh token' } })
  })

  const result = await page.evaluate(async () => {
    const modulePath = '/src/api/axios.ts'
    const { api, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, SESSION_EXPIRED_EVENT } = await import(modulePath)
    const messages: string[] = []
    window.addEventListener(SESSION_EXPIRED_EVENT, (event) => {
      messages.push((event as CustomEvent<{ message?: string }>).detail?.message ?? '')
    })
    setAccessToken('expired-access-token')
    setRefreshToken('expired-refresh-token')
    const outcomes = await Promise.allSettled([api.get('/client-protected'), api.get('/client-protected')])
    return {
      accessToken: getAccessToken(),
      refreshToken: getRefreshToken(),
      messages,
      outcomes: outcomes.map((item) => item.status),
    }
  })

  expect(result).toEqual({
    accessToken: null,
    refreshToken: null,
    messages: ['Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'],
    outcomes: ['rejected', 'rejected'],
  })
  expect(mockApi.calls.filter((req) => new URL(req.url()).pathname.endsWith('/auth/refresh'))).toHaveLength(1)
})

test('network error during refresh keeps tokens intact without expiring session', async ({ page, mockApi }) => {
  mockApi.handle('GET /client-protected', async (route) => {
    await route.fulfill({ status: 401, json: { message: 'Invalid or expired token' } })
  })
  mockApi.handle('POST /auth/refresh', async (route) => {
    await route.abort('connectionfailed')
  })

  const result = await page.evaluate(async () => {
    const modulePath = '/src/api/axios.ts'
    const { api, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, SESSION_EXPIRED_EVENT } = await import(modulePath)
    let expired = 0
    window.addEventListener(SESSION_EXPIRED_EVENT, () => { expired += 1 })
    setAccessToken('expired-access-token')
    setRefreshToken('valid-refresh-token')
    const status = await api.get('/client-protected').then(() => 'resolved', () => 'rejected')
    return {
      status,
      expired,
      accessToken: getAccessToken(),
      refreshToken: getRefreshToken(),
    }
  })

  expect(result).toEqual({
    status: 'rejected',
    expired: 0,
    accessToken: 'expired-access-token',
    refreshToken: 'valid-refresh-token',
  })
})

test('retried request still returning 401 stops without looping /auth/refresh', async ({ page, mockApi }) => {
  mockApi.handle('GET /client-protected', async (route) => {
    await route.fulfill({ status: 401, json: { message: 'Token has been revoked' } })
  })
  mockApi.handle('POST /auth/refresh', async (route) => {
    await route.fulfill({ json: { accessToken: 'fresh-access-token', refreshToken: 'fresh-refresh-token' } })
  })

  const result = await page.evaluate(async () => {
    const modulePath = '/src/api/axios.ts'
    const { api, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, SESSION_EXPIRED_EVENT } = await import(modulePath)
    let expired = 0
    window.addEventListener(SESSION_EXPIRED_EVENT, () => { expired += 1 })
    setAccessToken('expired-access-token')
    setRefreshToken('valid-refresh-token')
    const status = await api.get('/client-protected').catch((err: { response?: { status: number } }) => err.response?.status)
    return {
      status,
      expired,
      accessToken: getAccessToken(),
      refreshToken: getRefreshToken(),
    }
  })

  expect(result).toEqual({
    status: 401,
    expired: 1,
    accessToken: null,
    refreshToken: null,
  })
  expect(mockApi.calls.filter((req) => new URL(req.url()).pathname.endsWith('/auth/refresh'))).toHaveLength(1)
  expect(mockApi.calls.filter((req) => new URL(req.url()).pathname.endsWith('/client-protected'))).toHaveLength(2)
})

test('401 on /auth/logout does not trigger /auth/refresh', async ({ page, mockApi }) => {
  mockApi.handle('POST /auth/logout', async (route) => {
    await route.fulfill({ status: 401, json: { message: 'Invalid or expired token' } })
  })

  const result = await page.evaluate(async () => {
    const modulePath = '/src/api/axios.ts'
    const { api, setAccessToken, setRefreshToken, SESSION_EXPIRED_EVENT } = await import(modulePath)
    let expired = 0
    window.addEventListener(SESSION_EXPIRED_EVENT, () => { expired += 1 })
    setAccessToken('expired-access-token')
    setRefreshToken('valid-refresh-token')
    const status = await api.post('/auth/logout').catch((err: { response?: { status: number } }) => err.response?.status)
    return { status, expired }
  })

  expect(result).toEqual({ status: 401, expired: 0 })
  expect(mockApi.calls).toHaveLength(1)
})

test('429 Too Many Requests translates to Vietnamese rate limit notice', async ({ page, mockApi }) => {
  mockApi.handle('GET /client-throttled', async (route) => {
    await route.fulfill({
      status: 429,
      json: { statusCode: 429, message: 'ThrottlerException: Too Many Requests' },
    })
  })

  const message = await page.evaluate(async () => {
    const modulePath = '/src/api/axios.ts'
    const { api, getApiErrorMessage } = await import(modulePath)
    try {
      await api.get('/client-throttled')
      return null
    } catch (err: unknown) {
      return getApiErrorMessage(err)
    }
  })

  expect(message).toBe('Bạn đang thao tác quá nhanh, vui lòng thử lại sau vài giây!')
})
