import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { IconButton } from '../components/ui'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem } from '@capacitor/filesystem'
import { Loader } from '../components/Loader'
import { color, border } from '../theme'

// Use the legacy build (no ES module worker complications) and the bundled worker.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

// Bundled study material lives in the app root (e.g. 'study/P13_new.pdf'). The
// browser URL can carry a path (deep links, dev server), so a bare relative
// fetch would resolve against THAT path and get the SPA fallback (HTML)
// instead of the PDF. Resolve relative srcs against the app root instead:
//  - web / Capacitor local server: origin root
//  - OTA file:// bundle: the directory next to index.html (PDFs ship in the zip)
function resolveSrc(src: string): string {
  if (/^(https?:|file:|blob:|data:)/i.test(src)) return src
  const href = window.location.href
  if (window.location.protocol === 'file:') {
    return href.slice(0, href.lastIndexOf('/') + 1) + src
  }
  return window.location.origin + '/' + src
}

// Render scale for page canvases. Books render hundreds of pages, so keep the
// canvases modest: 1.4 on the crisp side, plenty readable at phone width.
const RENDER_SCALE = 1.4

export function PdfViewer() {
  const loc = useLocation()
  const nav = useNavigate()
  const params = new URLSearchParams(loc.search)
  const src = params.get('src') || ''
  const title = params.get('title') || 'PDF'

  const [pageCount, setPageCount] = useState(0)
  const [pages, setPages] = useState<Record<number, string>>({}) // pageNum -> dataURL
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const workerRef = useRef<{ worker: Worker; url: string } | null>(null)
  const pendingRef = useRef<Set<number>>(new Set())

  // Parse the PDF once per src.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        setPages({})
        setPageCount(0)
        // Load the pdfjs worker through a blob URL. Module workers created
        // directly from a bundled asset URL can be blocked in some WebViews
        // (leaving the render pipeline silently stalled); blob workers work
        // everywhere and the CSP already allows worker-src blob:.
        // Terminate any previous worker first (one per viewer session).
        if (workerRef.current) {
          try { workerRef.current.worker.terminate() } catch { /* noop */ }
          URL.revokeObjectURL(workerRef.current.url)
          workerRef.current = null
        }
        try {
          const workerBlob = await (await fetch(workerSrc)).blob()
          const workerUrl = URL.createObjectURL(workerBlob)
          const worker = new Worker(workerUrl, { type: 'module' })
          workerRef.current = { worker, url: workerUrl }
          pdfjsLib.GlobalWorkerOptions.workerPort = worker
        } catch {
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc
        }

        const abs = resolveSrc(src)
        let data: Uint8Array
        if (Capacitor.isNativePlatform() && abs.startsWith('file://')) {
          // Filesystem.readFile expects a path, not a file:// URI — strip the scheme.
          // (WebView blocks fetch() of file:// URLs from file:// documents.)
          const path = abs.replace(/^file:\/\//, '')
          const res = await Filesystem.readFile({ path })
          const b64 = typeof res.data === 'string' ? res.data : ''
          data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        } else if (Capacitor.isNativePlatform() && /^https?:\/\//.test(abs)) {
          // Native HTTP bypasses the CORS restrictions the ICMAI CDN places on
          // WebView fetches — without this the official PDFs never opened.
          const res = await CapacitorHttp.get({ url: abs, responseType: 'arraybuffer', connectTimeout: 60000, readTimeout: 120000 })
          if (!res || res.status < 200 || res.status >= 300) {
            throw new Error(`Failed to fetch PDF (HTTP ${res?.status ?? 'unknown'})`)
          }
          const raw = res?.data
          if (!raw) throw new Error('Failed to fetch PDF (empty response)')
          if (typeof raw === 'string') data = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
          else data = new Uint8Array(raw)
        } else {
          const resp = await fetch(abs)
          if (!resp.ok) throw new Error(`Failed to fetch PDF (HTTP ${resp.status})`)
          data = new Uint8Array(await resp.arrayBuffer())
        }

        // Dispose any previous document (big books hold a lot of memory).
        if (docRef.current) { try { docRef.current.destroy() } catch { /* noop */ } }
        const doc = await pdfjsLib.getDocument({ data }).promise
        docRef.current = doc
        if (cancelled) { doc.destroy(); return }
        setPageCount(doc.numPages)
        setLoading(false)
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to render PDF')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [src])

  // Render a page to a dataURL and store it.
  const renderPage = useCallback(async (num: number) => {
    const doc = docRef.current
    if (!doc || num < 1 || num > pageCount) return
    if (pendingRef.current.has(num)) return
    pendingRef.current.add(num)
    try {
      const page = await doc.getPage(num)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      await page.render({ canvasContext: ctx, viewport }).promise
      setPages((prev) => ({ ...prev, [num]: canvas.toDataURL('image/png') }))
      page.cleanup()
    } catch {
      // Skip unrenderable page rather than killing the reader.
    } finally {
      pendingRef.current.delete(num)
    }
  }, [pageCount])

  // Lazy-render: only pages near the viewport are rasterised, so opening a
  // 300+ page official book is instant and memory stays bounded.
  useEffect(() => {
    if (pageCount === 0) return
    const root = scrollRef.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue
          const num = Number((en.target as HTMLElement).dataset.page)
          if (!num) continue
          renderPage(num)
          // Prefetch the next two pages so flipping never shows a blank.
          renderPage(num + 1)
          renderPage(num + 2)
        }
      },
      { root, rootMargin: '1200px 0px' },
    )
    const placeholders = root.querySelectorAll('[data-page]')
    placeholders.forEach((el) => io.observe(el))
    // Start the first visible pages immediately (observer may fire late on mount).
    renderPage(1)
    renderPage(2)
    renderPage(3)
    return () => io.disconnect()
  }, [pageCount, renderPage])

  // Dispose the parsed document + worker when leaving the viewer.
  useEffect(() => () => {
    if (docRef.current) { try { docRef.current.destroy() } catch { /* noop */ } }
    if (workerRef.current) {
      try { workerRef.current.worker.terminate() } catch { /* noop */ }
      URL.revokeObjectURL(workerRef.current.url)
      workerRef.current = null
    }
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: color.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 8px' }}>
        <IconButton onClick={() => nav(-1)} size={36}><ArrowLeft size={20} /></IconButton>
        <div style={{ fontWeight: 800, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {pageCount > 0 && (
          <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: color.muted, fontFamily: 'monospace' }}>{Object.keys(pages).length}/{pageCount}</div>
        )}
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, background: color.text }}>
        {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader size={48} /></div>}
        {error && <div style={{ color: '#fff', textAlign: 'center', padding: 40, fontSize: 14, fontWeight: 600 }}>{error}</div>}
        {!loading && !error && pageCount === 0 && (
          <div style={{ color: '#fff', textAlign: 'center', padding: 40, fontSize: 14, fontWeight: 600 }}>No pages</div>
        )}
        {!loading && !error && pageCount > 0 &&
          Array.from({ length: pageCount }, (_, i) => i + 1).map((num) => {
            const img = pages[num]
            return (
              <div key={num} data-page={num} style={{ marginBottom: 12 }}>
                {img ? (
                  <img src={img} style={{ width: '100%', border: border.thin, boxShadow: '4px 4px 0 rgba(0,0,0,0.6)', display: 'block' }} alt={`Page ${num}`} />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '1 / 1.414', background: 'rgba(255,255,255,0.08)', border: '1px dashed rgba(255,255,255,0.25)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader size={26} />
                  </div>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}
