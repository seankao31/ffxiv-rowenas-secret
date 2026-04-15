import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  filesToDownload,
  loadMetadata,
  saveMetadata,
  type FileMetadata,
} from '../../scripts/download-ffxiv-market-data'

describe('filesToDownload', () => {
  const FILES = ['tw-items.msgpack', 'recipes.msgpack']

  const upstreamShas: Record<string, string> = {
    'tw-items.msgpack': 'aaa111',
    'recipes.msgpack': 'bbb222',
  }

  test('downloads all files when no local metadata exists', () => {
    const localMetadata: FileMetadata = {}
    const result = filesToDownload(FILES, upstreamShas, localMetadata)
    expect(result).toEqual(['tw-items.msgpack', 'recipes.msgpack'])
  })

  test('skips all files when SHAs match', () => {
    const localMetadata: FileMetadata = {
      'tw-items.msgpack': 'aaa111',
      'recipes.msgpack': 'bbb222',
    }
    const result = filesToDownload(FILES, upstreamShas, localMetadata)
    expect(result).toEqual([])
  })

  test('downloads only files with changed SHAs', () => {
    const localMetadata: FileMetadata = {
      'tw-items.msgpack': 'aaa111',
      'recipes.msgpack': 'old-sha',
    }
    const result = filesToDownload(FILES, upstreamShas, localMetadata)
    expect(result).toEqual(['recipes.msgpack'])
  })

  test('downloads file when SHA matches but file is missing on disk', () => {
    const localMetadata: FileMetadata = {
      'tw-items.msgpack': 'aaa111',
      'recipes.msgpack': 'bbb222',
    }
    const existingFiles = new Set(['tw-items.msgpack'])
    const result = filesToDownload(FILES, upstreamShas, localMetadata, existingFiles)
    expect(result).toEqual(['recipes.msgpack'])
  })
})

describe('metadata persistence', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dl-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  test('loadMetadata returns empty object when file does not exist', async () => {
    const result = await loadMetadata(tmpDir)
    expect(result).toEqual({})
  })

  test('saveMetadata writes and loadMetadata reads back', async () => {
    const metadata: FileMetadata = {
      'tw-items.msgpack': 'aaa111',
      'recipes.msgpack': 'bbb222',
    }
    await saveMetadata(tmpDir, metadata)
    const result = await loadMetadata(tmpDir)
    expect(result).toEqual(metadata)
  })

  test('saveMetadata writes valid JSON', async () => {
    const metadata: FileMetadata = { 'test.msgpack': 'sha123' }
    await saveMetadata(tmpDir, metadata)
    const raw = await readFile(join(tmpDir, '.metadata.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual(metadata)
  })
})

describe('fetchUpstreamShas', () => {
  test('returns SHAs for known files from GitHub Contents API', async () => {
    const { fetchUpstreamShas } = await import('../../scripts/download-ffxiv-market-data')
    const files = ['tw-items.msgpack', 'recipes.msgpack']
    const shas = await fetchUpstreamShas(files)
    expect(Object.keys(shas).sort()).toEqual([...files].sort())
    for (const sha of Object.values(shas)) {
      expect(sha).toMatch(/^[0-9a-f]{40}$/)
    }
  })
})
