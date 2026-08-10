// Runs scripts/validate-banks.ts through Vite's SSR resolver (handles
// extensionless imports in the data files). Usage: node scripts/run-validate.mjs
import { createServer } from 'vite'
import { resolve } from 'node:path'

const server = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  logLevel: 'error',
})

try {
  const mod = await server.ssrLoadModule(resolve('scripts/validate-banks.ts'))
  if (mod && typeof mod === 'object' && Object.keys(mod).length === 0) {
    // module ran top-level; nothing to do
  }
} catch (e) {
  console.error('Validation failed:', e)
  process.exit(1)
} finally {
  await server.close()
}
