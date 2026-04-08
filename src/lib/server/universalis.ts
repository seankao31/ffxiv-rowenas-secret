import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RateLimiter } from 'limiter'

const DC_NAME = '陸行鳥'
const HOME_WORLD = '利維坦'
const BASE_URL = 'https://universalis.app/api/v2'
const BATCH_SIZE = 100
const REQUEST_TIMEOUT_MS = 10_000
const MAX_RETRIES = 3
const USER_AGENT = process.env['UNIVERSALIS_USER_AGENT'] || 'FFXIV-Rowenas-Secret/1.0'

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

export class OutboundRateLimiter {
  private limiter: RateLimiter
  private rate: number

  constructor(ratePerSecond: number) {
    this.rate = ratePerSecond
    this.limiter = new RateLimiter({ tokensPerInterval: ratePerSecond, interval: 'second' })
  }

  setRate(ratePerSecond: number): void {
    this.rate = ratePerSecond
    this.limiter = new RateLimiter({ tokensPerInterval: ratePerSecond, interval: 'second' })
  }

  getRate(): number {
    return this.rate
  }

  async acquire(): Promise<void> {
    await this.limiter.removeTokens(1)
  }
}

const semaphore = new Semaphore(4)
export const rateLimiter = new OutboundRateLimiter(5)

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

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

type BatchResponse = { items?: Record<string, unknown> }

async function fetchBatched<T>(
  itemIds: number[],
  endpoint: string,
  transformItems: (items: Record<string, unknown>) => T[],
  onBatchDone?: ProgressCallback,
): Promise<T[]> {
  const batches = chunk(itemIds, BATCH_SIZE)
  let completed = 0
  const results = await Promise.all(
    batches.map(async batch => {
      const ids = batch.join(',')
      const data = await fetchWithRetry(
        `${BASE_URL}/${encodeURIComponent(endpoint)}/${ids}`
      ) as BatchResponse | null
      completed++
      onBatchDone?.(completed, batches.length)
      if (!data?.items) return []
      return transformItems(data.items)
    })
  )
  return results.flat()
}

export async function fetchMarketableItems(): Promise<number[]> {
  const data = await fetchWithRetry(`${BASE_URL}/marketable`)
  if (!Array.isArray(data)) {
    if (data !== null) console.warn('[universalis] /marketable returned unexpected shape:', typeof data)
    return []
  }
  return data as number[]
}

const DEFAULT_ITEM_NAMES_PATH = join(process.cwd(), 'data', 'tw-items.msgpack')

export async function fetchItemNames(
  path = DEFAULT_ITEM_NAMES_PATH,
): Promise<Map<number, string>> {
  const { decode } = await import('@msgpack/msgpack')
  const bytes = await readFile(path)
  const data = decode(bytes) as Record<string, { tw: string }>
  const map = new Map<number, string>()
  for (const [id, item] of Object.entries(data)) {
    if (item.tw) map.set(Number(id), item.tw)
  }
  console.log(`[universalis] Loaded ${map.size} item names from FFXIV_Market`)
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
  type ApiItem = {
    itemID: number
    worldUploadTimes?: Record<string, number>
    listings: Array<{
      lastReviewTime: number
      pricePerUnit: number
      quantity: number
      worldID: number
      worldName: string
      hq: boolean
    }>
    lastUploadTime: number
  }
  return fetchBatched(itemIds, DC_NAME, (items) =>
    Object.values(items as Record<string, ApiItem>).map(item => ({
      itemID: item.itemID,
      worldUploadTimes: item.worldUploadTimes ?? {},
      listings: (item.listings ?? []).map(l => ({
        lastReviewTime: l.lastReviewTime * 1000,
        pricePerUnit: l.pricePerUnit,
        quantity: l.quantity,
        worldID: l.worldID,
        worldName: l.worldName,
        hq: l.hq,
      })),
      lastUploadTime: item.lastUploadTime ?? 0,
    })),
    onBatchDone,
  )
}

export async function fetchWorldListings(
  world: { id: number; name: string },
  itemIds: number[],
  onBatchDone?: ProgressCallback,
): Promise<DCBatchResult[]> {
  type ApiItem = {
    itemID: number
    lastUploadTime: number
    listings: Array<{
      lastReviewTime: number
      pricePerUnit: number
      quantity: number
      hq: boolean
    }>
  }
  return fetchBatched(itemIds, world.name, (items) =>
    Object.values(items as Record<string, ApiItem>).map(item => ({
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
    })),
    onBatchDone,
  )
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
  type ApiItem = {
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
  }
  type Combined = { dc: DCBatchResult; home: HomeBatchResult }
  const combined = await fetchBatched<Combined>(itemIds, HOME_WORLD, (items) =>
    Object.values(items as Record<string, ApiItem>).map(item => ({
      dc: {
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
      },
      home: {
        itemID: item.itemID,
        regularSaleVelocity: item.regularSaleVelocity ?? 0,
        hqSaleVelocity: item.hqSaleVelocity ?? 0,
        recentHistory: item.recentHistory ?? [],
        lastUploadTime: item.lastUploadTime ?? 0,
      },
    })),
    onBatchDone,
  )
  return {
    dcResults: combined.map(c => c.dc),
    homeResults: combined.map(c => c.home),
  }
}

export async function fetchHomeListings(
  itemIds: number[],
  onBatchDone?: ProgressCallback,
): Promise<HomeBatchResult[]> {
  type ApiItem = {
    itemID: number
    regularSaleVelocity: number
    hqSaleVelocity: number
    recentHistory: HomeBatchResult['recentHistory']
    lastUploadTime: number
  }
  return fetchBatched(itemIds, HOME_WORLD, (items) =>
    Object.values(items as Record<string, ApiItem>).map(item => ({
      itemID: item.itemID,
      regularSaleVelocity: item.regularSaleVelocity ?? 0,
      hqSaleVelocity: item.hqSaleVelocity ?? 0,
      recentHistory: item.recentHistory ?? [],
      lastUploadTime: item.lastUploadTime ?? 0,
    })),
    onBatchDone,
  )
}
