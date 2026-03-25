# Item Data Source Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch item name source from mogboard-next JSON to FFXIV_Market msgpack for broader coverage (43k vs 15k items) and smaller payload (1.3 MB vs 5 MB).

**Architecture:** Replace the JSON fetch/parse in `fetchItemNames()` with msgpack fetch/decode. Function signature unchanged — all downstream code untouched. Add `@msgpack/msgpack` as the only new dependency.

**Tech Stack:** Bun, `@msgpack/msgpack`, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-25-item-data-source-switch-design.md`

---

### Task 1: Add `@msgpack/msgpack` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

Run: `bun add @msgpack/msgpack`

- [ ] **Step 2: Verify it installed**

Run: `bun run -e "import { decode, encode } from '@msgpack/msgpack'; console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "deps: add @msgpack/msgpack for binary item data decoding"
```

---

### Task 2: Update `fetchItemNames()` tests for msgpack format

**Files:**
- Modify: `tests/server/universalis.test.ts:206-238`

- [ ] **Step 1: Update the happy-path test to use msgpack-encoded data**

Replace the `fetchItemNames` describe block (lines 206-238) with:

```typescript
describe('fetchItemNames', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('decodes msgpack tw-items into id→name map', async () => {
    const { encode } = await import('@msgpack/msgpack')
    const mockData = {
      '2': { tw: '火之碎晶' },
      '7': { tw: '水之碎晶' },
    }
    globalThis.fetch = mock(async () =>
      new Response(encode(mockData), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(2)
    expect(result.get(2)).toBe('火之碎晶')
    expect(result.get(7)).toBe('水之碎晶')
  })

  test('skips entries with falsy tw field', async () => {
    const { encode } = await import('@msgpack/msgpack')
    const mockData = {
      '2': { tw: '火之碎晶' },
      '3': { tw: '' },
      '4': { tw: null },
    }
    globalThis.fetch = mock(async () =>
      new Response(encode(mockData), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(1)
    expect(result.get(2)).toBe('火之碎晶')
    expect(result.has(3)).toBe(false)
    expect(result.has(4)).toBe(false)
  })

  test('returns empty map on HTTP error', async () => {
    globalThis.fetch = mock(async () =>
      new Response('', { status: 500 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(0)
  })

  test('returns empty map on corrupt msgpack payload', async () => {
    globalThis.fetch = mock(async () =>
      new Response(new Uint8Array([0xff, 0xfe, 0x00]), { status: 200 })
    ) as unknown as typeof fetch

    const result = await fetchItemNames()

    expect(result.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/server/universalis.test.ts`
Expected: The happy-path test fails (current code calls `res.json()` on msgpack bytes). The HTTP error test still passes. The two new tests (falsy tw, corrupt payload) fail.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/server/universalis.test.ts
git commit -m "test: update fetchItemNames tests for msgpack format (red)"
```

---

### Task 3: Implement msgpack decoding in `fetchItemNames()`

**Files:**
- Modify: `src/server/universalis.ts:131-160`

- [ ] **Step 1: Replace the URL constant and function body**

Replace lines 131-160 with:

```typescript
const ITEM_NAMES_URL =
  'https://raw.githubusercontent.com/beherw/FFXIV_Market/main/public/data/tw-items.msgpack'

export async function fetchItemNames(): Promise<Map<number, string>> {
  const { decode } = await import('@msgpack/msgpack')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  let res: Response
  try {
    res = await fetch(ITEM_NAMES_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    })
  } catch (err) {
    console.warn(`[universalis] Failed to fetch item names: ${err instanceof Error ? err.message : err}`)
    return new Map()
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    console.warn(`[universalis] Failed to fetch item names: HTTP ${res.status}`)
    return new Map()
  }
  let data: Record<string, { tw: string }>
  try {
    data = decode(new Uint8Array(await res.arrayBuffer())) as Record<string, { tw: string }>
  } catch (err) {
    console.warn(`[universalis] Failed to decode item names: ${err instanceof Error ? err.message : err}`)
    return new Map()
  }
  const map = new Map<number, string>()
  for (const [id, item] of Object.entries(data)) {
    if (item.tw) map.set(Number(id), item.tw)
  }
  console.log(`[universalis] Loaded ${map.size} item names from FFXIV_Market`)
  return map
}
```

Note: We use `await import('@msgpack/msgpack')` (dynamic import) rather than a top-level import so the module name stays co-located with the function that uses it. A top-level `import { decode } from '@msgpack/msgpack'` is equally valid — use whichever feels right.

- [ ] **Step 2: Run the tests to verify they pass**

Run: `bun test tests/server/universalis.test.ts`
Expected: All 4 `fetchItemNames` tests pass. All other tests in the file still pass.

- [ ] **Step 3: Commit**

```bash
git add src/server/universalis.ts
git commit -m "feat: switch item names to FFXIV_Market msgpack source"
```

---

### Task 4: Update scanner comment and ADR

**Files:**
- Modify: `src/server/scanner.ts:222`
- Modify: `docs/decisions/ADR-007-item-name-resolution.md`

- [ ] **Step 1: Update the scanner comment**

In `src/server/scanner.ts`, line 222, replace:

```typescript
  // Fetch all item names in one shot from mogboard's TC data
```

with:

```typescript
  // Fetch all item names from FFXIV_Market's TW msgpack data
```

- [ ] **Step 2: Update ADR-007**

Add a new section at the end of `docs/decisions/ADR-007-item-name-resolution.md`:

````markdown
## Update: Switched to FFXIV_Market msgpack (2026-03-25)

Replaced mogboard-next JSON with [`beherw/FFXIV_Market`](https://github.com/beherw/FFXIV_Market)'s `tw-items.msgpack`:

    GET https://raw.githubusercontent.com/beherw/FFXIV_Market/main/public/data/tw-items.msgpack

**Why:**
- **43,158 items** (vs ~15,555) — covers all game items, not just TC-patch-current
- **1.3 MB msgpack** (vs ~5 MB JSON) — smaller payload
- **More frequently updated** — multi-source pipeline (dataminer → Teamcraft fallback)

**Changes:**
- Added `@msgpack/msgpack` dependency for binary decoding
- `fetchItemNames()` now decodes msgpack and reads `item.tw` instead of `item.name`
- Entries with falsy `tw` values are skipped (fall through to `Item #NNN` fallback)
- Decode errors return an empty map with a warning, consistent with fetch-error handling
````

- [ ] **Step 3: Run all tests to verify nothing broke**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/server/scanner.ts docs/decisions/ADR-007-item-name-resolution.md
git commit -m "docs: update ADR-007 and scanner comment for FFXIV_Market source"
```

---

### Task 5: Smoke test with live data

- [ ] **Step 1: Start the server and verify item names load**

Run: `bun run start`
Expected: Log output includes `[universalis] Loaded ≈43000 item names from FFXIV_Market` (exact count may vary). No errors or warnings about decoding.

- [ ] **Step 2: Verify the UI shows TC Chinese names**

Open the app in a browser. Confirm item names display in Traditional Chinese, not as `Item #NNN` placeholders.

- [ ] **Step 3: Stop the server**
