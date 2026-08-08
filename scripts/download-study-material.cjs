/**
 * Downloads the official ICMAI study books listed in study-manifest.json into
 * public/study/ so Vite bundles them into the web build and (via `cap sync`)
 * into the APK — giving the app a fully OFFLINE copy of the study material.
 *
 * Run:  node scripts/download-study-material.cjs
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

const manifest = require('./study-manifest.json')
const outDir = path.join(__dirname, '..', 'public', 'study')

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Compass-App)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return download(new URL(res.headers.location, url).toString(), dest).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(120000, () => req.destroy(new Error('Timeout')))
  })
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  let ok = 0
  let failed = []
  let totalBytes = 0

  // sequential to be gentle on the CDN and avoid spurious failures
  for (const doc of manifest.docs) {
    const dest = path.join(outDir, doc.file)
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100000) {
      const mb = (fs.statSync(dest).size / 1048576).toFixed(1)
      totalBytes += fs.statSync(dest).size
      ok++
      console.log(`SKIP (exists) ${doc.file} (${mb} MB)`)
      continue
    }
    try {
      await download(doc.url, dest)
      const mb = (fs.statSync(dest).size / 1048576).toFixed(1)
      totalBytes += fs.statSync(dest).size
      ok++
      console.log(`OK   ${doc.file} (${mb} MB)`)
    } catch (e) {
      failed.push(`${doc.file} — ${e.message}`)
      console.log(`FAIL ${doc.file} — ${e.message}`)
    }
  }

  console.log(`\nDownloaded ${ok}/${manifest.docs.length} | total ${(totalBytes / 1048576).toFixed(0)} MB`)
  if (failed.length) {
    console.log('Failures:')
    failed.forEach((f) => console.log('  - ' + f))
    process.exitCode = 1
  }
}

main()
