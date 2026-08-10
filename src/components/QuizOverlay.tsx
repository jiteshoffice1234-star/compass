import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, X as XIcon, Star, ArrowRight, Clock, RotateCcw } from 'lucide-react'
import { useStore } from '../store'
import { questions as allQuestions } from '../data/questions'
import { EXPLANATIONS } from '../data/explanations'
import { useQuizSession, QUIZ_LENGTH, passMarkFor } from '../hooks/useQuizSession'
import { difficultyOf, isWeakQuestion, isPreviousMistake, XP } from '../lib/mastery'
import { Tappable, Button, IconButton } from '../components/ui'
import { Confetti } from '../components/Confetti'
import { impactLight, notificationSuccess } from '../lib/haptics'
import { color, border, shadow, font } from '../theme'

export type QuizMode = 'chapter' | 'chapter_test' | 'weak' | 'mistakes' | 'timed' | 'practice' | 'revision'
export type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard'

interface QuizOverlayProps {
  chapterId?: number
  pool?: typeof allQuestions
  mode?: QuizMode
  difficulty?: DifficultyFilter
  timed?: number | null
  title?: string
  onClose: () => void
}

export function QuizOverlay({ chapterId, pool, mode = 'chapter', difficulty = 'all', timed = null, title, onClose }: QuizOverlayProps) {
  const recordQuizSessionResult = useStore((s) => s.recordQuizSessionResult)
  const qp = useStore((s) => s.qp)

  // The base pool for this screen (chapter-scoped or supplied), memoized so the
  // deck NEVER re-shuffles mid-session (the reported "options change on tap" bug).
  const basePool = useMemo(
    () => (pool ? pool : chapterId ? allQuestions.filter((q) => q.chapterId === chapterId) : []),
    [pool, chapterId],
  )

  // Mode + difficulty filters applied to the base pool BEFORE the session draws.
  const filteredPool = useMemo(() => {
    let list = basePool
    if (mode === 'weak') list = list.filter((q) => isWeakQuestion(qp[q.id] ?? null))
    if (mode === 'mistakes') {
      list = list.filter((q) => isPreviousMistake(qp[q.id] ?? null))
        .sort((a, b) => ((qp[b.id]?.last_seen ?? '').localeCompare(qp[a.id]?.last_seen ?? '')))
    }
    if (difficulty !== 'all') list = list.filter((q) => difficultyOf(qp[q.id] ?? null) === difficulty)
    return list
  }, [basePool, mode, difficulty, qp])

  // Wrong-question retry deck (built from the finished session's misses).
  const [retryPool, setRetryPool] = useState<typeof allQuestions | null>(null)
  const activePool = retryPool ?? filteredPool

  const quizLength = useMemo(() => {
    if (mode === 'chapter_test' || mode === 'revision') return Math.max(activePool.length, 1)
    if (mode === 'weak' || mode === 'mistakes') return Math.min(20, Math.max(activePool.length, 1))
    return Math.min(QUIZ_LENGTH, Math.max(activePool.length, 1))
  }, [activePool.length, mode])

  const { current, idx, selected, answered, finished, total, timeLeft, timed: isTimed, score: liveScore, choose, next, getResults, restart } =
    useQuizSession(activePool, quizLength, { timedSeconds: timed })
  const [confetti, setConfetti] = useState(false)

  useEffect(() => {
    if (finished) {
      const { score, perfect, attempts, seconds } = getResults()
      // A retry-wrong session is revision work (weak XP + revision counters).
      const recordedMode = retryPool ? 'mistakes' : mode === 'timed' ? 'timed' : mode
      recordQuizSessionResult({
        chapterId: chapterId ?? null,
        mode: recordedMode,
        score,
        total: attempts.length,
        perfect,
        attempts,
        seconds,
      })
      if (perfect) notificationSuccess()
      const { passed } = getResults()
      if (passed) setConfetti(true)
    }
  }, [finished])

  const { score, passed, perfect, attempts } = finished ? getResults() : { score: 0, passed: false, perfect: false, attempts: [] as { q: string; correct: boolean }[] }

  const wrongIds = attempts.filter((a) => !a.correct).map((a) => a.q)
  const modeLabel = title ?? (mode === 'chapter_test' ? 'Full Chapter Test' : mode === 'weak' ? 'Weak Questions' : mode === 'mistakes' ? 'Previous Mistakes' : mode === 'timed' ? 'Timed Quiz' : 'Quiz')

  // Visible difficulty tracking — how hard THIS question is for THIS student.
  const currentDiff = current ? difficultyOf(qp[current.id] ?? null) : 'medium'
  const diffChip = {
    easy: { label: 'EASY FOR YOU', bg: color.successTint, fg: color.success },
    medium: { label: 'MEDIUM FOR YOU', bg: color.secondaryTint, fg: color.secondary },
    hard: { label: 'HARD FOR YOU', bg: color.dangerTint, fg: color.danger },
  }[currentDiff]

  const retryWrong = useCallback(() => {
    if (!wrongIds.length) return
    const missPool = allQuestions.filter((q) => wrongIds.includes(q.id))
    setRetryPool(missPool)
    restart()
  }, [wrongIds, restart])

  // Nothing to drill (e.g. no weak questions right now) — friendly empty state.
  if (activePool.length === 0 && !finished) {
    return (
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        style={{ position: 'absolute', inset: 0, zIndex: 450, background: color.surface, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px' }}>
          <IconButton onClick={onClose} size={36} aria-label="Close quiz"><X size={20} /></IconButton>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{modeLabel}</div>
          <div style={{ width: 36 }} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <div style={{ fontWeight: 900, fontSize: 18, marginTop: 12 }}>{mode === 'weak' ? 'No weak questions right now' : 'Nothing to revisit — you are all caught up!'}</div>
          <div style={{ color: color.muted, fontSize: 13, marginTop: 6, fontWeight: 600, lineHeight: 1.5 }}>
            {mode === 'weak'
              ? 'The engine tracks every wrong answer. Once a question trips you up, it lands here for revision.'
              : 'Questions you answer wrong appear here automatically. Keep studying and this list will fill with useful revision.'}
          </div>
          <Button variant="secondary" onClick={onClose} style={{ marginTop: 20, width: '100%' }}>Close</Button>
        </div>
      </motion.div>
    )
  }

  const explanation = current ? EXPLANATIONS[current.id] : undefined

  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      style={{ position: 'absolute', inset: 0, zIndex: 450, background: color.surface, display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px' }}>
        <IconButton onClick={onClose} size={36} aria-label="Close quiz"><X size={20} /></IconButton>
        {!finished && <div className="mono" style={{ fontSize: 15, fontWeight: 800, fontFamily: font.mono }}>{idx + 1} / {total}</div>}
        {!finished && isTimed ? (
          <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 14, color: timeLeft <= 5 ? color.danger : color.text, fontFamily: font.mono }}>
            <Clock size={15} /> {timeLeft}s
          </div>
        ) : <div style={{ width: 36 }} />}
      </div>
      {!finished && (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, color: color.muted }}>{modeLabel.toUpperCase()}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: color.muted }}>{liveScore} ✓</div>
          </div>
          <div style={{ height: 12, background: color.card, border: border.thin, borderRadius: 6, overflow: 'hidden' }}>
            <motion.div animate={{ width: `${(idx / total) * 100}%` }} style={{ height: '100%', background: color.secondary }} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {!finished && current && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, padding: '3px 8px', borderRadius: 6, border: border.thin, background: diffChip.bg, color: diffChip.fg }}>
                {diffChip.label}
              </div>
              {EXPLANATIONS[current.id] && <div style={{ fontSize: 11, fontWeight: 700, color: color.muted }}>EXPLAINED ✓</div>}
            </div>
            <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.4, marginBottom: 20 }}>{current.question}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {current.options.map((opt, i) => {
                const isCorrect = i === current.correctIndex
                const isSel = selected === i
                let bg: string = color.card, brd: string = border.thin
                if (answered) {
                  if (isCorrect) { bg = color.successTint; brd = `3px solid ${color.success}` }
                  else if (isSel) { bg = color.dangerTint; brd = `3px solid ${color.danger}` }
                }
                return (
                  <Tappable key={i} onClick={() => { impactLight(); choose(i) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, background: bg, border: brd, borderRadius: 10, boxShadow: answered && !isCorrect && !isSel ? 'none' : shadow.sm, padding: 14, width: '100%', color: color.text, fontWeight: 600, fontSize: 15, textAlign: 'left' }}>
                    <div className="mono" style={{ width: 28, height: 28, borderRadius: 6, border: border.thin, background: answered && isCorrect ? color.success : answered && isSel ? color.danger : color.primary, color: answered && (isCorrect || isSel) ? '#fff' : color.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0, fontFamily: font.mono }}>{String.fromCharCode(65 + i)}</div>
                    <div style={{ flex: 1 }}>{opt}</div>
                    {answered && isCorrect && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Check size={20} color={color.success} strokeWidth={3} />
                        <span style={{ color: color.success, fontSize: 11, fontWeight: 800 }}>Correct</span>
                      </div>
                    )}
                    {answered && isSel && !isCorrect && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <XIcon size={20} color={color.danger} strokeWidth={3} />
                        <span style={{ color: color.danger, fontSize: 11, fontWeight: 800 }}>Incorrect</span>
                      </div>
                    )}
                  </Tappable>
                )
              })}
            </div>

            {/* Explanation / correct answer — shown when explanation data exists */}
            <AnimatePresence>
              {answered && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16 }}>
                  <div style={{ background: color.primaryTint, border: border.thin, borderRadius: 10, padding: 12 }}>
                    <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: 0.8, marginBottom: 4 }}>CORRECT ANSWER</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{current.options[current.correctIndex]}</div>
                    {explanation && (
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: color.text, opacity: 0.85 }}>{explanation}</div>
                    )}
                  </div>
                  <Button variant="secondary" onClick={next} style={{ width: '100%', marginTop: 12 }}>
                    {idx + 1 < total ? 'Next' : 'See Results'} <ArrowRight size={18} />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {finished && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 110, height: 110, borderRadius: 14, border: border.thick, boxShadow: shadow.md, background: passed ? color.successTint : color.dangerTint }}>
              <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: passed ? color.success : color.danger, fontFamily: font.mono }}>{score}/{total}</div>
            </motion.div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
              {Array.from({ length: Math.max(total, 1) }).map((_, i) => (
                <Star key={i} size={22} color={color.black} fill={i < score ? color.primary : 'none'} />
              ))}
            </div>
            <div style={{ fontWeight: 900, fontSize: 21, marginTop: 16 }}>{passed ? (perfect ? 'Perfect!' : 'Passed!') : 'Almost there'}</div>
            <div style={{ color: color.muted, fontSize: 14, marginTop: 6, fontWeight: 600 }}>
              {total > 0 ? `${Math.round((score / total) * 100)}% accuracy` : ''}
              {mode === 'chapter' && !passed ? ` · need ${passMarkFor(total)}/${total} to pass` : ''}
            </div>
            <div style={{ color: color.secondary, fontSize: 13, marginTop: 4, fontWeight: 700 }}>
              {score > 0 ? `+${score * (mode === 'weak' || mode === 'mistakes' || mode === 'revision' ? XP.weakCorrect : XP.correctAnswer)} XP from correct answers` : ''}
            </div>

            {/* Wrong-question recovery */}
            {wrongIds.length > 0 && (
              <div style={{ marginTop: 16, background: color.dangerTint, border: border.thin, borderRadius: 10, padding: 12, textAlign: 'left' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: color.danger }}>🔁 {wrongIds.length} question{wrongIds.length > 1 ? 's' : ''} to revisit</div>
                <div style={{ color: color.muted, fontSize: 12, marginTop: 2, fontWeight: 600 }}>These are now tracked as weak — retry them to lock in the concept.</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 16, flexDirection: 'column' }}>
              {wrongIds.length > 0 && (
                <Button variant="danger" onClick={retryWrong} style={{ width: '100%' }}><RotateCcw size={18} /> Retry wrong questions</Button>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>Close</Button>
                {!passed && <Button variant="secondary" onClick={restart} style={{ flex: 1 }}>Retry</Button>}
              </div>
            </div>
          </div>
        )}
      </div>
      {confetti && <Confetti />}
    </motion.div>
  )
}
