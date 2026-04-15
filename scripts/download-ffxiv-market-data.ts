/**
 * Build-time download script for FFXIV_Market msgpack data files.
 *
 * Downloads pre-built msgpack files from the FFXIV_Market GitHub repository
 * into the local data/ directory. Exits non-zero if any download fails,
 * ensuring the build breaks rather than silently degrading at runtime.
 *
 * Per ADR-012: https://github.com/beherw/FFXIV_Market
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type FileMetadata = Record<string, string>

const BASE_URL = 'https://raw.githubusercontent.com/beherw/FFXIV_Market/main/public/data'
const DATA_DIR = join(process.cwd(), 'data')

const FILES = [
  'tw-items.msgpack',
  'recipes.msgpack',
]

const CONTENTS_API_URL = 'https://api.github.com/repos/beherw/FFXIV_Market/contents/public/data'
const METADATA_FILE = '.metadata.json'

interface GitHubContentsEntry {
  name: string
  sha: string
}

export async function fetchUpstreamShas(files: string[]): Promise<Record<string, string>> {
  const res = await fetch(CONTENTS_API_URL, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) {
    throw new Error(`GitHub Contents API failed: HTTP ${res.status}`)
  }
  const entries = (await res.json()) as GitHubContentsEntry[]
  const wanted = new Set(files)
  const shas: Record<string, string> = {}
  for (const entry of entries) {
    if (wanted.has(entry.name)) {
      shas[entry.name] = entry.sha
    }
  }
  return shas
}

export async function loadMetadata(dataDir: string): Promise<FileMetadata> {
  try {
    const raw = await readFile(join(dataDir, METADATA_FILE), 'utf-8')
    return JSON.parse(raw) as FileMetadata
  } catch {
    return {}
  }
}

export async function saveMetadata(dataDir: string, metadata: FileMetadata): Promise<void> {
  await writeFile(join(dataDir, METADATA_FILE), JSON.stringify(metadata, null, 2) + '\n')
}

export function filesToDownload(
  files: string[],
  upstreamShas: Record<string, string>,
  localMetadata: FileMetadata,
  existingFiles?: Set<string>,
): string[] {
  return files.filter((f) => {
    if (existingFiles && !existingFiles.has(f)) return true
    return upstreamShas[f] !== localMetadata[f]
  })
}

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

  const upstreamShas = await fetchUpstreamShas(FILES)
  const localMetadata = await loadMetadata(DATA_DIR)
  const existingFiles = new Set<string>()
  for (const file of FILES) {
    try {
      await access(join(DATA_DIR, file))
      existingFiles.add(file)
    } catch { /* file missing */ }
  }
  const needed = filesToDownload(FILES, upstreamShas, localMetadata, existingFiles)

  if (needed.length === 0) {
    console.log('All data files are up to date')
    return
  }

  console.log(`${needed.length}/${FILES.length} files need updating`)

  const results = await Promise.allSettled(needed.map(downloadFile))

  const failures = results
    .map((r, i) => [r, needed[i]] as const)
    .filter(([r]) => r.status === 'rejected')

  if (failures.length > 0) {
    for (const [r, name] of failures) {
      console.error(`✗ ${name}: ${(r as PromiseRejectedResult).reason}`)
    }
    process.exit(1)
  }

  // Update metadata for successfully downloaded files
  const updatedMetadata = { ...localMetadata }
  for (const file of needed) {
    updatedMetadata[file] = upstreamShas[file]!
  }
  await saveMetadata(DATA_DIR, updatedMetadata)

  console.log(`\nDownloaded ${needed.length} file(s) to data/`)
}

// Only run when executed directly, not when imported for tests
const isDirectRun = process.argv[1]?.endsWith('download-ffxiv-market-data.ts')
if (isDirectRun) {
  main()
}
