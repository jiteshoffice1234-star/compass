import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, AlertTriangle, RotateCcw, Layers, CheckCircle2, Play, BookOpen } from 'lucide-react'
import { useStore } from '../store'
import { chaptersForLevel, chapterById } from '../data/curriculum'
import { questions } from '../data/questions'
import { flashcards } from '../data/flashcards'
import { Card, Tappable, Button, IconButton } from '../components/ui'
import { BottomSheet } from '../components/BottomSheet'
import { FlashcardsDue, FcFilter } from './FlashcardsDue'
import { QuizOverlay } from '../components/QuizOverlay'
import { computeRevisionData, todayStr } from '../lib/mastery'
import { color, border, font } from '../theme'

export function Revision() {
  const nav = useNavigate()
  const level = useStore((s) => s.level)
  const progress = useStore((s) => s.progress)
  const qp = useStore((s) => s.qp)
  const srs = useStore((s) => s.srs)

  const [deckFilter, setDeckFilter] = useState<FcFilter | null>(null)
  const [mistakesOpen, setMistakesOpen] = useState(false)

  const data = useMemo(
    () => computeRevisionData(level, chaptersForLevel(level), progress, new Map(Object.entries(qp)), new Map(Object.entries(srs)), questions, flashcards, todayStr()),
    [level, progress, qp, srs],
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: color.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 8px' }}>
        <IconButton onClick={() => nav(-1)} size={36} aria-label="Go back"><ArrowLeft size={20} /></IconButton>
        <div>
          <div style={{ fontWeight: 900, fontSize: 22 }}>Revision</div>
          <div style={{ color: color.muted, fontSize: 13, fontWeight: 600 }}>Fix what you missed — the engine tracks everything.</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }} className="safe-bottom">
        {/* Due for revision (flashcards) */}
        <Card style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: color.warningTint, color: color.warning, display: 'flex', alignItems: 'center', justifyContent: 'center', border: border.thin, flexShrink: 0 }}><RefreshCw size={20} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Due for Revision</div>
            <div className="mono" style={{ color: color.muted, fontSize: 12, fontWeight: 700, fontFamily: font.mono }}>{data.dueFlashcards.length} flashcards scheduled</div>
          </div>
          <Button variant="secondary" onClick={() => setDeckFilter('due')} style={{ padding: '10px 14px', fontSize: 13 }}>
            <Play size={14} /> Review
          </Button>
        </Card>

        {/* Difficult flashcards */}
        <Card style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: color.dangerTint, color: color.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', border: border.thin, flexShrink: 0 }}><Layers size={20} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Difficult Flashcards</div>
            <div className="mono" style={{ color: color.muted, fontSize: 12, fontWeight: 700, fontFamily: font.mono }}>{data.difficultFlashcards.length} keep tripping you up</div>
          </div>
          <Button variant="ghost" onClick={() => setDeckFilter('difficult')} disabled={data.difficultFlashcards.length === 0} style={{ padding: '10px 14px', fontSize: 13 }}>
            <Play size={14} /> Drill
          </Button>
        </Card>

        {/* Weak topics */}
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: color.dangerTint, color: color.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', border: border.thin, flexShrink: 0 }}><AlertTriangle size={20} /></div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Weak Topics</div>
              <div className="mono" style={{ color: color.muted, fontSize: 12, fontWeight: 700, fontFamily: font.mono }}>{data.weakChapters.length} chapters need attention</div>
            </div>
          </div>
          {data.weakChapters.length === 0 ? (
            <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, background: color.surface, border: border.thin, borderRadius: 8, padding: 12 }}>No weak chapters — keep it up! 🎉</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.weakChapters.slice(0, 5).map((st) => {
                const c = chapterById(st.chapterId)
                if (!c) return null
                return (
                  <Tappable key={st.chapterId} onClick={() => nav(`/chapter/${c.id}?tab=quiz`)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: color.surface, border: border.thin, borderRadius: 8, padding: 10, width: '100%', textAlign: 'left' }}>
                    <BookOpen size={15} color={color.danger} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ch {c.id}: {c.title}</div>
                      <div style={{ color: color.muted, fontSize: 11, fontWeight: 600 }}>{st.overall !== null ? `${Math.round(st.overall * 100)}% mastery` : 'Not started'} · {st.weakQuestions} weak Qs</div>
                    </div>
                    <Play size={14} color={color.danger} />
                  </Tappable>
                )
              })}
            </div>
          )}
        </Card>

        {/* Wrong questions */}
        <Card style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: color.warningTint, color: color.warning, display: 'flex', alignItems: 'center', justifyContent: 'center', border: border.thin, flexShrink: 0 }}><RotateCcw size={20} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Wrong Questions</div>
            <div className="mono" style={{ color: color.muted, fontSize: 12, fontWeight: 700, fontFamily: font.mono }}>{data.previousMistakes.length} in your history</div>
          </div>
          <Button variant="danger" onClick={() => setMistakesOpen(true)} disabled={data.previousMistakes.length === 0} style={{ padding: '10px 14px', fontSize: 13 }}>
            <Play size={14} /> Retry
          </Button>
        </Card>

        {/* Recently completed */}
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: color.successTint, color: color.success, display: 'flex', alignItems: 'center', justifyContent: 'center', border: border.thin, flexShrink: 0 }}><CheckCircle2 size={20} /></div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Recently Completed</div>
              <div className="mono" style={{ color: color.muted, fontSize: 12, fontWeight: 700, fontFamily: font.mono }}>{data.recentlyCompleted.length} in the last 7 days</div>
            </div>
          </div>
          {data.recentlyCompleted.length === 0 ? (
            <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, background: color.surface, border: border.thin, borderRadius: 8, padding: 12 }}>Chapters you complete appear here for a quick re-check.</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {data.recentlyCompleted.map((c) => (
                <Tappable key={c.id} onClick={() => nav(`/chapter/${c.id}`)} style={{ flexShrink: 0, background: color.surface, border: border.thin, borderRadius: 8, padding: '8px 12px' }}>
                  <div className="mono" style={{ fontSize: 11, color: color.success, fontWeight: 800, fontFamily: font.mono }}>CH {c.id}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                </Tappable>
              ))}
            </div>
          )}
        </Card>

        <div style={{ textAlign: 'center', color: color.muted, fontSize: 11, fontWeight: 600, padding: '4px 0 12px' }}>
          Every section is built from your real quiz + flashcard history — fully offline.
        </div>
      </div>

      <BottomSheet open={deckFilter !== null} onClose={() => setDeckFilter(null)} title={deckFilter === 'difficult' ? 'Difficult Flashcards' : 'Due for Revision'}>
        <FlashcardsDue key={deckFilter ?? 'none'} initialFilter={deckFilter ?? 'due'} />
      </BottomSheet>

      {mistakesOpen && (
        <QuizOverlay
          pool={questions}
          mode="mistakes"
          title="Previous Mistakes"
          onClose={() => setMistakesOpen(false)}
        />
      )}
    </div>
  )
}
