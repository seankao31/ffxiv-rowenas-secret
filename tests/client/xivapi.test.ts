import { test, expect, describe, beforeEach } from 'bun:test'
import { buildIconUrl, resolveItemName, getIconUrl, _seedCache, _clearCache } from '../../src/client/lib/xivapi.ts'

beforeEach(() => {
  _clearCache()
})

describe('buildIconUrl', () => {
  test('constructs asset URL from icon path', () => {
    expect(buildIconUrl('ui/icon/020000/020801.tex'))
      .toBe('https://v2.xivapi.com/api/asset?path=ui/icon/020000/020801.tex&format=webp')
  })
})

describe('resolveItemName', () => {
  test('returns server name when it is a real name', () => {
    expect(resolveItemName(5057, '鐵塊')).toBe('鐵塊')
  })

  test('returns server name for fallback pattern when no cached name exists', () => {
    expect(resolveItemName(99999, 'Item #99999')).toBe('Item #99999')
  })

  test('returns cached English name for fallback-pattern items', () => {
    _seedCache(12345, { name: 'Mythril Ingot' })
    expect(resolveItemName(12345, 'Item #12345')).toBe('Mythril Ingot')
  })
})

describe('getIconUrl', () => {
  test('returns undefined for uncached item', () => {
    expect(getIconUrl(99998)).toBeUndefined()
  })

  test('returns constructed URL for cached item with icon path', () => {
    _seedCache(5057, { iconPath: 'ui/icon/020000/020801.tex' })
    expect(getIconUrl(5057)).toBe('https://v2.xivapi.com/api/asset?path=ui/icon/020000/020801.tex&format=webp')
  })

  test('returns undefined for cached item without icon path', () => {
    _seedCache(5058, { name: 'Iron Ingot' })
    expect(getIconUrl(5058)).toBeUndefined()
  })
})
