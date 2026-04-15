const PAGE_SIZE = 10

export function createMobilePagination() {
  let isDesktop = $state(false)
  let visibleCount = $state(PAGE_SIZE)

  $effect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    isDesktop = mql.matches
    const handler = (e: MediaQueryListEvent) => { isDesktop = e.matches }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  })

  return {
    get isDesktop() { return isDesktop },
    reset() { visibleCount = PAGE_SIZE },
    showMore() { visibleCount += PAGE_SIZE },
    slice<T>(items: T[]): T[] {
      return isDesktop ? items : items.slice(0, visibleCount)
    },
    hasMore(totalCount: number): boolean {
      return !isDesktop && visibleCount < totalCount
    },
    remaining(totalCount: number): number {
      return Math.max(0, totalCount - visibleCount)
    },
  }
}
