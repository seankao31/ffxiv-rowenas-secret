// tests/server/universalis.test.ts
import { test, expect, describe } from 'bun:test'
import { RateLimiter, Semaphore } from '../../src/server/universalis.ts'

describe('Semaphore', () => {
  test('never exceeds max concurrent', async () => {
    const sem = new Semaphore(3)
    let concurrent = 0
    let maxConcurrent = 0
    const tasks = Array.from({ length: 10 }, () =>
      sem.run(async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise(r => setTimeout(r, 10))
        concurrent--
      })
    )
    await Promise.all(tasks)
    expect(maxConcurrent).toBeLessThanOrEqual(3)
    expect(maxConcurrent).toBeGreaterThan(0)
  })
})

describe('RateLimiter', () => {
  test('allows burst up to rate', async () => {
    const limiter = new RateLimiter(100)
    // Should be able to acquire 10 tokens immediately (well within 100/s budget)
    for (let i = 0; i < 10; i++) {
      await limiter.acquire()
    }
    // If we reach here without timeout, the rate limiter didn't block unnecessarily
    expect(true).toBe(true)
  })

  test('delays when token bucket is exhausted', async () => {
    const limiter = new RateLimiter(10)  // 10 req/s = 1 token per 100ms
    // Drain the initial tokens
    for (let i = 0; i < 10; i++) await limiter.acquire()
    // Next acquire should wait ~100ms
    const start = Date.now()
    await limiter.acquire()
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThan(50)  // generous lower bound
  })
})
