import { TrendingUp } from 'lucide-svelte'

export interface NavItem {
  id: string
  label: string
  icon: typeof TrendingUp
  category: string
}

export const navItems: NavItem[] = [
  { id: 'arbitrage', label: 'Arbitrage', icon: TrendingUp, category: 'Trading' },
]
