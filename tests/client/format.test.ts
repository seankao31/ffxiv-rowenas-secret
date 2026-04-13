import { test, expect, describe, vi, afterEach } from 'vitest'
import { formatNumber, formatRelativeTime } from '$lib/client/format'

describe('formatNumber', () => {
  test('formats number with locale separators', () => {
    const result = formatNumber(1234567)
    expect(typeof result).toBe('string')
    expect(result).toContain('1')
  })

  test('formats zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('shows seconds for < 60s', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(100_000))
    expect(formatRelativeTime(70_000)).toBe('30s ago')
  })

  test('shows minutes for < 60m', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(3_640_000))
    expect(formatRelativeTime(100_000)).toBe('59m ago')
  })

  test('shows hours for < 24h', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(7_300_000))
    expect(formatRelativeTime(100_000)).toBe('2h ago')
  })

  test('shows days for >= 24h', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(180_000_000))
    expect(formatRelativeTime(100_000)).toBe('2d ago')
  })
})
