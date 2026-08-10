import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Trophy, TrendingUp, Clock, BarChart3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { questions, Question } from '../data/questions'
import { paperById } from '../data/curriculum'
import { getMockResults, clearMockResults } from '../lib/store'
import { MockResultRow } from '../lib/db'
import { MockResultsView, MockResult } from '../components/PracticeSession'
import { RevisionSession } from '../components/RevisionSession'
import { Card, Tappable, Button, IconButton } from '../components/ui'
import { color, border, shadow, font } from '../theme'

const MODE_LABELS: Record<string, string> = { full: 'Full Mock', practice: 'Practice Mock', weak: 'Weak-Area Mock' }

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : `${s}s`
}

export function MockHistory() {
  const nav = useNavigate()
  const [rows, setRows] = useState<MockResultRow[]>([])
  const [open, setOpen] = useState<{ row: MockResultRow; pool: Question[]; result: MockResult } | null>(null)
  const [reviseChapter, setReviseChapter] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getMockResults(50).then((r) => { setRows(r); setLoaded(true) }).catch(() => setLoaded(true))
  }, [])

  const best = useMemo(() => rows.reduce((m, r) => Math.max(m, r.total > 0 ? Math.round((r.score / r.total) * 100) : 0), 0), [rows])
  const avg = useMemo(() => {
    const valid = rows.filter((r) => r.total > 0)
    if (valid.length === 0) return null
    return Math.round(valid.reduce((s, r) => s + (r.score / r.total) * 100, 0) / valid.length)
  }, [rows])

  const openMock = async (row: MockResultRow) => {
    let data: any = null
    try { data = JSON.parse(row.data) } catch { /* corrupt payload — fall back */ }
    if (!data || !Array.isArray(data.poolIds)) return
    const pool = data.poolIds.map((id: string) => questions.find((q) => q.id === id)).filter(Boolean) as Question[]
    if (pool.length === 0) return
    setOpen({
      row,
      pool,
      result: {
        score: row.score,
        total: row.total,
        seconds: row.seconds,
        unanswered: row.unanswered,
        marked: row.marked,
        autoSubmit: !!row.autoSubmit,
        answers: data.answers ?? new Array<number | null>(pool.length).fill(null),
        perQSeconds: data.perQSeconds ?? new Array<number>(pool.length).fill(0),
        markedArr: data.marked ?? new Array<boolean>(pool.length).fill(false),
      },
    })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: color.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 8px' }}>
        <IconButton onClick={() => nav('/practice')} size={36} aria-label="Back"><ArrowLeft size={20} /></IconButton>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 24 }}>Mock History</div>
          <div style={{ color: color.muted, fontSize: 13, fontWeight: 600 }}>Every exam you have taken</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="safe-bottom">
        {!loaded ? (
          <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, padding: 24, textAlign: 'center' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <Card style={{ padding: 28, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 64, height: 64, borderRadius: 14, background: color.primaryTint, color: color.primary, border: border.thick, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trophy size={30} />
            </div>
            <div style={{ fontWeight: 900, fontSize: 17, marginTop: 6 }}>No mocks yet</div>
            <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>
              Take your first mock exam from the Practice screen — you'll get a full analysis here afterwards.
            </div>
            <Button variant="primary" onClick={() => nav('/practice')} style={{ marginTop: 8 }}>Go to Practice</Button>
          </Card>
        ) : (
          <>
            {/* Overview strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <div style={{ background: color.card, border: border.thin, boxShadow: shadow.sm, borderRadius: 10, padding: '12px 6px', textAlign: 'center' }}>
                <div className="mono" style={{ fontWeight: 800, fontSize: 18, color: color.primary, fontFamily: font.mono }}>{rows.length}</div>
                <div style={{ color: color.muted, fontSize: 10, fontWeight: 700 }}>Mocks taken</div>
              </div>
              <div style={{ background: color.card, border: border.thin, boxShadow: shadow.sm, borderRadius: 10, padding: '12px 6px', textAlign: 'center' }}>
                <div className="mono" style={{ fontWeight: 800, fontSize: 18, color: color.success, fontFamily: font.mono }}>{best}%</div>
                <div style={{ color: color.muted, fontSize: 10, fontWeight: 700 }}>Best score</div>
              </div>
              <div style={{ background: color.card, border: border.thin, boxShadow: shadow.sm, borderRadius: 10, padding: '12px 6px', textAlign: 'center' }}>
                <div className="mono" style={{ fontWeight: 800, fontSize: 18, color: avg !== null && avg >= 40 ? color.warning : color.muted, fontFamily: font.mono }}>{avg === null ? '—' : `${avg}%`}</div>
                <div style={{ color: color.muted, fontSize: 10, fontWeight: 700 }}>Average</div>
              </div>
            </div>

            {/* Trend — only when enough history exists */}
            {rows.length >= 2 && (
              <Card style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <TrendingUp size={15} color={color.secondary} />
                  <div style={{ fontWeight: 900, fontSize: 14 }}>Your progress</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {rows.slice(0, 6).reverse().map((r, i) => {
                    const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0
                    const isBest = pct === best
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 26, fontSize: 10, fontWeight: 800, color: color.muted, flexShrink: 0 }}>M{rows.length - (rows.slice(0, 6).reverse().length - 1 - i)}</span>
                        <div style={{ flex: 1, height: 12, background: color.surface, border: border.thin, borderRadius: 6, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: isBest ? color.success : color.primary, transition: 'width 0.3s' }} />
                        </div>
                        <span className="mono" style={{ width: 34, textAlign: 'right', fontSize: 12, fontWeight: 800, fontFamily: font.mono }}>{pct}%</span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ color: color.muted, fontSize: 11, fontWeight: 600, marginTop: 8 }}>Score trend across your last {Math.min(rows.length, 6)} mocks</div>
              </Card>
            )}

            {/* List */}
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>All mocks</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map((r) => {
                const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0
                const attempted = r.total - r.unanswered
                const acc = attempted > 0 ? Math.round((r.score / attempted) * 100) : 0
                const paper = r.paperId ? paperById(r.paperId) : null
                return (
                  <Tappable key={r.id} onClick={() => openMock(r)}
                    style={{ background: color.card, border: border.thin, boxShadow: shadow.sm, borderRadius: 12, padding: 14, width: '100%', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 900, fontSize: 15 }}>{MODE_LABELS[r.mode] ?? 'Mock'}</div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: pct >= 40 ? color.successTint : color.dangerTint, color: pct >= 40 ? color.success : color.danger, border: border.thin, borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 900 }}>
                        <BarChart3 size={13} /> {pct}%
                      </span>
                    </div>
                    <div style={{ color: color.muted, fontSize: 12, fontWeight: 600, marginTop: 3 }}>
                      {paper ? `${paper.code} · ${paper.name}` : 'All subjects'} · {r.level}
                    </div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, fontWeight: 700, color: color.text }}>
                      <span>Score <span className="mono" style={{ fontFamily: font.mono }}>{r.score}/{r.total}</span></span>
                      <span>Accuracy <span className="mono" style={{ fontFamily: font.mono }}>{acc}%</span></span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={12} /> {fmtTime(r.seconds)}</span>
                    </div>
                    <div style={{ color: color.muted, fontSize: 11, fontWeight: 600, marginTop: 6 }}>
                      {fmtDate(r.completedAt)}{r.unanswered > 0 ? ` · ${r.unanswered} unanswered` : ''}{!!r.autoSubmit ? ' · auto-submitted' : ''} — tap for analysis
                    </div>
                  </Tappable>
                )
              })}
            </div>

            {rows.length >= 10 && (
              <div style={{ marginTop: 16 }}>
                <Button variant="ghost" onClick={() => { if (window.confirm('Clear all mock history? This cannot be undone.')) clearMockResults().then(() => setRows([])) }} style={{ width: '100%' }}>
                  Clear history
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {open && (
        <MockResultsView
          pool={open.pool}
          result={open.result}
          subjectLabel={open.row.paperId && paperById(open.row.paperId) ? `${paperById(open.row.paperId)!.code} · ${paperById(open.row.paperId)!.name}` : 'All subjects'}
          termLabel={MODE_LABELS[open.row.mode] ?? 'Mock'}
          onClose={() => setOpen(null)}
          onStartRevision={(chapterId) => setReviseChapter(chapterId)}
        />
      )}
      {reviseChapter !== null && (
        <RevisionSession chapterId={reviseChapter} mode="quick" onClose={() => { setReviseChapter(null); setOpen(null) }} />
      )}
    </div>
  )
}
