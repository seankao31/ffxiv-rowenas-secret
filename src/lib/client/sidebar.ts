const STORAGE_KEY = 'sidebar-expanded'

export function loadSidebarExpanded(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === null) return true
  return stored === 'true'
}

export function saveSidebarExpanded(expanded: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(expanded))
}
