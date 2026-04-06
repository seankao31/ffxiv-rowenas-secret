# Copy-to-Clipboard Button Design

**Linear issue:** ENG-53
**Date:** 2026-04-07

## Problem

Users need to copy item names from the OpportunityTable to paste into the FFXIV in-game market board search. Currently there's no quick way to do this — they have to manually select the text.

## Design

### CopyButton component (`src/lib/components/CopyButton.svelte`)

A reusable copy-to-clipboard button with visual feedback.

**Props:**
- `text: string` — the value to copy to clipboard

**Behavior:**
1. Renders a small icon button with `Copy` icon (lucide-svelte)
2. On click, calls `navigator.clipboard.writeText(text)`
3. Swaps icon to `Check` for ~1.5s to confirm success, then reverts
4. If the clipboard API fails, does not swap the icon (no crash, no false confirmation)

**Styling:**
- `btn btn-ghost btn-xs` (DaisyUI) for table-density fit
- Icon size: 14px
- `opacity-50` default, `hover:opacity-90` — matches existing sort icon pattern

### Integration in OpportunityTable

The button is placed after the item name link in the "Item" column cell:

```
[game icon] [item name link] [CopyButton]
```

The `text` prop receives the resolved item name (the same value rendered in the link).

## Testing

- **Unit tests** for CopyButton: icon swap on click, revert after timeout, clipboard API failure handling
- **E2E test**: click the copy button, verify clipboard contents match the item name
