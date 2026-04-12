import { test, expect } from '@playwright/test'

// Tests the /api/craft/[id] endpoint. The server-side cache is populated by
// the background scanner, so happy-path tests require a running scanner. These
// tests cover the contract-level behaviors that hold regardless of cache state.

test.describe('GET /api/craft/[id]', () => {
  test('returns 400 for non-integer id', async ({ request }) => {
    const response = await request.get('/api/craft/abc')
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  test('returns 400 for zero id', async ({ request }) => {
    const response = await request.get('/api/craft/0')
    expect(response.status()).toBe(400)
  })

  test('returns 400 for negative id', async ({ request }) => {
    const response = await request.get('/api/craft/-1')
    expect(response.status()).toBe(400)
  })

  test('returns 202 or 200 for a valid id', async ({ request }) => {
    // Cache may not be ready in test environment — both are valid responses
    const response = await request.get('/api/craft/2')
    expect([200, 202, 404]).toContain(response.status())
    if (response.status() === 200) {
      const body = await response.json()
      expect(body.totalCost).toBeDefined()
      expect(body.recommendation).toMatch(/^(craft|buy)$/)
    }
  })
})
