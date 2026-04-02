import { test, expect, describe } from 'bun:test'
import { buildItemData } from '../../src/server/scanner.ts'

const HOME_WORLD_ID = 4030

describe('buildItemData', () => {
  const baseDcListings = [
    { pricePerUnit: 1000, quantity: 5, worldID: HOME_WORLD_ID, worldName: '利維坦', lastReviewTime: 100, hq: false },
  ]
  const baseWorldUploadTimes = { [HOME_WORLD_ID]: 5000 }
  const baseHomeResult = {
    regularSaleVelocity: 10,
    hqSaleVelocity: 3,
    recentHistory: [{ pricePerUnit: 900, quantity: 1, timestamp: 100, hq: false }],
    lastUploadTime: 8000,
  }

  test('uses Phase 2 lastUploadTime as homeLastUploadTime when available', () => {
    const result = buildItemData(42, baseDcListings, baseWorldUploadTimes, baseHomeResult)

    expect(result.homeLastUploadTime).toBe(8000)
  })

  test('falls back to worldUploadTimes for home world when Phase 2 lastUploadTime is 0', () => {
    const result = buildItemData(42, baseDcListings, baseWorldUploadTimes, {
      ...baseHomeResult,
      lastUploadTime: 0,
    })

    expect(result.homeLastUploadTime).toBe(5000)
  })

  test('homeLastUploadTime is 0 when both sources are missing', () => {
    const result = buildItemData(42, baseDcListings, {}, {
      ...baseHomeResult,
      lastUploadTime: 0,
    })

    expect(result.homeLastUploadTime).toBe(0)
  })

  test('passes through all fields from inputs', () => {
    const result = buildItemData(42, baseDcListings, baseWorldUploadTimes, baseHomeResult)

    expect(result.itemID).toBe(42)
    expect(result.listings).toBe(baseDcListings)
    expect(result.worldUploadTimes).toBe(baseWorldUploadTimes)
    expect(result.regularSaleVelocity).toBe(10)
    expect(result.hqSaleVelocity).toBe(3)
    expect(result.recentHistory).toBe(baseHomeResult.recentHistory)
  })
})
