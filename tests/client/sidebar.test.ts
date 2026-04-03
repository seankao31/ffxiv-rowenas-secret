import { test, expect, describe, beforeEach } from 'bun:test'
import { loadSidebarExpanded, saveSidebarExpanded } from '../../src/client/lib/sidebar.ts'

let storage: Record<string, string> = {}

beforeEach(() => {
  storage = {}
  globalThis.localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value },
    removeItem: (key: string) => { delete storage[key] },
    clear: () => { storage = {} },
    get length() { return Object.keys(storage).length },
    key: (index: number) => Object.keys(storage)[index] ?? null,
  } as Storage
})

describe('sidebar state', () => {
  test('returns true (expanded) by default for new visitors', () => {
    expect(loadSidebarExpanded()).toBe(true)
  })

  test('returns true when localStorage has "true"', () => {
    storage['sidebar-expanded'] = 'true'
    expect(loadSidebarExpanded()).toBe(true)
  })

  test('returns false when localStorage has "false"', () => {
    storage['sidebar-expanded'] = 'false'
    expect(loadSidebarExpanded()).toBe(false)
  })

  test('saves true to localStorage', () => {
    saveSidebarExpanded(true)
    expect(storage['sidebar-expanded']).toBe('true')
  })

  test('saves false to localStorage', () => {
    saveSidebarExpanded(false)
    expect(storage['sidebar-expanded']).toBe('false')
  })

  test('round-trips correctly', () => {
    saveSidebarExpanded(false)
    expect(loadSidebarExpanded()).toBe(false)
    saveSidebarExpanded(true)
    expect(loadSidebarExpanded()).toBe(true)
  })
})
