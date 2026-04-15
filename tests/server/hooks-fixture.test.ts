import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest'

describe('hooks.server init() fixture mode', () => {
  const originalEnv = process.env['FIXTURE_DATA']

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['FIXTURE_DATA']
    } else {
      process.env['FIXTURE_DATA'] = originalEnv
    }
    vi.restoreAllMocks()
  })

  test('FIXTURE_DATA=true calls seedFixtureData instead of startScanner', async () => {
    process.env['FIXTURE_DATA'] = 'true'

    const seedMock = vi.fn()
    const scannerMock = vi.fn().mockResolvedValue(undefined)

    vi.doMock('$lib/server/fixtures/seed', () => ({ seedFixtureData: seedMock }))
    vi.doMock('$lib/server/scanner', () => ({ startScanner: scannerMock }))
    vi.doMock('$lib/server/recipes', () => ({ initRecipes: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('$lib/server/vendors', () => ({ fetchVendorPrices: vi.fn().mockResolvedValue(new Map()), fetchVendorSellPrices: vi.fn().mockResolvedValue(new Map()) }))
    vi.doMock('$lib/server/cache', () => ({ setVendorPrices: vi.fn(), setVendorSellPrices: vi.fn(), settleVendorPrices: vi.fn(), settleVendorSellPrices: vi.fn() }))

    const { init } = await import('../../src/hooks.server')
    await init()

    expect(seedMock).toHaveBeenCalledOnce()
    expect(scannerMock).not.toHaveBeenCalled()
  })

  test('without FIXTURE_DATA, calls startScanner normally', async () => {
    delete process.env['FIXTURE_DATA']

    const seedMock = vi.fn()
    const scannerMock = vi.fn().mockReturnValue(new Promise(() => {}))

    vi.doMock('$lib/server/fixtures/seed', () => ({ seedFixtureData: seedMock }))
    vi.doMock('$lib/server/scanner', () => ({ startScanner: scannerMock }))
    vi.doMock('$lib/server/recipes', () => ({ initRecipes: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('$lib/server/vendors', () => ({ fetchVendorPrices: vi.fn().mockResolvedValue(new Map()), fetchVendorSellPrices: vi.fn().mockResolvedValue(new Map()) }))
    vi.doMock('$lib/server/cache', () => ({ setVendorPrices: vi.fn(), setVendorSellPrices: vi.fn(), settleVendorPrices: vi.fn(), settleVendorSellPrices: vi.fn() }))

    const { init } = await import('../../src/hooks.server')
    await init()

    expect(scannerMock).toHaveBeenCalledOnce()
    expect(seedMock).not.toHaveBeenCalled()
  })
})
