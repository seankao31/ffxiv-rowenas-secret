---
name: xivapi-v2
description: Use when interacting with XIVAPI v2 for FFXIV game data — sheet reads, pagination, search queries, subrow handling. Triggers on fetch calls to v2.xivapi.com, GilShopItem, or any XIVAPI sheet pagination.
---

# XIVAPI v2 API Reference

Base URL: `https://v2.xivapi.com/api`. Full OpenAPI spec: `api-spec.yaml` in this directory.

## Pagination — Two Different Models

### Sheet endpoint (`/sheet/{sheet}`)

**`SheetResponse` has NO `next` field.** Only `rows`, `schema`, `version`.

Paginate by passing last row as `after`. Format is `RowSpecifier`: `row_id` or `row_id:subrow_id` (**colon**, not dot). Pattern: `^\d+(:\d+)?$`.

```typescript
let cursor: string | undefined
while (true) {
  const params = new URLSearchParams({ limit: '500', fields: 'Item.row_id' })
  if (cursor) params.set('after', cursor)
  const data = await fetch(`${BASE}/sheet/GilShopItem?${params}`).then(r => r.json())
  const rows = data.rows ?? []
  if (rows.length === 0) break
  // Process rows...
  const last = rows.at(-1)
  cursor = last.subrow_id != null ? `${last.row_id}:${last.subrow_id}` : `${last.row_id}`
  if (rows.length < 500) break
}
```

### Search endpoint (`/search`)

HAS `next` cursor (UUID) in `SearchResponse`. Pass to `cursor` parameter.

## Subrow Sheets

Sheets like `GilShopItem` have both `row_id` and `subrow_id`.

- `rows=` batch fetch returns **only subrow 0** per row — do NOT use for exhaustive reads
- `after` and `rows` must NOT be combined (undefined behavior per spec)
- Must paginate with `after=row_id:subrow_id` to get all subrows

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Checking `data.next` on sheet responses | Doesn't exist. Construct `after` from last row. |
| Using `.` as subrow separator (`262192.32`) | Use `:` — `262192:32`. Dot returns HTTP 400. |
| Combining `rows=` and `after=` params | Undefined behavior. Use one or the other. |
| Using `rows=` to read subrow sheets | Only returns subrow 0. Paginate with `after`. |
