// src/server/universalis.ts
const DC_NAME = '陸行鳥'
const HOME_WORLD = '利維坦'
const BASE_URL = 'https://universalis.app/api/v2'
const BATCH_SIZE = 100
const REQUEST_TIMEOUT_MS = 10_000
const MAX_RETRIES = 3

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
  private readonly maxTokens: number
  private readonly msPerToken: number

  constructor(ratePerSecond: number) {
    this.maxTokens = ratePerSecond
    this.tokens = ratePerSecond
    this.lastRefill = Date.now()
    this.msPerToken = 1000 / ratePerSecond
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

const semaphore = new Semaphore(8)
const rateLimiter = new RateLimiter(20)

async function fetchWithRetry(url: string, retries = 0): Promise<unknown> {
  await rateLimiter.acquire()
  return semaphore.run(async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (res.status === 429) {
        if (retries >= MAX_RETRIES) {
          console.warn(`[universalis] 429 after ${MAX_RETRIES} retries, skipping: ${url}`)
          return null
        }
        const backoff = Math.pow(2, retries) * 1000
        console.warn(`[universalis] 429, retrying in ${backoff}ms (attempt ${retries + 1})`)
        await new Promise(r => setTimeout(r, backoff))
        return fetchWithRetry(url, retries + 1)
      }
      if (!res.ok) {
        console.warn(`[universalis] HTTP ${res.status}, skipping: ${url}`)
        return null
      }
      return res.json()
    } catch (err) {
      if (retries >= MAX_RETRIES) {
        console.warn(`[universalis] request failed after ${MAX_RETRIES} retries: ${url}`)
        return null
      }
      const backoff = Math.pow(2, retries) * 1000
      await new Promise(r => setTimeout(r, backoff))
      return fetchWithRetry(url, retries + 1)
    } finally {
      clearTimeout(timeout)
    }
  })
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function fetchMarketableItems(): Promise<number[]> {
  const data = await fetchWithRetry(`${BASE_URL}/marketable`) as number[] | null
  return data ?? []
}

export async function fetchItemName(itemID: number): Promise<string | null> {
  const data = await fetchWithRetry(
    `${BASE_URL}/extra/content/item/${itemID}`
  ) as { name?: string } | null
  return data?.name ?? null
}

export type DCBatchResult = {
  itemID: number
  listings: Array<{
    pricePerUnit: number
    quantity: number
    worldID: number
    worldName: string
    lastReviewTime: number
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

export async function fetchDCListings(itemIds: number[]): Promise<DCBatchResult[]> {
  const batches = chunk(itemIds, BATCH_SIZE)
  const results = await Promise.all(
    batches.map(async batch => {
      const ids = batch.join(',')
      const data = await fetchWithRetry(
        `${BASE_URL}/${encodeURIComponent(DC_NAME)}/${ids}`
      ) as {
        items?: Record<string, {
          itemID: number
          listings: DCBatchResult['listings']
          lastUploadTime: number
        }>
      } | null
      if (!data?.items) return []
      return Object.values(data.items).map(item => ({
        itemID: item.itemID,
        listings: item.listings ?? [],
        lastUploadTime: item.lastUploadTime ?? 0,
      }))
    })
  )
  return results.flat()
}

export async function fetchHomeListings(itemIds: number[]): Promise<HomeBatchResult[]> {
  const batches = chunk(itemIds, BATCH_SIZE)
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
