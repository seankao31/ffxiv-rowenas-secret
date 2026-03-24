// src/server/universalis.ts
const DC_NAME = '陸行鳥'
const HOME_WORLD = '利維坦'
const BASE_URL = 'https://universalis.app/api/v2'
const BATCH_SIZE = 100
const REQUEST_TIMEOUT_MS = 10_000
const MAX_RETRIES = 3
const USER_AGENT = process.env['UNIVERSALIS_USER_AGENT'] || 'FFXIV-Arbitrage-TC/1.0'

export const DC_WORLDS: { id: number; name: string }[] = [
  { id: 4028, name: '伊弗利特' },
  { id: 4029, name: '迦樓羅' },
  { id: 4030, name: '利維坦' },
  { id: 4031, name: '鳳凰' },
  { id: 4032, name: '奧汀' },
  { id: 4033, name: '巴哈姆特' },
  { id: 4034, name: '拉姆' },
  { id: 4035, name: '泰坦' },
]

export class Semaphore {
  private count: number
  private readonly queue: (() => void)[] = []

  constructor(count: number) {
    this.count = count
  }

  acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--
      return Promise.resolve()
    }
    return new Promise(resolve => this.queue.push(resolve))
  }

  release(): void {
    const next = this.queue.shift()
    if (next) next()
    else this.count++
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

export class RateLimiter {
  private tokens: number
  private lastRefill: number
  private maxTokens: number
  private msPerToken: number

  constructor(ratePerSecond: number) {
    this.maxTokens = ratePerSecond
    this.tokens = ratePerSecond
    this.lastRefill = Date.now()
    this.msPerToken = 1000 / ratePerSecond
  }

  setRate(ratePerSecond: number): void {
    this.maxTokens = ratePerSecond
    this.msPerToken = 1000 / ratePerSecond
    this.tokens = Math.min(this.tokens, this.maxTokens)
  }

  getRate(): number {
    return this.maxTokens
  }

  async acquire(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed / this.msPerToken)
    this.lastRefill = now

    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    const waitMs = (1 - this.tokens) * this.msPerToken
    await new Promise<void>(resolve => setTimeout(resolve, waitMs))
    this.tokens = 0
    this.lastRefill = Date.now()
  }
}

const semaphore = new Semaphore(4)
export const rateLimiter = new RateLimiter(5)

const RETRY = Symbol('retry')

async function fetchWithRetry(url: string): Promise<unknown> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await rateLimiter.acquire()
    const result = await semaphore.run(async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT },
        })
        if (res.status === 429) return RETRY
        if (!res.ok) {
          console.warn(`[universalis] HTTP ${res.status}, skipping: ${url}`)
          return null
        }
        return res.json()
      } catch {
        return RETRY
      } finally {
        clearTimeout(timeout)
      }
    })
    if (result !== RETRY) return result
    if (attempt >= MAX_RETRIES) break
    const backoff = Math.pow(2, attempt) * 1000
    console.warn(`[universalis] retrying in ${backoff}ms (attempt ${attempt + 1}): ${url}`)
    await new Promise(r => setTimeout(r, backoff))
  }
  console.warn(`[universalis] failed after ${MAX_RETRIES} retries, skipping: ${url}`)
  return null
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function fetchMarketableItems(): Promise<number[]> {
  const data = await fetchWithRetry(`${BASE_URL}/marketable`)
  if (!Array.isArray(data)) {
    if (data !== null) console.warn('[universalis] /marketable returned unexpected shape:', typeof data)
    return []
  }
  return data as number[]
}

const MOGBOARD_ITEMS_URL =
  'https://raw.githubusercontent.com/Universalis-FFXIV/mogboard-next/main/data/game/tc/items.json'

export async function fetchItemNames(): Promise<Map<number, string>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  let res: Response
  try {
    res = await fetch(MOGBOARD_ITEMS_URL, {
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
  const data = await res.json() as Record<string, { name: string }>
  const map = new Map<number, string>()
  for (const [id, item] of Object.entries(data)) {
    map.set(Number(id), item.name)
  }
  console.log(`[universalis] Loaded ${map.size} item names from mogboard`)
  return map
}

export type DCBatchResult = {
  itemID: number
  worldUploadTimes: Record<number, number>  // per-world last upload time, unix ms (from API)
  listings: Array<{
    pricePerUnit: number
    quantity: number
    worldID: number
    worldName: string
    lastReviewTime: number  // unix ms (converted from API's seconds on ingestion)
    hq: boolean
  }>
  lastUploadTime: number
}

export type HomeBatchResult = {
  itemID: number
  regularSaleVelocity: number
  hqSaleVelocity: number
  recentHistory: Array<{
    pricePerUnit: number
    quantity: number
    timestamp: number
    hq: boolean
  }>
  lastUploadTime: number
}

export type ProgressCallback = (completed: number, total: number) => void

export async function fetchDCListings(
  itemIds: number[],
  onBatchDone?: ProgressCallback,
): Promise<DCBatchResult[]> {
  const batches = chunk(itemIds, BATCH_SIZE)
  let completed = 0
  const results = await Promise.all(
    batches.map(async batch => {
      const ids = batch.join(',')
      const data = await fetchWithRetry(
        `${BASE_URL}/${encodeURIComponent(DC_NAME)}/${ids}`
      ) as {
        items?: Record<string, {
          itemID: number
          worldUploadTimes?: Record<string, number>
          listings: Array<{
            lastReviewTime: number   // seconds from API
            pricePerUnit: number
            quantity: number
            worldID: number
            worldName: string
            hq: boolean
          }>
          lastUploadTime: number
        }>
      } | null
      completed++
      onBatchDone?.(completed, batches.length)
      if (!data?.items) return []
      return Object.values(data.items).map(item => ({
        itemID: item.itemID,
        worldUploadTimes: item.worldUploadTimes ?? {},
        listings: (item.listings ?? []).map(l => ({
          lastReviewTime: l.lastReviewTime * 1000,  // seconds → ms
          pricePerUnit: l.pricePerUnit,
          quantity: l.quantity,
          worldID: l.worldID,
          worldName: l.worldName,
          hq: l.hq,
        })),
        lastUploadTime: item.lastUploadTime ?? 0,
      }))
    })
  )
  return results.flat()
}

export async function fetchWorldListings(
  world: { id: number; name: string },
  itemIds: number[],
  onBatchDone?: ProgressCallback,
): Promise<DCBatchResult[]> {
  const batches = chunk(itemIds, BATCH_SIZE)
  let completed = 0
  const results = await Promise.all(
    batches.map(async batch => {
      const ids = batch.join(',')
      const data = await fetchWithRetry(
        `${BASE_URL}/${encodeURIComponent(world.name)}/${ids}`
      ) as {
        items?: Record<string, {
          itemID: number
          lastUploadTime: number
          listings: Array<{
            lastReviewTime: number
            pricePerUnit: number
            quantity: number
            hq: boolean
          }>
        }>
      } | null
      completed++
      onBatchDone?.(completed, batches.length)
      if (!data?.items) return []
      return Object.values(data.items).map(item => ({
        itemID: item.itemID,
        worldUploadTimes: { [world.id]: item.lastUploadTime ?? 0 },
        listings: (item.listings ?? []).map(l => ({
          lastReviewTime: l.lastReviewTime * 1000,
          pricePerUnit: l.pricePerUnit,
          quantity: l.quantity,
          worldID: world.id,
          worldName: world.name,
          hq: l.hq,
        })),
        lastUploadTime: item.lastUploadTime ?? 0,
      }))
    })
  )
  return results.flat()
}

export const HOME_WORLD_ID = 4030

export type HomeWorldCombinedResult = {
  dcResults: DCBatchResult[]
  homeResults: HomeBatchResult[]
}

export async function fetchHomeWorldCombined(
  itemIds: number[],
  onBatchDone?: ProgressCallback,
): Promise<HomeWorldCombinedResult> {
  const batches = chunk(itemIds, BATCH_SIZE)
  let completed = 0
  const dcAll: DCBatchResult[][] = []
  const homeAll: HomeBatchResult[][] = []

  await Promise.all(
    batches.map(async batch => {
      const ids = batch.join(',')
      const data = await fetchWithRetry(
        `${BASE_URL}/${encodeURIComponent(HOME_WORLD)}/${ids}`
      ) as {
        items?: Record<string, {
          itemID: number
          lastUploadTime: number
          listings: Array<{
            lastReviewTime: number
            pricePerUnit: number
            quantity: number
            hq: boolean
          }>
          regularSaleVelocity: number
          hqSaleVelocity: number
          recentHistory: HomeBatchResult['recentHistory']
        }>
      } | null
      completed++
      onBatchDone?.(completed, batches.length)
      if (!data?.items) return

      const dcBatch: DCBatchResult[] = []
      const homeBatch: HomeBatchResult[] = []
      for (const item of Object.values(data.items)) {
        dcBatch.push({
          itemID: item.itemID,
          worldUploadTimes: { [HOME_WORLD_ID]: item.lastUploadTime ?? 0 },
          listings: (item.listings ?? []).map(l => ({
            lastReviewTime: l.lastReviewTime * 1000,
            pricePerUnit: l.pricePerUnit,
            quantity: l.quantity,
            worldID: HOME_WORLD_ID,
            worldName: HOME_WORLD,
            hq: l.hq,
          })),
          lastUploadTime: item.lastUploadTime ?? 0,
        })
        homeBatch.push({
          itemID: item.itemID,
          regularSaleVelocity: item.regularSaleVelocity ?? 0,
          hqSaleVelocity: item.hqSaleVelocity ?? 0,
          recentHistory: item.recentHistory ?? [],
          lastUploadTime: item.lastUploadTime ?? 0,
        })
      }
      dcAll.push(dcBatch)
      homeAll.push(homeBatch)
    })
  )

  return { dcResults: dcAll.flat(), homeResults: homeAll.flat() }
}

export async function fetchHomeListings(
  itemIds: number[],
  onBatchDone?: ProgressCallback,
): Promise<HomeBatchResult[]> {
  const batches = chunk(itemIds, BATCH_SIZE)
  let completed = 0
  const results = await Promise.all(
    batches.map(async batch => {
      const ids = batch.join(',')
      const data = await fetchWithRetry(
        `${BASE_URL}/${encodeURIComponent(HOME_WORLD)}/${ids}`
      ) as {
        items?: Record<string, {
          itemID: number
          regularSaleVelocity: number
          hqSaleVelocity: number
          recentHistory: HomeBatchResult['recentHistory']
          lastUploadTime: number
        }>
      } | null
      completed++
      onBatchDone?.(completed, batches.length)
      if (!data?.items) return []
      return Object.values(data.items).map(item => ({
        itemID: item.itemID,
        regularSaleVelocity: item.regularSaleVelocity ?? 0,
        hqSaleVelocity: item.hqSaleVelocity ?? 0,
        recentHistory: item.recentHistory ?? [],
        lastUploadTime: item.lastUploadTime ?? 0,
      }))
    })
  )
  return results.flat()
}
