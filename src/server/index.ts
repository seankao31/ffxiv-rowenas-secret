// src/server/index.ts
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { router } from './api.ts'
import { startScanner } from './scanner.ts'

const app = express()
const PORT = process.env['PORT'] ?? 3000

app.use('/api', router)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, '../../dist/client')
app.use(express.static(clientDist))

// SPA fallback for client-side routing (Express 5 requires named wildcard)
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`)
})

startScanner().catch(err => {
  console.error('[server] Scanner crashed:', err)
  process.exit(1)
})
