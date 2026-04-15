import { test, expect, describe, afterEach } from 'vitest'
import {
  setVendorPrices,
  setVendorSellPrices,
  waitForVendorPrices,
  waitForVendorSellPrices,
  settleVendorPrices,
  settleVendorSellPrices,
  _resetVendorPriceState,
} from '$lib/server/cache'

afterEach(() => {
  _resetVendorPriceState()
})

describe('waitForVendorPrices', () => {
  test('resolves immediately when prices already set', async () => {
    setVendorPrices(new Map([[1, 100]]))
    await waitForVendorPrices()
  })

  test('blocks until setVendorPrices is called', async () => {
    let resolved = false
    const promise = waitForVendorPrices().then(() => { resolved = true })

    await Promise.resolve()
    expect(resolved).toBe(false)

    setVendorPrices(new Map([[1, 100]]))
    await promise
    expect(resolved).toBe(true)
  })

  test('resolves on settleVendorPrices (error path)', async () => {
    let resolved = false
    const promise = waitForVendorPrices().then(() => { resolved = true })

    await Promise.resolve()
    expect(resolved).toBe(false)

    settleVendorPrices()
    await promise
    expect(resolved).toBe(true)
  })

  test('multiple waiters all resolve', async () => {
    const results: boolean[] = [false, false]
    const p1 = waitForVendorPrices().then(() => { results[0] = true })
    const p2 = waitForVendorPrices().then(() => { results[1] = true })

    await Promise.resolve()
    expect(results).toEqual([false, false])

    setVendorPrices(new Map([[1, 100]]))
    await Promise.all([p1, p2])
    expect(results).toEqual([true, true])
  })
})

describe('waitForVendorSellPrices', () => {
  test('resolves immediately when prices already set', async () => {
    setVendorSellPrices(new Map([[1, 50]]))
    await waitForVendorSellPrices()
  })

  test('blocks until setVendorSellPrices is called', async () => {
    let resolved = false
    const promise = waitForVendorSellPrices().then(() => { resolved = true })

    await Promise.resolve()
    expect(resolved).toBe(false)

    setVendorSellPrices(new Map([[1, 50]]))
    await promise
    expect(resolved).toBe(true)
  })

  test('resolves on settleVendorSellPrices (error path)', async () => {
    let resolved = false
    const promise = waitForVendorSellPrices().then(() => { resolved = true })

    await Promise.resolve()
    expect(resolved).toBe(false)

    settleVendorSellPrices()
    await promise
    expect(resolved).toBe(true)
  })
})
