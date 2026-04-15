import { test, expect, describe } from 'vitest'
import { parseThresholds } from '$lib/server/thresholds'

describe('parseThresholds', () => {
  test('returns defaults when no query params provided', () => {
    const result = parseThresholds({})
    expect(result).toEqual({
      price_threshold: 2.0,
      days_of_supply: 3,
      limit: 50,
      hq: false,
    })
  })

  test('parses valid string params into numbers', () => {
    const result = parseThresholds({
      price_threshold: '3.5',
      days_of_supply: '7',
      limit: '100',
      hq: 'true',
    })
    expect(result).toEqual({
      price_threshold: 3.5,
      days_of_supply: 7,
      limit: 100,
      hq: true,
    })
  })

  test('rejects price_threshold outside 1.0–10.0', () => {
    expect(parseThresholds({ price_threshold: '0.5' }))
      .toEqual({ error: 'price_threshold must be between 1.0 and 10.0' })
    expect(parseThresholds({ price_threshold: '11' }))
      .toEqual({ error: 'price_threshold must be between 1.0 and 10.0' })
  })

  test('rejects non-numeric price_threshold', () => {
    expect(parseThresholds({ price_threshold: 'abc' }))
      .toEqual({ error: 'price_threshold must be between 1.0 and 10.0' })
  })

  test('rejects days_of_supply outside 1–30', () => {
    expect(parseThresholds({ days_of_supply: '0' }))
      .toEqual({ error: 'days_of_supply must be between 1 and 30' })
    expect(parseThresholds({ days_of_supply: '31' }))
      .toEqual({ error: 'days_of_supply must be between 1 and 30' })
  })

  test('rejects limit outside 1–200', () => {
    expect(parseThresholds({ limit: '0' }))
      .toEqual({ error: 'limit must be between 1 and 200' })
    expect(parseThresholds({ limit: '201' }))
      .toEqual({ error: 'limit must be between 1 and 200' })
  })

  test('hq is true only for exact string "true"', () => {
    expect((parseThresholds({ hq: 'true' }) as any).hq).toBe(true)
    expect((parseThresholds({ hq: 'false' }) as any).hq).toBe(false)
    expect((parseThresholds({ hq: '1' }) as any).hq).toBe(false)
    expect((parseThresholds({}) as any).hq).toBe(false)
  })

  test('accepts boundary values', () => {
    const result = parseThresholds({
      price_threshold: '1.0',
      days_of_supply: '30',
      limit: '200',
    })
    expect('error' in result).toBe(false)
  })
})
