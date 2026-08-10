import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, AlertTriangle, RotateCcw, Layers, CheckCircle2, Play, BookOpen, Zap, History } from 'lucide-react'
import { useStore } from '../store'
import { chaptersForLevel, chapterById } from '../data/curriculum'
import { questions } from '../data/questions'
import { flashcards } from '../data/flashcards'
import { getRecentQuizSessions } from '../lib/store'
import { Card, Tappable, Button, IconButton } from '../components/ui'
import { BottomSheet } from '../components/BottomSheet'
import { FlashcardsDue, FcFilter } from './FlashcardsDue'
import { QuizOverlay } from '../components/QuizOverlay'
import { RevisionSession } from '../components/RevisionSession'
import { computeRevisionAreas, computeRevisionData, RevisionMode, todayStr } from '../lib/mastery'
import type { QuizSessionRow } from '../lib/db'
import { color, border, shadow, font } from '../theme'

// Static chapter content sizes (for estimated session sizes without scanning).
const QS_PER_CHAPTER = new Map<number, number>()
for (const q of questions) QS_PER_CHAPTER.set(q.chapterId, (QS_PER_CHAPTER.get(q.chapterId) ?? 0) + 1)
const CARDS_PER_CHAPTER = new Map<number, number>()
for (const c of flashcards) CARDS_PER_CHAPTER.set(c.chapterId, (CARDS_PER_CHAPTER.get(c.chapterId) ?? 0) + 1)

const MODE_CHIPS: { mode: RevisionMode; label: string }[] = [
  { mode: 'quick', label: 'Quick' },
  { mode: 'deep', label: 'Deep' },
  { mode: 'wrong', label: 'Wrong answers' },
  { mode: 'cards', label: 'Difficult cards' },
]

export function Revision() {
  const nav = useNavigate()
  const level = useStore((s) => s.level)
  const progress = useStore((s) => s.progress)
  const qp = useStore((s) => s.qp)
  const srs = useStore((s) => s.srs)

  const [session, setSession] = useState<{ chapterId: number; mode: RevisionMode } | null>(null)
  const [deckFilter, setDeckFilter] = useState<FcFilter | null>(null)
  const [mistakesOpen, setMistakesOpen] = useState(false)
  const [history, setHistory] = useState<QuizSessionRow[]>([])

  const data = useMemo(
    () => computeRevisionData(level, chaptersForLevel(level), progress, new Map(Object.entries(qp)), new Map(Object.entries(srs)), questions, flashcards, todayStr()),
    [level, progress, qp, srs],
  )
  const areas = useMemo(
    () => computeRevisionAreas(level, chaptersForLevel(level), progress, new Map(Object.entries(qp)), new Map(Object.entries(srs)), questions, flashcards, todayStr()),
    [level, progress, qp, srs],
  )

  useEffect(() => {
    let cancelled = false
    getRecentQuizSessions(12).then((rows) => {
      if (!cancelled) setHistory(rows.filter((r) => r.mode === 'revision' || r.mode === 'weak' || r.mode === 'mistakes'))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [level, qp, srs])

  const weakest = areas.weakest
  const weakestChapter = weakest ? chapterById(weakest.chapterId) : null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: color.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 8px' }}>
        <IconButton onClick={() => nav(-1)} size={36} aria-label="Go back"><ArrowLeft size={20} /></IconButton>
        <div>
          <div style={{ fontWeight: 900, fontSize: 22 }}>Revision</div>
          <div style={{ color: color.muted, fontSize: 13, fontWeight: 600 }}>Compass builds your session — you just press start.</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }} className="safe-bottom">
        {/* ===== 🔴 HIGHEST PRIORITY ===== */}
        {weakest && weakestChapter ? (
          <Card style={{ padding: 18, background: color.dangerTint, border: border.thick, boxShadow: shadow.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={16} color={color.danger} />
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: color.danger }}>HIGHEST PRIORITY</div>
            </div>
            <div style={{ fontWeight: 900, fontSize: 19, marginTop: 8 }}>Ch {weakestChapter.id}: {weakestChapter.title}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <PriorityStat label="Mastery" value={weakest.overall === null ? '—' : `${Math.round(weakest.overall * 100)}%`} />
              <PriorityStat label="Accuracy" value={weakest.accuracy === null ? '—' : `${Math.round(weakest.accuracy * 100)}%`} />
              <PriorityStat label="Session" value={`${Math.min(10, QS_PER_CHAPTER.get(weakest.chapterId) ?? 10)} Q · ${Math.min(5, CARDS_PER_CHAPTER.get(weakest.chapterId) ?? 5)} C`} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              <ReasonChip>{weakest.mistakes} repeated mistake{weakest.mistakes === 1 ? '' : 's'}</ReasonChip>
              <ReasonChip>{weakest.difficultCards} difficult card{weakest.difficultCards === 1 ? '' : 's'}</ReasonChip>
              <ReasonChip>{weakest.dueCards} card{weakest.dueCards === 1 ? '' : 's'} due</ReasonChip>
            </div>
            <Button variant="danger" onClick={() => setSession({ chapterId: weakest.chapterId, mode: 'quick' })} style={{ width: '100%', marginTop: 14 }}>
              <Play size={18} /> START REVISION
            </Button>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {MODE_CHIPS.map((m) => (
                <Tappable key={m.mode} onClick={() => setSession({ chapterId: weakest.chapterId, mode: m.mode })}
                  style={{ flex: 1, textAlign: 'center', padding: '9px 0', background: color.card, border: border.thin, borderRadius: 8, fontWeight: 800, fontSize: 12 }}>
                  {m.label}
                </Tappable>
              ))}
            </div>
          </Card>
        ) : (
          <Card style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 34 }}>🧭</div>
            <div style={{ fontWeight: 900, fontSize: 16, marginTop: 8 }}>No priority yet</div>
            <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.5 }}>
              Complete a quiz or review a flashcard first — the engine tracks every wrong answer and difficult card,
              then targeted revision builds itself from your real mistakes. New chapters are never treated as weak.
            </div>
            <Button variant="secondary" onClick={() => nav('/chapters')} style={{ width: '100%', marginTop: 14 }}>Pick a chapter</Button>
          </Card>
        )}

        {/* ===== Quick access ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <QuickCard icon={<RefreshCw size={15} color={color.warning} />} label="Due cards" value={data.dueFlashcards.length} onClick={() => setDeckFilter('due')} disabled={data.dueFlashcards.length === 0} />
          <QuickCard icon={<Layers size={15} color={color.danger} />} label="Difficult" value={data.difficultFlashcards.length} onClick={() => setDeckFilter('difficult')} disabled={data.difficultFlashcards.length === 0} />
          <QuickCard icon={<RotateCcw size={15} color={color.secondary} />} label="Wrong Qs" value={data.previousMistakes.length} onClick={() => setMistakesOpen(true)} disabled={data.previousMistakes.length === 0} />
        </div>

        {/* ===== 🟡 NEEDS REVISION ===== */}
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={17} color={color.warning} />
            <div style={{ fontWeight: 900, fontSize: 15 }}>Needs Revision</div>
            <span className="mono" style={{ color: color.muted, fontSize: 12, fontWeight: 700, fontFamily: font.mono }}>{areas.needsRevision.length}</span>
          </div>
          {areas.needsRevision.length === 0 ? (
            <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, background: color.surface, border: border.thin, borderRadius: 8, padding: 12 }}>
              {weakest ? 'Only one weak area right now — it is handled above.' : 'No weak chapters — keep it up! 🎉'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {areas.needsRevision.slice(0, 5).map((d) => {
                const c = chapterById(d.chapterId)
                if (!c) return null
                return (
                  <Tappable key={d.chapterId} onClick={() => setSession({ chapterId: d.chapterId, mode: 'quick' })} style={{ display: 'flex', alignItems: 'center', gap: 10, background: color.surface, border: border.thin, borderRadius: 8, padding: 10, width: '100%', textAlign: 'left' }}>
                    <BookOpen size={15} color={color.warning} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ch {c.id}: {c.title}</div>
                      <div style={{ color: color.muted, fontSize: 11, fontWeight: 600 }}>
                        {d.overall !== null ? `${Math.round(d.overall * 100)}% mastery` : '—'} · {d.mistakes} mistakes · {d.difficultCards} difficult cards
                      </div>
                    </div>
                    <span className="mono" style={{ fontSize: 10, fontWeight: 800, color: color.muted, fontFamily: font.mono }}>
                      {Math.min(10, QS_PER_CHAPTER.get(d.chapterId) ?? 10)}Q
                    </span>
                    <span style={{ background: color.warning, color: color.text, borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 800 }}>START</span>
                  </Tappable>
                )
              })}
            </div>
          )}
        </Card>

        {/* ===== 🟢 IMPROVING ===== */}
        {areas.improving.length > 0 && (
          <Card style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <CheckCircle2 size={17} color={color.success} />
              <div style={{ fontWeight: 900, fontSize: 15 }}>Improving</div>
              <span className="mono" style={{ color: color.muted, fontSize: 12, fontWeight: 700, fontFamily: font.mono }}>recent revision is working</span>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {areas.improving.slice(0, 8).map((d) => {
                const c = chapterById(d.chapterId)
                return (
                  <Tappable key={d.chapterId} onClick={() => nav(`/chapter/${d.chapterId}`)} style={{ flexShrink: 0, background: color.surface, border: border.thin, borderRadius: 8, padding: '8px 12px' }}>
                    <div className="mono" style={{ fontSize: 11, color: color.success, fontWeight: 800, fontFamily: font.mono }}>CH {d.chapterId} · {d.recentAccuracy !== null ? Math.round(d.recentAccuracy * 100) + '% recent' : ''}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, maxWidth: 130, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c?.title ?? ''}</div>
                  </Tappable>
                )
              })}
            </div>
          </Card>
        )}

        {/* ===== Recently completed ===== */}
        {data.recentlyCompleted.length > 0 && (
          <Card style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <CheckCircle2 size={17} color={color.success} />
              <div style={{ fontWeight: 900, fontSize: 15 }}>Recently Completed</div>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {data.recentlyCompleted.map((c) => (
                <Tappable key={c.id} onClick={() => nav(`/chapter/${c.id}`)} style={{ flexShrink: 0, background: color.surface, border: border.thin, borderRadius: 8, padding: '8px 12px' }}>
                  <div className="mono" style={{ fontSize: 11, color: color.success, fontWeight: 800, fontFamily: font.mono }}>CH {c.id}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                </Tappable>
              ))}
            </div>
          </Card>
        )}

        {/* ===== Revision history ===== */}
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <History size={17} color={color.secondary} />
            <div style={{ fontWeight: 900, fontSize: 15 }}>Revision History</div>
          </div>
          {history.length === 0 ? (
            <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, background: color.surface, border: border.thin, borderRadius: 8, padding: 12 }}>
              No revision sessions yet — start one above and it lands here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.slice(0, 8).map((s, i) => {
                const c = s.chapter_id ? chapterById(s.chapter_id) : null
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: color.surface, border: border.thin, borderRadius: 8, padding: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800 }}>{historyLabel(s.mode)}{c ? ` · Ch ${c.id}` : ''}</div>
                      <div style={{ color: color.muted, fontSize: 11, fontWeight: 600 }}>
                        {new Date(s.completed_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: color.muted, fontFamily: font.mono }}>{s.score}/{s.total}</span>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: s.total > 0 && s.score / s.total >= 0.6 ? color.success : color.warning, fontFamily: font.mono }}>
                      {Math.round(((s.total || 1) > 0 ? s.score / s.total : 0) * 100)}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <div style={{ textAlign: 'center', color: color.muted, fontSize: 11, fontWeight: 600, padding: '4px 0 12px' }}>
          Every session is built from your real quiz + flashcard history — fully offline.
        </div>
      </div>

      <BottomSheet open={deckFilter !== null} onClose={() => setDeckFilter(null)} title={deckFilter === 'difficult' ? 'Difficult Flashcards' : 'Due for Revision'}>
        <FlashcardsDue key={deckFilter ?? 'none'} initialFilter={deckFilter ?? 'due'} />
      </BottomSheet>

      {mistakesOpen && (
        <QuizOverlay pool={questions} mode="mistakes" title="Previous Mistakes" onClose={() => setMistakesOpen(false)} />
      )}

      {session && (
        <RevisionSession chapterId={session.chapterId} mode={session.mode} onClose={() => setSession(null)} />
      )}
    </div>
  )
}

function PriorityStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: color.card, border: border.thin, borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
      <div className="mono" style={{ fontWeight: 800, fontSize: 14, fontFamily: font.mono }}>{value}</div>
      <div style={{ color: color.muted, fontSize: 10, marginTop: 2, fontWeight: 700 }}>{label}</div>
    </div>
  )
}

function ReasonChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, background: color.card, border: border.thin, borderRadius: 6, padding: '3px 8px' }}>{children}</span>
  )
}

function QuickCard({ icon, label, value, onClick, disabled }: { icon: React.ReactNode; label: string; value: number; onClick: () => void; disabled: boolean }) {
  return (
    <Tappable onClick={onClick} disabled={disabled}
      style={{ background: color.card, border: border.thin, borderRadius: 10, boxShadow: shadow.sm, padding: 12, textAlign: 'center', opacity: disabled ? 0.5 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>{icon}<span className="mono" style={{ fontWeight: 800, fontSize: 14, fontFamily: font.mono }}>{value}</span></div>
      <div style={{ color: color.muted, fontSize: 11, marginTop: 4, fontWeight: 700 }}>{label}</div>
    </Tappable>
  )
}

function historyLabel(mode: string): string {
  const map: Record<string, string> = { revision: 'Revision', weak: 'Weak Questions', mistakes: 'Previous Mistakes' }
  return map[mode] ?? 'Revision'
}
