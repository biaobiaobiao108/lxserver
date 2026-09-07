import { describe, test, expect, beforeEach } from 'bun:test'

// Initialize global.lx before importing modules that depend on it
;(global as any).lx = {
  dataPath: 'd:\\test_data',
  userPath: 'd:\\test_users',
  config: {
    'frontend.password': 'admin123',
    'player.password': 'player456',
    users: [{ name: 'test_user', password: 'password123' }],
  },
}

const { createAuthRouter, userSessions } = await import('@/server/routes/auth')
const { PLAYER_SESSION_TTL } = await import('@/server/auth')

describe('Auth & Token Routes (routes/auth.ts)', () => {
  beforeEach(() => {
    const lxGlobal = (global as any).lx;
    lxGlobal.config['frontend.password'] = 'admin123';
    lxGlobal.config['player.password'] = 'player456';
  })

  test('POST /api/admin/verify returns 200 on valid password and 401 on wrong', async () => {
    const router = createAuthRouter()

    // Valid
    const req1 = new Request('http://localhost:9527/api/admin/verify', {
      method: 'POST',
      headers: { 'x-frontend-auth': 'admin123' },
    })
    const res1 = await router.handle(req1)
    expect(res1.status).toBe(200)
    expect(await res1.json()).toEqual({ success: true })

    // Invalid
    const req2 = new Request('http://localhost:9527/api/admin/verify', {
      method: 'POST',
      headers: { 'x-frontend-auth': 'wrong_pass' },
    })
    const res2 = await router.handle(req2)
    expect(res2.status).toBe(401)
  })

  test('POST /api/music/auth sets HttpOnly session cookie on success', async () => {
    const router = createAuthRouter()

    const req = new Request('http://localhost:9527/api/music/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'player456' }),
    })
    const res = await router.handle(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toContain('lx_player_session=')
    expect(res.headers.get('Set-Cookie')).toContain('HttpOnly')
    expect(res.headers.get('Set-Cookie')).toContain(`Max-Age=${PLAYER_SESSION_TTL / 1000}`)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test('user session cookie remains valid after in-memory session cache loss', async () => {
    const router = createAuthRouter()

    const loginRes = await router.handle(new Request('http://localhost:9527/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_user', password: 'password123' }),
    }))
    expect(loginRes.status).toBe(200)

    const setCookie = loginRes.headers.get('Set-Cookie')
    expect(setCookie).toContain('lx_user_session=')
    const cookie = setCookie!.split(';', 1)[0]
    const token = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
    userSessions.delete(token)

    const verifyRes = await router.handle(new Request('http://localhost:9527/api/user/auth/verify', {
      headers: { Cookie: cookie },
    }))
    expect(await verifyRes.json()).toEqual({ valid: true, username: 'test_user' })

    const logoutRes = await router.handle(new Request('http://localhost:9527/api/user/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
    }))
    expect(logoutRes.headers.get('Set-Cookie')).toContain('Max-Age=0')

    const afterLogoutRes = await router.handle(new Request('http://localhost:9527/api/user/auth/verify', {
      headers: { Cookie: cookie },
    }))
    expect(await afterLogoutRes.json()).toEqual({ valid: false, username: null })
  })

  test('GET /api/user/auth/verify checks token validity', async () => {
    const router = createAuthRouter()

    // Mock active session
    userSessions.set('mock_token_123', {
      username: 'test_user',
      createdAt: Date.now(),
    })

    const req1 = new Request('http://localhost:9527/api/user/auth/verify', {
      headers: { 'x-user-token': 'mock_token_123' },
    })
    const res1 = await router.handle(req1)
    expect(res1.status).toBe(200)
    expect(await res1.json()).toEqual({ valid: true, username: 'test_user' })

    const req2 = new Request('http://localhost:9527/api/user/auth/verify', {
      headers: { 'x-user-token': 'invalid_token' },
    })
    const res2 = await router.handle(req2)
    expect(res2.status).toBe(200)
    expect(await res2.json()).toEqual({ valid: false, username: null })
  })
})
