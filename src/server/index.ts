// src/server/index.ts
import { parseArgs } from 'util'
import compression from 'compression'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { router } from './api.ts'
import { startScanner } from './scanner.ts'
import { rateLimiter } from './universalis.ts'

const { values } = parseArgs({
  options: {
    'rate-limit': { type: 'string', short: 'r' },
  },
  strict: false,
})

if (values['rate-limit']) {
  const rate = Number(values['rate-limit'])
  if (isNaN(rate) || rate < 1 || rate > 25) {
    console.error('[server] --rate-limit must be between 1 and 25')
    process.exit(1)
  }
  rateLimiter.setRate(rate)
  console.log(`[server] Rate limit set to ${rate} req/s`)
}

const app = express()
const PORT = process.env['PORT'] ?? 3000

app.use(compression())
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
