// Portal tooltip attachment using Floating UI.
// Renders tooltips on document.body to escape overflow clipping contexts.
// Styled to match DaisyUI's tooltip appearance via CSS custom properties.

import { computePosition, offset, flip, shift } from '@floating-ui/dom'
import type { Attachment } from 'svelte/attachments'

export function tooltip(text: string): Attachment {
  return (node) => {
    let el: HTMLDivElement | null = null

    function show() {
      el = document.createElement('div')
      el.textContent = text
      el.style.cssText = `
        position: absolute;
        z-index: 1000;
        background-color: var(--color-neutral);
        color: var(--color-neutral-content);
        border-radius: var(--radius-field);
        font-size: 0.875rem;
        line-height: 1.25;
        padding: 0.25rem 0.5rem;
        max-width: 20rem;
        width: max-content;
        text-align: left;
        white-space: normal;
        pointer-events: none;
      `
      document.body.appendChild(el)

      computePosition(node as HTMLElement, el, {
        placement: 'top',
        middleware: [offset(8), flip(), shift({ padding: 8 })]
      }).then(({ x, y }) => {
        if (el) {
          el.style.left = `${x}px`
          el.style.top = `${y}px`
        }
      })
    }

    function hide() {
      el?.remove()
      el = null
    }

    node.addEventListener('mouseenter', show)
    node.addEventListener('mouseleave', hide)

    return () => {
      hide()
      node.removeEventListener('mouseenter', show)
      node.removeEventListener('mouseleave', hide)
    }
  }
}
