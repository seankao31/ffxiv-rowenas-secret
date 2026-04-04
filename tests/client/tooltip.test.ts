import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@floating-ui/dom', () => ({
  computePosition: () => Promise.resolve({ x: 10, y: 20 }),
  offset: () => {},
  flip: () => {},
  shift: () => {},
}))

import { tooltip } from '$lib/client/tooltip'

// Minimal DOM stubs for testing the attachment factory pattern.
// We verify: event wiring, tooltip element lifecycle, and cleanup behavior.

let bodyChildren: any[] = []
let listeners: Record<string, Function[]> = {}
let docListeners: Record<string, Function[]> = {}

function makeNode(): HTMLElement {
  return {
    addEventListener: (event: string, handler: Function) => {
      listeners[event] = listeners[event] || []
      listeners[event].push(handler)
    },
    removeEventListener: (event: string, handler: Function) => {
      listeners[event] = (listeners[event] || []).filter(h => h !== handler)
    },
    contains: (_target: any) => false,
  } as unknown as HTMLElement
}

beforeEach(() => {
  bodyChildren = []
  listeners = {}
  docListeners = {}

  globalThis.document = {
    ...globalThis.document,
    createElement: (tag: string) => {
      const el = {
        tagName: tag.toUpperCase(),
        textContent: '',
        style: { cssText: '', left: '', top: '', display: '' },
        remove: vi.fn(function(this: any) {
          bodyChildren = bodyChildren.filter(c => c !== this)
        }),
      }
      return el
    },
    body: {
      appendChild: (child: any) => { bodyChildren.push(child) },
    },
    addEventListener: (event: string, handler: Function) => {
      docListeners[event] = docListeners[event] || []
      docListeners[event].push(handler)
    },
    removeEventListener: (event: string, handler: Function) => {
      docListeners[event] = (docListeners[event] || []).filter(h => h !== handler)
    },
  } as any
})

afterEach(() => {
  bodyChildren = []
  listeners = {}
  docListeners = {}
})

describe('tooltip attachment factory', () => {
  test('returns a function (attachment)', () => {
    const attachment = tooltip('Hello')
    expect(typeof attachment).toBe('function')
  })

  test('attachment returns a cleanup function', () => {
    const node = makeNode()
    const cleanup = tooltip('Hello')(node)
    expect(typeof cleanup).toBe('function')
  })

  test('registers mouseenter and mouseleave listeners', () => {
    const node = makeNode()
    tooltip('Hello')(node)
    expect(listeners['mouseenter']).toHaveLength(1)
    expect(listeners['mouseleave']).toHaveLength(1)
  })

  test('mouseenter creates a tooltip element on document.body', () => {
    const node = makeNode()
    tooltip('Hello')(node)
    expect(bodyChildren).toHaveLength(0)

    listeners['mouseenter']![0]!()
    expect(bodyChildren).toHaveLength(1)
    expect(bodyChildren[0].textContent).toBe('Hello')
  })

  test('mouseleave removes the tooltip element', () => {
    const node = makeNode()
    tooltip('Hello')(node)

    listeners['mouseenter']![0]!()
    expect(bodyChildren).toHaveLength(1)

    listeners['mouseleave']![0]!()
    expect(bodyChildren).toHaveLength(0)
  })

  test('cleanup removes listeners and any visible tooltip', () => {
    const node = makeNode()
    const cleanup = tooltip('Hello')(node)

    listeners['mouseenter']![0]!()
    expect(bodyChildren).toHaveLength(1)

    cleanup!()
    expect(listeners['mouseenter']).toHaveLength(0)
    expect(listeners['mouseleave']).toHaveLength(0)
    expect(bodyChildren).toHaveLength(0)
  })

  test('cleanup works even when no tooltip is visible', () => {
    const node = makeNode()
    const cleanup = tooltip('Hello')(node)
    cleanup!()
    expect(listeners['mouseenter']).toHaveLength(0)
    expect(listeners['mouseleave']).toHaveLength(0)
  })
})

describe('tooltip click-to-pin', () => {
  test('click on trigger pins tooltip (survives mouseleave)', () => {
    const node = makeNode()
    tooltip('Hello')(node)

    // Hover to show
    listeners['mouseenter']![0]!()
    expect(bodyChildren).toHaveLength(1)

    // Click to pin
    listeners['click']![0]!()

    // Mouseleave should NOT hide when pinned
    listeners['mouseleave']![0]!()
    expect(bodyChildren).toHaveLength(1)
  })

  test('click without prior hover shows and pins tooltip', () => {
    const node = makeNode()
    tooltip('Hello')(node)

    // Click directly (no hover first)
    listeners['click']![0]!()
    expect(bodyChildren).toHaveLength(1)
    expect(bodyChildren[0].textContent).toBe('Hello')

    // Mouseleave should not hide
    listeners['mouseleave']![0]!()
    expect(bodyChildren).toHaveLength(1)
  })

  test('second click on trigger unpins and hides', () => {
    const node = makeNode()
    tooltip('Hello')(node)

    listeners['click']![0]!()
    expect(bodyChildren).toHaveLength(1)

    // Second click unpins and hides
    listeners['click']![0]!()
    expect(bodyChildren).toHaveLength(0)
  })

  test('click outside unpins and hides', () => {
    const node = makeNode()
    tooltip('Hello')(node)

    listeners['click']![0]!()
    expect(bodyChildren).toHaveLength(1)

    // Simulate outside click — node.contains returns false for external targets
    docListeners['click']![0]!({ target: document.body })
    expect(bodyChildren).toHaveLength(0)
  })

  test('pinned tooltip enables pointer-events', () => {
    const node = makeNode()
    tooltip('Hello')(node)

    listeners['click']![0]!()
    expect(bodyChildren[0].style.pointerEvents).toBe('auto')
  })

  test('hover after unpin still works normally', () => {
    const node = makeNode()
    tooltip('Hello')(node)

    // Pin then unpin
    listeners['click']![0]!()
    listeners['click']![0]!()
    expect(bodyChildren).toHaveLength(0)

    // Normal hover should still work
    listeners['mouseenter']![0]!()
    expect(bodyChildren).toHaveLength(1)

    listeners['mouseleave']![0]!()
    expect(bodyChildren).toHaveLength(0)
  })

  test('cleanup removes pinned tooltip and document listener', () => {
    const node = makeNode()
    const cleanup = tooltip('Hello')(node)

    listeners['click']![0]!()
    expect(bodyChildren).toHaveLength(1)
    expect(docListeners['click']).toHaveLength(1)

    cleanup!()
    expect(bodyChildren).toHaveLength(0)
    expect(docListeners['click'] || []).toHaveLength(0)
  })
})
