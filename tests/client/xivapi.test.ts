import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test'
import { buildIconUrl, resolveItemName, getIconUrl, _seedCache, _clearCache, fetchItemMetadata, setOnChange } from '../../src/client/lib/xivapi.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  setOnChange(null)
})

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

describe('fetchItemMetadata', () => {
  test('fetches metadata for uncached items and populates cache', async () => {
    const mockFetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        rows: [
          {
            row_id: 5057,
            fields: {
              Name: 'Iron Ingot',
              Icon: { id: 20801, path: 'ui/icon/020000/020801.tex', path_hr1: 'ui/icon/020000/020801_hr1.tex' },
            },
          },
        ],
      }),
    }))
    globalThis.fetch = mockFetch as unknown as typeof fetch

    await fetchItemMetadata([5057])

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0]![0] as string
    expect(url).toContain('rows=5057')
    expect(url).toContain('fields=Icon,Name')
    expect(getIconUrl(5057)).toBe(buildIconUrl('ui/icon/020000/020801.tex'))
    expect(resolveItemName(5057, 'Item #5057')).toBe('Iron Ingot')
  })

  test('skips already-cached items', async () => {
    _seedCache(5057, { name: 'Iron Ingot', iconPath: 'ui/icon/020000/020801.tex' })
    const mockFetch = mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [] }) }))
    globalThis.fetch = mockFetch as unknown as typeof fetch

    await fetchItemMetadata([5057])

    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('fetches only uncached items from a mixed set', async () => {
    _seedCache(5057, { name: 'Iron Ingot', iconPath: 'ui/icon/020000/020801.tex' })
    const mockFetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        rows: [{
          row_id: 4718,
          fields: {
            Name: 'Mythrite Ore',
            Icon: { id: 24101, path: 'ui/icon/024000/024101.tex', path_hr1: 'ui/icon/024000/024101_hr1.tex' },
          },
        }],
      }),
    }))
    globalThis.fetch = mockFetch as unknown as typeof fetch

    await fetchItemMetadata([5057, 4718])

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = mockFetch.mock.calls[0]![0] as string
    expect(url).toContain('rows=4718')
    expect(url).not.toContain('5057')
  })

  test('does nothing when all items are cached', async () => {
    _seedCache(5057, { iconPath: 'ui/icon/020000/020801.tex' })
    _seedCache(4718, { iconPath: 'ui/icon/024000/024101.tex' })
    const mockFetch = mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [] }) }))
    globalThis.fetch = mockFetch as unknown as typeof fetch

    await fetchItemMetadata([5057, 4718])

    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('logs warning and does not throw on fetch failure', async () => {
    globalThis.fetch = mock(() => Promise.resolve({ ok: false, status: 500 })) as unknown as typeof fetch

    await expect(fetchItemMetadata([5057])).resolves.toBeUndefined()
    expect(getIconUrl(5057)).toBeUndefined()
  })

  test('invokes onChange callback after successful fetch', async () => {
    const onChangeSpy = mock(() => {})
    setOnChange(onChangeSpy)
    globalThis.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        rows: [{
          row_id: 5057,
          fields: {
            Name: 'Iron Ingot',
            Icon: { id: 20801, path: 'ui/icon/020000/020801.tex', path_hr1: 'ui/icon/020000/020801_hr1.tex' },
          },
        }],
      }),
    })) as unknown as typeof fetch

    await fetchItemMetadata([5057])

    expect(onChangeSpy).toHaveBeenCalledTimes(1)
  })

  test('handles rows with missing Icon or Name fields gracefully', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        rows: [
          { row_id: 1, fields: { Name: 'Good Item', Icon: { id: 1, path: 'a.tex', path_hr1: 'a_hr1.tex' } } },
          { row_id: 2, fields: { Name: 'Bad Item' } },  // missing Icon
          { row_id: 3, fields: { Icon: { id: 3, path: 'c.tex', path_hr1: 'c_hr1.tex' } } },  // missing Name
        ],
      }),
    })) as unknown as typeof fetch

    await fetchItemMetadata([1, 2, 3])

    expect(getIconUrl(1)).toBe(buildIconUrl('a.tex'))
    // Row 2: cached but no icon
    expect(getIconUrl(2)).toBeUndefined()
    // Row 3: cached with icon but no name
    expect(getIconUrl(3)).toBe(buildIconUrl('c.tex'))
    expect(resolveItemName(3, 'Item #3')).toBe('Item #3')
  })
})
