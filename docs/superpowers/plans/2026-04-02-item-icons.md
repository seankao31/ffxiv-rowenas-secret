# Item Icons via XIVAPI v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add item icons to the opportunity table and migrate XIVAPI v1 calls to v2 batched endpoint.

**Architecture:** Client-side only. A new `xivapi.ts` module replaces `item-names.ts`, batching item metadata fetches (icon paths + English fallback names) into a single XIVAPI v2 call per opportunity set. Icons render as `<img>` elements loaded directly from XIVAPI's asset endpoint.

**Tech Stack:** Svelte 5, TypeScript, XIVAPI v2 REST API, bun:test

---

### File Map

- **Create:** `src/client/lib/xivapi.ts` — unified XIVAPI v2 client (batch fetch, cache, accessors)
- **Create:** `tests/client/xivapi.test.ts` — tests for the new module
- **Modify:** `src/client/components/OpportunityTable.svelte` — swap import, add icon rendering
- **Delete:** `src/client/lib/item-names.ts` — replaced by `xivapi.ts`
- **Modify:** `docs/decisions/ADR-007-item-name-resolution.md` — addendum for v1→v2 migration

---

### Task 1: Pure utility functions, cache helpers, and their tests

**Files:**
- Create: `tests/client/xivapi.test.ts`
- Create: `src/client/lib/xivapi.ts`

URL construction, name fallback logic, cache accessors, and test helpers.

- [ ] **Step 1: Write failing tests for `buildIconUrl`, `resolveItemName`, and `getIconUrl`**

```ts
// tests/client/xivapi.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/client/xivapi.test.ts`
Expected: FAIL — module doesn't exist yet

- [ ] **Step 3: Implement the module with all pure functions and cache helpers**

```ts
// src/client/lib/xivapi.ts
// XIVAPI v2 client: batched item metadata (icons + English fallback names)

const XIVAPI_BASE = 'https://v2.xivapi.com/api'
const FALLBACK_RE = /^Item #(\d+)$/

const cache = new Map<number, { name?: string, iconPath?: string }>()

export function buildIconUrl(path: string): string {
  return `${XIVAPI_BASE}/asset?path=${path}&format=webp`
}

export function resolveItemName(itemID: number, serverName: string): string {
  if (!FALLBACK_RE.test(serverName)) return serverName
  return cache.get(itemID)?.name ?? serverName
}

export function getIconUrl(itemID: number): string | undefined {
  const entry = cache.get(itemID)
  return entry?.iconPath ? buildIconUrl(entry.iconPath) : undefined
}

/** @internal — test-only cache seeding */
export function _seedCache(itemID: number, data: { name?: string, iconPath?: string }): void {
  cache.set(itemID, data)
}

/** @internal — test-only cache reset */
export function _clearCache(): void {
  cache.clear()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/client/xivapi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/lib/xivapi.ts tests/client/xivapi.test.ts
git commit -m "feat: add xivapi v2 pure utilities and cache accessors"
```

---

### Task 2: `fetchItemMetadata` — batch fetch with cache dedup

**Files:**
- Modify: `tests/client/xivapi.test.ts`
- Modify: `src/client/lib/xivapi.ts`

Core fetch logic: batching, cache dedup, response parsing, onChange callback, and error handling. Mocks `globalThis.fetch` at the system boundary to test real cache and dedup logic.

- [ ] **Step 1: Write failing tests for `fetchItemMetadata`**

Add to `tests/client/xivapi.test.ts`:

```ts
import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test'
import { buildIconUrl, resolveItemName, getIconUrl, _seedCache, _clearCache, fetchItemMetadata, setOnChange } from '../../src/client/lib/xivapi.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
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
    setOnChange(() => {})  // clean up
  })

  test('skips rows with missing Icon or Name fields', async () => {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/client/xivapi.test.ts`
Expected: FAIL — `fetchItemMetadata` and `setOnChange` don't exist

- [ ] **Step 3: Implement `fetchItemMetadata`, `setOnChange`**

Add to `src/client/lib/xivapi.ts`:

```ts
type XivApiItemRow = {
  row_id: number
  fields: {
    Name?: string
    Icon?: { id: number, path: string, path_hr1: string }
  }
}

let onChange: (() => void) | null = null

export function setOnChange(cb: () => void) {
  onChange = cb
}

export async function fetchItemMetadata(itemIDs: number[]): Promise<void> {
  const uncached = itemIDs.filter(id => !cache.has(id))
  if (uncached.length === 0) return

  try {
    const url = `${XIVAPI_BASE}/sheet/Item?rows=${uncached.join(',')}&fields=Icon,Name`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[xivapi] Failed to fetch item metadata: HTTP ${res.status}`)
      return
    }
    const data = await res.json() as { rows: XivApiItemRow[] }
    for (const row of data.rows) {
      cache.set(row.row_id, {
        name: row.fields.Name,
        iconPath: row.fields.Icon?.path,
      })
    }
    onChange?.()
  } catch (err) {
    console.warn('[xivapi] Failed to fetch item metadata:', err)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/client/xivapi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/lib/xivapi.ts tests/client/xivapi.test.ts
git commit -m "feat: add fetchItemMetadata with batch fetch and cache dedup"
```

---

### Task 3: Wire up `OpportunityTable.svelte` — swap module and add icons

**Files:**
- Modify: `src/client/components/OpportunityTable.svelte`
- Delete: `src/client/lib/item-names.ts`

- [ ] **Step 1: Update imports in `OpportunityTable.svelte`**

Replace line 5:

```ts
// FROM:
import { resolveItemName, setOnChange } from '../lib/item-names.ts'
// TO:
import { resolveItemName, setOnChange, getIconUrl, fetchItemMetadata } from '../lib/xivapi.ts'
```

- [ ] **Step 2: Add reactive fetch call**

Add after `setOnChange(() => nameGeneration++)` (after line 10):

```ts
$effect(() => {
  if (opportunities.length > 0) {
    fetchItemMetadata(opportunities.map(o => o.itemID))
  }
})
```

- [ ] **Step 3: Add `iconUrl` helper and update Item column template**

Add helper alongside the existing `name` helper (near line 13):

```ts
const iconUrl = (opp: Opportunity) => { void nameGeneration; return getIconUrl(opp.itemID) }
```

Replace the Item `<td>` (lines 55-59) with:

```svelte
<td>
  <div class="flex items-center gap-1.5">
    {@const icon = iconUrl(opp)}
    {#if icon}
      <img src={icon} alt="" width="20" height="20" class="flex-shrink-0"
        onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
    {/if}
    <a class="link link-info no-underline hover:underline" href="https://universalis.app/market/{opp.itemID}" target="_blank" rel="noopener">
      {name(opp)}
    </a>
  </div>
</td>
```

- [ ] **Step 4: Delete `src/client/lib/item-names.ts`**

```bash
git rm src/client/lib/item-names.ts
```

- [ ] **Step 5: Verify the app builds**

Run: `bunx vite build`
Expected: Build succeeds with no import errors

- [ ] **Step 6: Run all tests**

Run: `bun test`
Expected: All existing tests still pass

- [ ] **Step 7: Manual verification**

Run the dev server and verify:
- Icons appear next to item names in the table
- Items with TC Chinese names show correctly
- Items with `Item #NNN` fallback show English names
- Icons that fail to load are hidden (no broken image placeholder)
- Changing threshold filters works (icons appear for newly loaded items)

- [ ] **Step 8: Commit**

```bash
git add src/client/components/OpportunityTable.svelte
git commit -m "feat: add item icons and migrate to XIVAPI v2 batched endpoint

Replace item-names.ts with xivapi.ts. Icons load from XIVAPI v2 asset
endpoint as webp images. English fallback names now fetched via v2
batch API instead of v1 per-item calls."
```

---

### Task 4: Update ADR-007

**Files:**
- Modify: `docs/decisions/ADR-007-item-name-resolution.md`

- [ ] **Step 1: Add v2 migration addendum**

Append to the end of `ADR-007-item-name-resolution.md`:

```markdown
## Update: Migrated client-side fallback to XIVAPI v2 (2026-04-02)

Replaced per-item XIVAPI v1 calls (`xivapi.com/item/{id}?columns=Name`) with a single batched XIVAPI v2 call:

    GET https://v2.xivapi.com/api/sheet/Item?rows={id1},{id2},...&fields=Icon,Name

**Why:**
- **One request replaces N:** Batch all item IDs into a single call instead of one per fallback item
- **Icon support:** The same call retrieves icon paths (used to display item icons in the opportunity table)
- **v1 deprecation:** XIVAPI v1 is deprecated in favor of v2

**Changes:**
- `item-names.ts` replaced by `xivapi.ts` which handles both name resolution and icon URL construction
- Icons rendered as `<img>` elements loading directly from XIVAPI's asset endpoint (`format=webp`)
- Cache keyed by item ID stores both English name and icon path
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/ADR-007-item-name-resolution.md
git commit -m "docs: add XIVAPI v2 migration addendum to ADR-007"
```
