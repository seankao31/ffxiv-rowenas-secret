/**
 * Build-time download script for FFXIV_Market msgpack data files.
 *
 * Downloads pre-built msgpack files from the FFXIV_Market GitHub repository
 * into the local data/ directory. Exits non-zero if any download fails,
 * ensuring the build breaks rather than silently degrading at runtime.
 *
 * Per ADR-012: https://github.com/beherw/FFXIV_Market
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE_URL = 'https://raw.githubusercontent.com/beherw/FFXIV_Market/main/public/data'
const DATA_DIR = join(process.cwd(), 'data')

const FILES = [
  'tw-items.msgpack',
  'recipes.msgpack',
]

async function downloadFile(filename: string): Promise<void> {
  const url = `${BASE_URL}/${filename}`
  console.log(`Downloading ${filename}…`)

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download ${filename}: HTTP ${res.status}`)
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  await writeFile(join(DATA_DIR, filename), bytes)
  console.log(`  ✓ ${filename} (${bytes.length} bytes)`)
}

async function main(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })

  const results = await Promise.allSettled(FILES.map(downloadFile))

  const failures = results
    .map((r, i) => [r, FILES[i]] as const)
    .filter(([r]) => r.status === 'rejected')

  if (failures.length > 0) {
    for (const [r, name] of failures) {
      console.error(`✗ ${name}: ${(r as PromiseRejectedResult).reason}`)
    }
    process.exit(1)
  }

  console.log(`\nAll ${FILES.length} files downloaded to data/`)
}

main()
