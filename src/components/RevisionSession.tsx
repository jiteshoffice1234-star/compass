import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { X, ArrowRight, RotateCcw, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react'
import { useStore } from '../store'
import { chapterById, chaptersForLevel } from '../data/curriculum'
import { questions } from '../data/questions'
import { flashcards } from '../data/flashcards'
import { QuizOverlay } from './QuizOverlay'
import { FlashcardStack } from './FlashcardStack'
import { Button, IconButton } from './ui'
import { computeTargetedSession, computeRevisionAreas, RevisionMode, todayStr } from '../lib/mastery'
import { color, border, shadow, font } from '../theme'

const QUESTION_BY_ID = new Map(questions.map((q) => [q.id, q]))
const CARD_BY_ID = new Map(flashcards.map((c) => [c.id, c]))

const MODE_LABELS: Record<RevisionMode, string> = {
  quick: 'Quick Revision',
  deep: 'Deep Revision',
  wrong: 'Wrong Answers',
  cards: 'Difficult Cards',
  weakest: 'Weakest Area',
}

/**
 * Phase 3 — a targeted revision session for ONE weak area:
 *   1. Questions  — the engine's selected pool (QuizOverlay, recorded normally)
 *   2. Flashcards — the engine's selected cards (SRS graded normally)
 *   3. Summary    — accuracy vs the student's PRIOR accuracy on those same
 *                   questions (improvement), cards reviewed, remaining weak areas.
 * Everything is recorded through the existing store pipeline — no new tables,
 * no competing mastery calculation. Mastery updates automatically because it
 * reads the same qp/srs data the session just wrote.
 */
export function RevisionSession({ chapterId, mode, onClose }: { chapterId: number; mode: RevisionMode; onClose: () => void }) {
  const qp = useStore((s) => s.qp)
  const srs = useStore((s) => s.srs)
  const level = useStore((s) => s.level)
  const progress = useStore((s) => s.progress)
  const [qpBefore] = useState(() => qp) // snapshot taken at session start
  const [phase, setPhase] = useState<'quiz' | 'cards' | 'summary'>('quiz')
  const [round, setRound] = useState(0)
  const [cardReviews, setCardReviews] = useState(0)

  const chapter = chapterById(chapterId)

  // The session FROZES its target at start — recomputing when qp/srs change
  // (which the session itself triggers by recording) would silently swap the
  // question/card set mid-flow and corrupt the summary. "Revise again"
  // explicitly rebuilds a fresh target from the updated data.
  const buildTarget = () =>
    computeTargetedSession(chapterId, mode, new Map(Object.entries(qp)), new Map(Object.entries(srs)), questions, flashcards, todayStr())
  const [target, setTarget] = useState(buildTarget)

  const qPool = useMemo(
    () => target.questionIds.map((id) => QUESTION_BY_ID.get(id)).filter((q): q is NonNullable<typeof q> => !!q),
    [target],
  )
  const cardDeck = useMemo(
    () => target.cardIds.map((id) => CARD_BY_ID.get(id)).filter((c): c is NonNullable<typeof c> => !!c),
    [target],
  )

  // ---- Session stats: this session vs the student's prior accuracy ----
  const stats = useMemo(() => {
    let correct = 0
    let answered = 0
    let prevCorrect = 0
    let prevTotal = 0
    for (const id of target.questionIds) {
      const before = qpBefore[id]
      const now = qp[id]
      if (before && now) {
        const delta = now.correct - before.correct
        if (delta > 0) correct += delta
        if (now.correct !== before.correct || now.wrong !== before.wrong) answered += 1
      } else if (now) {
        answered += 1
        if (now.correct > 0) correct += now.correct
      }
      if (before) {
        prevCorrect += before.correct
        prevTotal += before.correct + before.wrong
      }
    }
    const accuracy = answered > 0 ? correct / answered : null
    const prevAccuracy = prevTotal > 0 ? prevCorrect / prevTotal : null
    const improvement = accuracy !== null && prevAccuracy !== null ? accuracy - prevAccuracy : null
    return { correct, answered, accuracy, prevAccuracy, improvement }
  }, [qp, qpBefore, target, phase])

  // Remaining weak areas (from the SAME mastery engine, after this session).
  const remaining = useMemo(
    () => computeRevisionAreas(level, chaptersForLevel(level), progress, new Map(Object.entries(qp)), new Map(Object.entries(srs)), questions, flashcards, todayStr()),
    [level, progress, qp, srs],
  )
  const stillWeak = useMemo(() => {
    const list = [...(remaining.weakest ? [remaining.weakest] : []), ...remaining.needsRevision]
    return list.slice(0, 3)
  }, [remaining])

  // Nothing to work with in this mode — friendly, never broken.
  if (qPool.length === 0 && cardDeck.length === 0) {
    return (
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        style={{ position: 'absolute', inset: 0, zIndex: 450, background: color.surface, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px' }}>
          <IconButton onClick={onClose} size={36} aria-label="Close"><X size={20} /></IconButton>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{MODE_LABELS[mode]}</div>
          <div style={{ width: 36 }} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <div style={{ fontWeight: 900, fontSize: 18, marginTop: 12 }}>Nothing to revise here</div>
          <div style={{ color: color.muted, fontSize: 13, marginTop: 6, fontWeight: 600, lineHeight: 1.5 }}>
            {mode === 'wrong'
              ? 'You have not missed any questions in this chapter yet — the list fills automatically when you do.'
              : mode === 'cards'
                ? 'No difficult cards in this chapter right now — keep reviewing and struggling cards land here.'
                : 'This chapter has no questions or cards to work with.'}
          </div>
          <Button variant="secondary" onClick={onClose} style={{ marginTop: 20, width: '100%' }}>Close</Button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      style={{ position: 'absolute', inset: 0, zIndex: 450, background: color.surface, display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 8px' }}>
        <IconButton onClick={onClose} size={36} aria-label="Close revision"><X size={20} /></IconButton>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{MODE_LABELS[mode]}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: color.muted }}>Ch {chapterId}: {chapter?.title ?? ''}</div>
        </div>
        <div style={{ width: 36 }} />
      </div>
      {/* progress pills */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '4px 16px 10px' }}>
        {(['quiz', 'cards', 'summary'] as const).map((p, i) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, background: phase === p ? color.secondary : phase === 'summary' && i < 2 ? color.success : color.card, color: phase === p || (phase === 'summary' && i < 2) ? '#fff' : color.muted, border: border.thin }}>
              {phase === 'summary' && i < 2 ? '✓' : i + 1}
            </div>
            {i < 2 && <div style={{ width: 18, height: 2, background: color.card, border: border.thin }} />}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {phase === 'quiz' && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: color.muted, marginBottom: 10 }}>
              PART 1 · QUESTIONS <span style={{ fontWeight: 600 }}>— {qPool.length} targeted</span>
            </div>
            <QuizOverlay
              key={round}
              chapterId={chapterId}
              pool={qPool}
              mode="revision"
              title="Revision"
              onClose={() => (cardDeck.length > 0 ? setPhase('cards') : setPhase('summary'))}
            />
          </div>
        )}

        {phase === 'cards' && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: color.muted, marginBottom: 10 }}>
              PART 2 · FLASHCARDS <span style={{ fontWeight: 600 }}>— {cardDeck.length} targeted</span>
            </div>
            <FlashcardStack chapterId={chapterId} cards={cardDeck} onReview={() => setCardReviews((n) => n + 1)} />
            <Button variant="primary" onClick={() => setPhase('summary')} style={{ width: '100%', marginTop: 16 }}>
              Finish revision <ArrowRight size={18} />
            </Button>
            {cardReviews < cardDeck.length && (
              <div style={{ textAlign: 'center', color: color.muted, fontSize: 11, fontWeight: 600, marginTop: 8 }}>
                {cardReviews}/{cardDeck.length} cards reviewed — you can finish early or keep going.
              </div>
            )}
          </div>
        )}

        {phase === 'summary' && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 100, height: 100, borderRadius: 14, border: border.thick, boxShadow: shadow.md, background: (stats.improvement ?? -1) >= 0 ? color.successTint : color.warningTint }}>
                <CheckCircle2 size={44} color={(stats.improvement ?? -1) >= 0 ? color.success : color.warning} />
              </motion.div>
              <div style={{ fontWeight: 900, fontSize: 22, marginTop: 14 }}>Revision Complete</div>
              <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, marginTop: 4 }}>Ch {chapterId}: {chapter?.title ?? ''}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
              <SummaryBox label="Questions" value={stats.answered > 0 ? `${stats.correct}/${stats.answered}` : '—'} sub={stats.answered > 0 ? 'correct' : 'not answered'} />
              <SummaryBox label="Flashcards" value={`${cardReviews}`} sub={cardDeck.length > 0 ? 'reviewed' : 'none targeted'} />
              <SummaryBox label="Accuracy" value={stats.accuracy === null ? '—' : `${Math.round(stats.accuracy * 100)}%`} sub={stats.prevAccuracy !== null ? `was ${Math.round(stats.prevAccuracy * 100)}%` : 'no prior data'} />
              <SummaryBox
                label="Improvement"
                value={stats.improvement === null ? '—' : `${stats.improvement >= 0 ? '+' : ''}${Math.round(stats.improvement * 100)}%`}
                sub={stats.improvement !== null && stats.improvement >= 0 ? 'better than before' : stats.improvement !== null ? 'still below prior' : 'keep at it'}
                accent={stats.improvement !== null && stats.improvement >= 0 ? color.success : color.warning}
              />
            </div>

            {stats.improvement !== null && stats.improvement >= 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: color.successTint, border: border.thin, borderRadius: 10, padding: 12, marginTop: 14 }}>
                <TrendingUp size={18} color={color.success} />
                <div style={{ fontSize: 13, fontWeight: 700, color: color.success }}>
                  Your accuracy on these questions improved from {Math.round(stats.prevAccuracy! * 100)}% to {Math.round(stats.accuracy! * 100)}% — mastery is being recalculated.
                </div>
              </div>
            )}
            {stats.improvement !== null && stats.improvement < 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: color.warningTint, border: border.thin, borderRadius: 10, padding: 12, marginTop: 14 }}>
                <TrendingDown size={18} color={color.warning} />
                <div style={{ fontSize: 13, fontWeight: 700, color: color.warning }}>
                  A few questions still tripped you up — this chapter stays a priority until you lock it in.
                </div>
              </div>
            )}

            {stillWeak.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Still needs attention</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stillWeak.map((d) => {
                    const c = chapterById(d.chapterId)
                    return (
                      <div key={d.chapterId} style={{ display: 'flex', alignItems: 'center', gap: 8, background: color.card, border: border.thin, borderRadius: 8, padding: '8px 10px' }}>
                        <span style={{ fontSize: 12 }}>🔴</span>
                        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Ch {d.chapterId}: {c?.title ?? ''}</span>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 800, fontFamily: font.mono }}>{d.overall !== null ? Math.round(d.overall * 100) + '%' : '—'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>Done</Button>
              <Button variant="secondary" onClick={() => { setTarget(buildTarget()); setRound((r) => r + 1); setPhase('quiz'); setCardReviews(0) }} style={{ flex: 1 }}>
                <RotateCcw size={16} /> Revise again
              </Button>
            </div>
            <div style={{ textAlign: 'center', color: color.muted, fontSize: 11, fontWeight: 600, marginTop: 12, paddingBottom: 8 }}>
              Results feed the same mastery engine — chapter, paper and priority update automatically.
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function SummaryBox({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div style={{ background: color.card, border: border.thin, borderRadius: 10, padding: 12, textAlign: 'center' }}>
      <div style={{ color: color.muted, fontSize: 11, fontWeight: 800, letterSpacing: 0.6 }}>{label.toUpperCase()}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 900, marginTop: 4, color: accent ?? color.text, fontFamily: font.mono }}>{value}</div>
      <div style={{ color: color.muted, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{sub}</div>
    </div>
  )
}
