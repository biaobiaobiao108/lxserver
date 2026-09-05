import { describe, it, expect, beforeEach } from 'bun:test'

// Initialize global.lx before importing modules that depend on it at top-level
(global as any).lx = {
  dataPath: 'd:\\test_data',
  config: {
    'frontend.password': 'secure123',
    'user.enablePath': false,
  },
}

const { verifyAdminAuth } = await import('../src/server/auth')

describe('Admin Authentication Security (verifyAdminAuth)', () => {
  beforeEach(() => {
    (global as any).lx.config['frontend.password'] = 'secure123'
  })

  it('should allow access when valid x-frontend-auth header matches', () => {
    const mockReq = {
      headers: { 'x-frontend-auth': 'secure123' },
    } as any

    expect(verifyAdminAuth(mockReq)).toBe(true)
  })

  it('should deny access when header is missing', () => {
    const mockReq = {
      headers: {},
    } as any

    expect(verifyAdminAuth(mockReq)).toBe(false)
  })

  it('should deny access when password is wrong', () => {
    const mockReq = {
      headers: { 'x-frontend-auth': 'wrong_password' },
    } as any

    expect(verifyAdminAuth(mockReq)).toBe(false)
  })

  it('should deny access when configured password is empty or not set (prevents empty bypass)', () => {
    (global as any).lx.config['frontend.password'] = ''
    const mockReq1 = {
      headers: { 'x-frontend-auth': '' },
    } as any
    expect(verifyAdminAuth(mockReq1)).toBe(false)

    delete (global as any).lx.config['frontend.password']
    const mockReq2 = {
      headers: {},
    } as any
    expect(verifyAdminAuth(mockReq2)).toBe(false)
  })

  it('should allow query auth only when explicitly enabled', () => {
    const urlWithAuth = new URL('http://localhost:9527/api/admin?auth=secure123')
    const mockReq = {
      headers: {},
    } as any

    // Disallowed by default
    expect(verifyAdminAuth(mockReq, false, urlWithAuth)).toBe(false)

    // Allowed when flag is true
    expect(verifyAdminAuth(mockReq, true, urlWithAuth)).toBe(true)
  })
})
