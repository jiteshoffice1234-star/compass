import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react'
import { motion } from 'framer-motion'
import { X, Check, X as XIcon, ArrowRight, ArrowLeft, Clock, Flag, RotateCcw, LayoutGrid, AlertTriangle, BookOpen, Zap, Play } from 'lucide-react'
import { useStore } from '../store'
import { questions, Question } from '../data/questions'
import { chaptersForLevel, chaptersForPaper, paperById, chapterById, Level } from '../data/curriculum'
import { flashcards } from '../data/flashcards'
import { EXAM_TERMS } from '../data/pastPapers'
import { Tappable, Button, IconButton } from './ui'
import { Confetti } from './Confetti'
import { RevisionSession } from './RevisionSession'
import { computeRevisionAreas, computeChapterStats, todayStr } from '../lib/mastery'
import { saveMockResult, getActiveMock, saveActiveMock, getRevisionFlags, setRevisionFlag, ActiveMockState } from '../lib/store'
import { color, border, shadow, font } from '../theme'

export interface SessionConfig {
  level: Level
  paperId: number | null // null = all subjects in the level
  termId: string
  count: number
  timed: boolean
  minutes: number
  mode?: 'full' | 'practice' | 'weak' // Phase 4 mock modes (default 'full')
}

const MODE_LABELS = { full: 'Full Mock', practice: 'Practice Mock', weak: 'Weak-Area Mock' } as const

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Balanced draw: distribute the requested count across chapters in proportion
 *  to each chapter's question share, then fill any remainder. A paper with an
 *  uneven spread never gets one chapter dominating the mock. */
function balancedPool(chapterIds: number[], count: number, bank: Question[]): Question[] {
  const byChapter = new Map<number, Question[]>()
  const idSet = new Set(chapterIds)
  for (const q of bank) {
    if (!idSet.has(q.chapterId)) continue
    const arr = byChapter.get(q.chapterId) ?? []
    arr.push(q)
    byChapter.set(q.chapterId, arr)
  }
  const total = [...byChapter.values()].reduce((s, a) => s + a.length, 0)
  if (total === 0) return []
  const out: Question[] = []
  for (const [, arr] of byChapter) {
    const quota = Math.max(1, Math.round((arr.length / total) * count))
    out.push(...shuffle(arr).slice(0, Math.min(quota, arr.length)))
  }
  let need = count - out.length
  if (need > 0) {
    const seen = new Set(out.map((q) => q.id))
    const spare = shuffle(bank.filter((q) => idSet.has(q.chapterId) && !seen.has(q.id)))
    out.push(...spare.slice(0, need))
  }
  return shuffle(out).slice(0, Math.min(count, out.length))
}

export function PracticeSession({ config, onClose }: { config: SessionConfig; onClose: () => void }) {
  const bumpWeekly = useStore((s) => s.bumpWeeklyProgress)
  const recordQuizSessionResult = useStore((s) => s.recordQuizSessionResult)
  const level = useStore((s) => s.level)
  const progress = useStore((s) => s.progress)
  const qp = useStore((s) => s.qp)
  const srs = useStore((s) => s.srs)

  const mode = config.mode ?? 'full'

  // ---- Pool: full/practice = selected paper (or whole level), balanced;
  //      weak = the weakest started chapters from the Mastery Engine.
  //      FROZEN at mount: mastery updates mid-session (recordQuizSessionResult
  //      writes new qp) must never reshuffle or reorder the exam, or answers
  //      would misalign with the question order. ----
  const [saved] = useState<ActiveMockState | null>(() => {
    const s = getActiveMock()
    if (!s) return null
    const same = s.config.level === config.level && s.config.paperId === config.paperId
      && s.config.mode === mode && s.config.count === config.count
      && s.config.timed === config.timed && s.config.minutes === config.minutes
    return same ? s : null
  })
  const [pool] = useState<Question[]>(() => {
    if (saved) {
      // Resume: rebuild the exact saved question order so saved answers line up.
      const byId = new Map<string, Question>()
      for (const q of questions) byId.set(q.id, q)
      return saved.poolIds.map((id) => byId.get(id)).filter((q): q is Question => !!q)
    }
    if (mode === 'weak') {
      const areas = computeRevisionAreas(level, chaptersForLevel(level), progress, new Map(Object.entries(qp)), new Map(Object.entries(srs)), questions, flashcards, todayStr())
      const weakIds = [areas.weakest, ...areas.needsRevision].filter((a): a is NonNullable<typeof a> => a !== null).map((a) => a.chapterId)
      const chapterIds = weakIds.length > 0 ? weakIds : chaptersForLevel(level).slice(0, 3).map((c) => c.id)
      return balancedPool(chapterIds, config.count, questions)
    }
    const chapterIds = (config.paperId ? chaptersForPaper(config.paperId) : chaptersForLevel(config.level)).map((c) => c.id)
    return balancedPool(chapterIds, config.count, questions)
  })

  // Fresh exams start directly in 'exam' (so the active-mock persistence effect
  // fires and an exit can be resumed); only a saved in-progress mock starts
  // in the 'resume' overlay state.
  const [phase, setPhase] = useState<'resume' | 'exam' | 'results' | 'review'>(saved ? 'resume' : 'exam')
  const [exam, setExam] = useState(() => {
    if (saved) {
      return {
        answers: saved.answers, marked: saved.marked, perQSeconds: saved.perQSeconds,
        startedAt: saved.startedAt, deadline: saved.deadline,
      }
    }
    return {
      answers: new Array<number | null>(pool.length).fill(null),
      marked: new Array<boolean>(pool.length).fill(false),
      perQSeconds: new Array<number>(pool.length).fill(0),
      startedAt: Date.now(),
      deadline: config.timed ? Date.now() + config.minutes * 60000 : 0,
    }
  })
  const [idx, setIdx] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [remaining, setRemaining] = useState(() => (exam.deadline ? Math.max(0, Math.ceil((exam.deadline - Date.now()) / 1000)) : 0))
  const [result, setResult] = useState<MockResult | null>(null)
  const [confetti, setConfetti] = useState(false)
  const [reviseChapter, setReviseChapter] = useState<number | null>(null)

  const submittedRef = useRef(false)
  const examRef = useRef(exam)
  examRef.current = exam
  const idxRef = useRef(idx)
  idxRef.current = idx
  const qStartRef = useRef(Date.now())

  const q = pool[idx]
  const answeredCount = useMemo(() => exam.answers.filter((a) => a !== null).length, [exam.answers])
  const subjectLabel = config.paperId ? `${paperById(config.paperId)?.code} · ${paperById(config.paperId)?.name}` : 'All subjects'
  const termLabel = EXAM_TERMS.find((t) => t.id === config.termId)?.label ?? 'Latest ICMAI archive'

  // ---- Persist the active exam (answers/marks/timing/deadline) so a reload
  //      can resume exactly where the student left off. ----
  useEffect(() => {
    if (phase === 'exam' && !submittedRef.current) {
      saveActiveMock({
        config: { level: config.level, paperId: config.paperId, mode, count: config.count, timed: config.timed, minutes: config.minutes },
        poolIds: pool.map((qq) => qq.id),
        answers: exam.answers, marked: exam.marked, perQSeconds: exam.perQSeconds,
        startedAt: exam.startedAt, deadline: exam.deadline,
      })
    } else if (phase === 'results') {
      saveActiveMock(null)
    }
  }, [exam, phase, pool, config, mode])

  // ---- Timestamp-based timer: accurate even when the app is throttled. ----
  const flushTime = useCallback(() => {
    const now = Date.now()
    const delta = Math.max(0, (now - qStartRef.current) / 1000)
    qStartRef.current = now
    if (delta === 0) return
    setExam((prev) => {
      const per = [...prev.perQSeconds]
      per[idxRef.current] = (per[idxRef.current] ?? 0) + delta
      return { ...prev, perQSeconds: per }
    })
  }, [])

  const submit = useCallback((auto: boolean) => {
    if (submittedRef.current) return
    submittedRef.current = true
    flushTime()
    const e = examRef.current
    const answered = e.answers.filter((a) => a !== null).length
    if (answered > 0) bumpWeekly(answered)
    const score = pool.reduce((s, qq, i) => s + (e.answers[i] === qq.correctIndex ? 1 : 0), 0)
    const seconds = Math.round((Date.now() - e.startedAt) / 1000)
    const unanswered = pool.length - answered
    const marked = e.marked.filter(Boolean).length
    const pct = pool.length ? score / pool.length : 0
    if (pct >= 0.4) setConfetti(true)
    // Feed the existing mastery engine (rolls, XP, milestones) — no new system.
    // Only ANSWERED questions become rolls: an unanswered exam question was never
    // attempted, so it must not count as a wrong answer in the learning system.
    const attempts: { q: string; correct: boolean; seconds: number }[] = []
    pool.forEach((qq, i) => {
      if (e.answers[i] === null) return
      attempts.push({ q: qq.id, correct: e.answers[i] === qq.correctIndex, seconds: Math.round(e.perQSeconds[i] ?? 0) })
    })
    recordQuizSessionResult({
      chapterId: null, mode: 'mock', score, total: pool.length,
      perfect: pool.length > 0 && score === pool.length, attempts, seconds,
    }).catch(() => {})
    // Persist a replayable result payload (history + analysis, no re-recording).
    saveMockResult({
      mode, paperId: config.paperId, level: config.level, count: config.count,
      score, total: pool.length, seconds, unanswered, marked, autoSubmit: auto ? 1 : 0,
      data: JSON.stringify({
        poolIds: pool.map((qq) => qq.id), answers: e.answers, marked: e.marked,
        perQSeconds: e.perQSeconds, autoSubmit: auto ? 1 : 0, startedAt: e.startedAt, deadline: e.deadline,
      }),
    }).catch(() => {})
    setResult({ score, total: pool.length, seconds, unanswered, marked, autoSubmit: auto, answers: e.answers, perQSeconds: e.perQSeconds, markedArr: e.marked })
    setPhase('results')
  }, [pool, flushTime, bumpWeekly, recordQuizSessionResult, config, mode])

  useEffect(() => {
    if (phase !== 'exam' || !exam.deadline) return
    const tick = () => {
      const rem = Math.max(0, Math.ceil((exam.deadline - Date.now()) / 1000))
      setRemaining(rem)
      if (rem <= 0) submit(true)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [phase, exam.deadline, submit])

  // If a saved exam already expired while away, auto-submit it.
  useEffect(() => {
    if (phase === 'resume' && saved && exam.deadline > 0 && exam.deadline <= Date.now()) {
      submit(true)
    }
  }, [phase, saved, exam.deadline, submit])

  const pick = useCallback((i: number) => {
    if (submittedRef.current) return
    setExam((prev) => {
      const answers = [...prev.answers]
      answers[idxRef.current] = i
      return { ...prev, answers }
    })
  }, [])

  const go = useCallback((d: number) => {
    flushTime()
    setIdx((i) => Math.max(0, Math.min(pool.length - 1, i + d)))
    setPaletteOpen(false)
  }, [pool.length, flushTime])

  const jump = useCallback((i: number) => {
    flushTime()
    setIdx(i)
    setPaletteOpen(false)
  }, [flushTime])

  const toggleMark = useCallback(() => {
    setExam((prev) => {
      const marked = [...prev.marked]
      marked[idxRef.current] = !marked[idxRef.current]
      return { ...prev, marked }
    })
  }, [])

  const clearAnswer = useCallback(() => {
    setExam((prev) => {
      const answers = [...prev.answers]
      answers[idxRef.current] = null
      return { ...prev, answers }
    })
  }, [])

  // Exit WITHOUT clearing: the active-mock state stays saved so the student
  // can resume later. Only the Resume overlay's "Discard and start fresh"
  // wipes it (and starts a brand-new exam).
  const discard = () => {
    saveActiveMock(null)
    onClose()
  }

  const startRevision = (chapterId: number) => setReviseChapter(chapterId)

  // ------------------------- render -------------------------
  const shell: any = { position: 'absolute', inset: 0, zIndex: 470, background: color.surface, display: 'flex', flexDirection: 'column' }

  if (pool.length === 0) {
    return (
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        style={{ ...shell, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18, textAlign: 'center' }}>No questions available for this configuration yet.</div>
        <Tappable onClick={onClose} style={{ background: color.primary, color: color.primaryInk, border: border.thick, boxShadow: shadow.md, borderRadius: 10, padding: '12px 24px', fontWeight: 800 }}>Close</Tappable>
      </motion.div>
    )
  }

  // ===== RESUME OVERLAY =====
  if (phase === 'resume' && saved) {
    const rem = Math.max(0, Math.ceil((saved.deadline - Date.now()) / 1000))
    return (
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} style={shell}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: color.warningTint, color: color.warning, border: border.thick, boxShadow: shadow.md, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={34} />
          </div>
          <div style={{ fontWeight: 900, fontSize: 21, marginTop: 18 }}>Resume your mock?</div>
          <div style={{ color: color.muted, fontSize: 14, marginTop: 8, fontWeight: 600, lineHeight: 1.5 }}>
            {MODE_LABELS[mode]} · {subjectLabel}
            <br />{answeredCount}/{pool.length} answered{saved.deadline > 0 ? ` · ${Math.floor(rem / 60)}m ${rem % 60}s left` : ''}
          </div>
          <Button variant="primary" onClick={() => { setPhase('exam'); qStartRef.current = Date.now() }} style={{ width: '100%', marginTop: 24 }}>
            <Play size={18} /> Continue exam
          </Button>
          <Button variant="ghost" onClick={discard} style={{ width: '100%', marginTop: 10 }}>Discard and start fresh</Button>
        </div>
      </motion.div>
    )
  }

  if (phase === 'results' && result) {
    return (
      <>
        <MockResultsView
          pool={pool}
          result={result}
          subjectLabel={subjectLabel}
          termLabel={termLabel}
          onClose={onClose}
          onStartRevision={startRevision}
        />
        {confetti && <Confetti />}
        {reviseChapter !== null && (
          <RevisionSession chapterId={reviseChapter} mode="quick" onClose={() => setReviseChapter(null)} />
        )}
      </>
    )
  }

  if (phase === 'review' && result) {
    return (
      <ReviewAnswersView
        pool={pool}
        result={result}
        onBack={() => setPhase('results')}
        onClose={onClose}
      />
    )
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  const lowTime = config.timed && remaining < 300
  const criticalTime = config.timed && remaining < 60

  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} style={shell}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px' }}>
        <IconButton onClick={() => setExitOpen(true)} size={36} aria-label="Exit exam"><X size={20} /></IconButton>
        <div style={{ textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>{MODE_LABELS[mode]}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: color.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{subjectLabel}</div>
        </div>
        {config.timed ? (
          <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 800, fontSize: 15, fontFamily: font.mono, color: criticalTime ? color.danger : lowTime ? color.warning : color.text, padding: '4px 8px', borderRadius: 8, background: criticalTime ? color.dangerTint : lowTime ? color.warningTint : color.card, border: border.thin }}>
            <Clock size={15} /> {mm}:{ss}
          </div>
        ) : <div style={{ width: 60 }} />}
      </div>

      {/* progress */}
      <div style={{ padding: '0 16px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: color.muted, marginBottom: 4 }}>
          <span>{idx + 1} / {pool.length}</span>
          <span>{answeredCount} answered · {exam.marked.filter(Boolean).length} marked</span>
        </div>
        <div style={{ height: 8, background: color.card, border: border.thin, borderRadius: 6, overflow: 'hidden' }}>
          <motion.div animate={{ width: `${(answeredCount / pool.length) * 100}%` }} style={{ height: '100%', background: color.primary, transition: 'width 0.2s' }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingTop: 4 }}>
        {q && (
          <ExamQuestion
            q={q}
            index={idx}
            selected={exam.answers[idx]}
            marked={exam.marked[idx]}
            onPick={pick}
            onClear={clearAnswer}
            onToggleMark={toggleMark}
          />
        )}
      </div>

      {/* bottom controls */}
      <div style={{ display: 'flex', gap: 10, padding: 14, borderTop: border.thin, background: color.surface }}>
        <Tappable onClick={() => go(-1)} disabled={idx === 0} style={{ background: color.card, border: border.thin, boxShadow: shadow.sm, borderRadius: 10, padding: '13px 16px', fontWeight: 800, opacity: idx === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={16} /></Tappable>
        <Tappable onClick={() => { flushTime(); setPaletteOpen(true) }} style={{ background: color.card, border: border.thin, boxShadow: shadow.sm, borderRadius: 10, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13 }}><LayoutGrid size={16} /></Tappable>
        {idx < pool.length - 1 ? (
          <Tappable onClick={() => go(1)} style={{ flex: 1, background: color.primary, color: color.primaryInk, border: border.thick, boxShadow: shadow.md, borderRadius: 10, padding: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>Next <ArrowRight size={16} /></Tappable>
        ) : (
          <Tappable onClick={() => { flushTime(); setConfirmOpen(true) }} style={{ flex: 1, background: color.success, color: '#fff', border: border.thick, boxShadow: shadow.md, borderRadius: 10, padding: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Flag size={16} /> Submit</Tappable>
        )}
      </div>

      {/* question palette */}
      {paletteOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-end' }}>
          <motion.div initial={{ y: 80 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ width: '100%', background: color.surface, borderTop: border.thick, borderRadius: '18px 18px 0 0', padding: 16, maxHeight: '78%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Questions</div>
              <IconButton onClick={() => setPaletteOpen(false)} size={32} aria-label="Close palette"><X size={18} /></IconButton>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', fontSize: 11, fontWeight: 700, color: color.muted }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color.secondary, marginRight: 4 }} />answered</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color.warning, marginRight: 4 }} />marked</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color.card, border: border.thin, marginRight: 4 }} />unanswered</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, overflowY: 'auto', paddingBottom: 4 }}>
              {pool.map((qq, i) => {
                const answered = exam.answers[i] !== null
                const marked = exam.marked[i]
                const current = i === idx
                return (
                  <Tappable key={qq.id} onClick={() => jump(i)}
                    style={{
                      aspectRatio: '1', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: answered ? color.secondary : marked ? color.warning : color.card,
                      color: answered || marked ? '#fff' : color.text,
                      border: current ? border.thick : border.thin,
                      boxShadow: current ? shadow.md : 'none', fontWeight: 800, fontSize: 13,
                    }}>
                    {i + 1}
                  </Tappable>
                )
              })}
            </div>
            <Button variant="primary" onClick={() => { setPaletteOpen(false); setConfirmOpen(true) }} style={{ width: '100%', marginTop: 14 }}>
              <Flag size={16} /> Submit exam
            </Button>
          </motion.div>
        </div>
      )}

      {/* submit confirmation */}
      {confirmOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 510, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ width: '100%', background: color.card, border: border.thick, boxShadow: shadow.lg, borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 900, fontSize: 17 }}>Submit exam?</div>
            <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.5 }}>
              {pool.length - answeredCount > 0 && (
                <span style={{ display: 'block', color: color.danger, fontWeight: 700 }}>⚠️ {pool.length - answeredCount} question{pool.length - answeredCount > 1 ? 's' : ''} unanswered will be marked wrong.</span>
              )}
              <span style={{ display: 'block', marginTop: 4 }}>{answeredCount}/{pool.length} answered · {exam.marked.filter(Boolean).length} marked for review. This cannot be undone.</span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} style={{ flex: 1 }}>Keep working</Button>
              <Button variant="danger" onClick={() => { setConfirmOpen(false); submit(false) }} style={{ flex: 1 }}>Submit now</Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* exit confirmation */}
      {exitOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 510, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ width: '100%', background: color.card, border: border.thick, boxShadow: shadow.lg, borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 900, fontSize: 17 }}>Exit exam?</div>
            <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.5 }}>
              Your progress is saved — you can resume this mock later from Practice.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <Button variant="ghost" onClick={() => setExitOpen(false)} style={{ flex: 1 }}>Keep studying</Button>
              <Button variant="danger" onClick={onClose} style={{ flex: 1 }}>Exit — save & resume later</Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}

// ============================================================================
// Mock results / analysis (also used by Mock History replay)
// ============================================================================

export interface MockResult {
  score: number
  total: number
  seconds: number
  unanswered: number
  marked: number
  autoSubmit: boolean
  answers: (number | null)[]
  perQSeconds: number[]
  markedArr: boolean[]
}

export interface MockResultsViewProps {
  pool: Question[]
  result: MockResult
  subjectLabel: string
  termLabel: string
  onClose: () => void
  onStartRevision: (chapterId: number) => void
}

export function MockResultsView({ pool, result, subjectLabel, termLabel, onClose, onStartRevision }: MockResultsViewProps) {
  const [review, setReview] = useState(false)
  const progress = useStore((s) => s.progress)
  const qp = useStore((s) => s.qp)
  const srs = useStore((s) => s.srs)

  const pct = result.total ? Math.round((result.score / result.total) * 100) : 0
  const attempted = result.total - result.unanswered
  const accuracy = attempted > 0 ? Math.round((result.score / attempted) * 100) : 0
  const passed = pct >= 40

  // ---- Chapter-wise breakdown (wrong answers expandable per chapter) ----
  const byChapter = useMemo(() => {
    const map = new Map<number, { chapterId: number; total: number; correct: number; answered: number; wrongIdx: number[] }>()
    pool.forEach((qq, i) => {
      const g = map.get(qq.chapterId) ?? { chapterId: qq.chapterId, total: 0, correct: 0, answered: 0, wrongIdx: [] as number[] }
      g.total += 1
      if (result.answers[i] !== null) g.answered += 1
      if (result.answers[i] === qq.correctIndex) g.correct += 1
      else if (result.answers[i] !== null) g.wrongIdx.push(i)
      map.set(qq.chapterId, g)
    })
    return [...map.values()]
      .map((g) => ({ ...g, accuracy: g.answered ? g.correct / g.answered : null }))
      .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1))
  }, [pool, result])

  // ---- Time analysis (only from recorded per-question timestamps) ----
  const timeAnalysis = useMemo(() => {
    const withTime = pool.map((qq, i) => ({ q: qq, seconds: result.perQSeconds[i] ?? 0 })).filter((x) => x.seconds > 0)
    if (withTime.length === 0) return null
    const total = withTime.reduce((s, x) => s + x.seconds, 0)
    const avg = total / withTime.length
    const slowest = [...withTime].sort((a, b) => b.seconds - a.seconds).slice(0, 3)
    const byChapterTime = new Map<number, number>()
    withTime.forEach((x) => byChapterTime.set(x.q.chapterId, (byChapterTime.get(x.q.chapterId) ?? 0) + x.seconds))
    const top = [...byChapterTime.entries()].sort((a, b) => b[1] - a[1])[0]
    return { total, avg, slowest, topChapterId: top ? top[0] : null, topPct: top && total > 0 ? top[1] / total : 0 }
  }, [pool, result.perQSeconds])

  // ---- Weakest chapter in THIS mock (drives the revision recommendation).
  //      Only real weaknesses count: a chapter with incorrect answers. If the
  //      student got everything right, no revision CTA is shown. ----
  const weakest = byChapter.find((g) => g.wrongIdx.length > 0 && g.answered >= 3)
    ?? byChapter.find((g) => g.wrongIdx.length > 0)
    ?? null
  const weakestMastery = useMemo(() => {
    if (!weakest) return null
    const chapter = chapterById(weakest.chapterId)
    if (!chapter) return null
    const perfMap = new Map(Object.entries(qp))
    const srsMap = new Map(Object.entries(srs))
    const cards = flashcards.filter((f) => f.chapterId === chapter.id)
    const st = computeChapterStats(chapter, progress[chapter.id], perfMap, srsMap, cards, todayStr())
    return st.overall
  }, [weakest, qp, srs, progress])

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`
  }

  const modeLabel = 'Mock Exam'

  if (review) {
    return (
      <ReviewAnswersView pool={pool} result={result} onBack={() => setReview(false)} onClose={onClose} />
    )
  }

  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} style={{ position: 'absolute', inset: 0, zIndex: 470, background: color.surface, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 8px' }}>
        <IconButton onClick={onClose} size={36} aria-label="Close results"><X size={20} /></IconButton>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Mock Results</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: color.muted }}>{subjectLabel}</div>
        </div>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingTop: 8 }} className="safe-bottom">
        {/* overall */}
        <div style={{ textAlign: 'center' }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 120, height: 120, borderRadius: 16, marginTop: 8, background: passed ? color.success : color.danger, border: border.thick, boxShadow: shadow.md }}>
            <div className="mono" style={{ fontSize: 30, fontWeight: 800, color: '#fff', fontFamily: font.mono }}>{pct}%</div>
          </motion.div>
          <div style={{ fontWeight: 900, fontSize: 20, marginTop: 12 }}>{passed ? 'Passed!' : 'Keep practising'}</div>
          <div style={{ color: color.muted, fontSize: 13, marginTop: 4, fontWeight: 600 }}>{modeLabel} · {termLabel} · pass mark 40%</div>
          {result.autoSubmit && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: color.warningTint, color: color.warning, border: border.thin, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800, marginTop: 10 }}>
              <Clock size={14} /> Time expired — submitted automatically
            </div>
          )}
        </div>

        {/* stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, margin: '18px 0' }}>
          <ResultStat label="Score" value={`${result.score}/${result.total}`} />
          <ResultStat label="Correct" value={`${result.score}`} accent={color.success} />
          <ResultStat label="Wrong" value={`${result.total - result.score - result.unanswered}`} accent={color.danger} />
          <ResultStat label="Unanswered" value={`${result.unanswered}`} />
          <ResultStat label="Accuracy" value={`${accuracy}%`} />
          <ResultStat label="Time taken" value={fmtTime(result.seconds)} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
          <ResultStat label="Avg time / Q" value={attempted > 0 ? `${Math.round(result.seconds / Math.max(attempted, 1))}s` : '—'} />
          <ResultStat label="Marked for review" value={`${result.marked}`} />
        </div>

        {/* recommended next step */}
        {weakest && (
          <div style={{ background: color.dangerTint, border: border.thick, borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={15} color={color.danger} />
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: color.danger }}>RECOMMENDED NEXT STEP</span>
            </div>
            <div style={{ fontWeight: 900, fontSize: 15, marginTop: 8 }}>
              🔴 Revise {chapterById(weakest.chapterId)?.title ?? `Chapter ${weakest.chapterId}`}
            </div>
            <div style={{ color: color.text, fontSize: 12, fontWeight: 600, marginTop: 4, opacity: 0.85 }}>
              Mock accuracy: {weakest.accuracy !== null ? Math.round(weakest.accuracy * 100) : 0}% · Current mastery: {weakestMastery !== null ? Math.round(weakestMastery * 100) : '—'}% · {weakest.wrongIdx.length} incorrect
            </div>
            <Button variant="danger" onClick={() => onStartRevision(weakest.chapterId)} style={{ width: '100%', marginTop: 10 }}>
              <Play size={16} /> START REVISION
            </Button>
          </div>
        )}

        {/* chapter-wise */}
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Chapter-wise Performance</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {byChapter.map((g) => {
            const c = chapterById(g.chapterId)
            const st = g.accuracy === null ? 'none' : g.accuracy >= 0.75 ? 'strong' : g.accuracy >= 0.5 ? 'revision' : 'weak'
            return (
              <Tappable key={g.chapterId} onClick={() => setReview(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: color.card, border: border.thin, boxShadow: shadow.sm, borderRadius: 10, padding: '10px 12px', width: '100%', textAlign: 'left' }}>
                <span style={{ fontSize: 13 }}>{st === 'strong' ? '🟢' : st === 'revision' ? '🟡' : st === 'weak' ? '🔴' : '⚪'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ch {g.chapterId}: {c?.title ?? ''}</div>
                  <div style={{ color: color.muted, fontSize: 11, fontWeight: 600 }}>
                    {g.answered === 0 ? 'Not attempted in this mock' : `${g.correct}/${g.answered} correct${g.wrongIdx.length > 0 ? ` · ${g.wrongIdx.length} wrong — tap to review` : ''}`}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 14, fontWeight: 800, color: st === 'strong' ? color.success : st === 'revision' ? color.warning : st === 'weak' ? color.danger : color.muted, fontFamily: font.mono }}>
                  {g.accuracy !== null ? Math.round(g.accuracy * 100) : '—'}%
                </span>
              </Tappable>
            )
          })}
        </div>

        {/* time analysis */}
        {timeAnalysis && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Time Analysis</div>
            <div style={{ background: color.card, border: border.thin, borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                <span>Average time per question</span>
                <span className="mono" style={{ fontFamily: font.mono }}>{Math.round(timeAnalysis.avg)}s</span>
              </div>
              {timeAnalysis.topChapterId && timeAnalysis.topPct >= 0.3 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, background: color.warningTint, border: border.thin, borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700, color: color.warning }}>
                  <AlertTriangle size={14} />
                  You spent {Math.round(timeAnalysis.topPct * 100)}% of your exam time on {chapterById(timeAnalysis.topChapterId)?.title ?? `Chapter ${timeAnalysis.topChapterId}`} — consider moving on sooner.
                </div>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Slowest questions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {timeAnalysis.slowest.slice(0, 3).map((x, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: color.card, border: border.thin, borderRadius: 8, padding: '8px 10px' }}>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: color.warning, fontFamily: font.mono }}>{Math.round(x.seconds)}s</span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.q.question}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: color.muted }}>Ch {x.q.chapterId}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          <Button variant="secondary" onClick={() => setReview(true)} style={{ width: '100%' }}>
            <BookOpen size={16} /> Review Answers
          </Button>
          <Button variant="ghost" onClick={onClose} style={{ width: '100%' }}>Done</Button>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================================
// Per-question review (your answer vs correct, time, add-to-revision)
// ============================================================================

function ReviewAnswersView({ pool, result, onBack, onClose }: { pool: Question[]; result: MockResult; onBack: () => void; onClose: () => void }) {
  const [flags, setFlags] = useState<Set<string>>(new Set())
  const showToast = useStore((s) => s.showToast)
  useEffect(() => {
    getRevisionFlags().then((f) => setFlags(new Set(f))).catch(() => {})
  }, [])
  const toggleFlag = (id: string) => {
    const next = new Set(flags)
    if (next.has(id)) { next.delete(id); setRevisionFlag(id, false).catch(() => {}) }
    else { next.add(id); setRevisionFlag(id, true).catch(() => {}) }
    setFlags(next)
    showToast(next.has(id) ? '🔁 Added to your revision queue' : 'Removed from revision queue')
  }
  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} style={{ position: 'absolute', inset: 0, zIndex: 480, background: color.surface, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 8px' }}>
        <IconButton onClick={onBack} size={36} aria-label="Back"><ArrowLeft size={20} /></IconButton>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Answer Review</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: color.muted }}>Tap 🔁 to add a wrong question to revision</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingTop: 4 }} className="safe-bottom">
        {pool.map((qq, i) => {
          const user = result.answers[i]
          const correct = qq.correctIndex
          const isCorrect = user === correct
          const time = result.perQSeconds[i] ?? 0
          return (
            <div key={qq.id} style={{ background: color.card, border: border.thin, boxShadow: shadow.sm, borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 800, color: color.muted, fontSize: 13 }}>{i + 1}.</div>
                <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{qq.question}</div>
                {isCorrect ? <Check size={18} color={color.success} /> : <XIcon size={18} color={color.danger} />}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: color.muted, marginTop: 4 }}>Chapter {qq.chapterId}{time > 0 ? ` · ${Math.round(time)}s` : ''}</div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {qq.options.map((opt, oi) => {
                  const isC = oi === correct
                  const isU = oi === user
                  const bg = isC ? color.successTint : isU ? color.dangerTint : 'transparent'
                  const bd = isC ? color.success : isU ? color.danger : color.muted
                  return (
                    <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, background: bg, border: `1px solid ${bd}`, borderRadius: 6, padding: '8px 10px', fontSize: 13 }}>
                      <span style={{ fontWeight: 800 }}>{String.fromCharCode(65 + oi)}</span>
                      <span style={{ flex: 1 }}>{opt}</span>
                      {isC && <span style={{ color: color.success, fontSize: 11, fontWeight: 800 }}>Correct</span>}
                      {isU && !isC && <span style={{ color: color.danger, fontSize: 11, fontWeight: 800 }}>Your answer</span>}
                    </div>
                  )
                })}
                {user === null && <div style={{ color: color.muted, fontSize: 12 }}>Not attempted</div>}
              </div>
              {!isCorrect && (
                <Tappable onClick={() => toggleFlag(qq.id)} style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, background: flags.has(qq.id) ? color.successTint : color.warningTint, border: `1px solid ${flags.has(qq.id) ? color.success : color.warning}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 800, color: flags.has(qq.id) ? color.success : color.warning }}>
                  <RotateCcw size={14} /> {flags.has(qq.id) ? '✓ In your revision queue' : 'ADD TO REVISION'}
                </Tappable>
              )}
            </div>
          )
        })}
        <Button variant="primary" onClick={onClose} style={{ width: '100%', marginBottom: 20 }}>
          <Check size={16} /> Finish
        </Button>
      </div>
    </motion.div>
  )
}

// ============================================================================

const ExamQuestion = memo(function ExamQuestion({ q, index, selected, marked, onPick, onClear, onToggleMark }: {
  q: Question; index: number; selected: number | null; marked: boolean; onPick: (i: number) => void; onClear: () => void; onToggleMark: () => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ background: color.secondaryTint, color: color.secondary, border: border.thin, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>QUESTION {index + 1}</span>
        <Tappable onClick={onToggleMark} style={{ display: 'flex', alignItems: 'center', gap: 5, background: marked ? color.warningTint : color.card, border: border.thin, borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 800, color: marked ? color.warning : color.muted }}>
          <Flag size={14} fill={marked ? color.warning : 'none'} /> {marked ? 'Marked' : 'Mark for review'}
        </Tappable>
      </div>
      <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.4, marginBottom: 20 }}>{q.question}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {q.options.map((opt, i) => {
          const sel = selected === i
          return (
            <Tappable key={i} onClick={() => onPick(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: sel ? color.primary : color.card, color: sel ? color.primaryInk : color.text, border: sel ? border.thick : border.thin, boxShadow: shadow.sm, borderRadius: 10, padding: 15, width: '100%', fontWeight: 700, fontSize: 15 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: sel ? color.primaryInk : color.surface, color: sel ? color.primary : color.text, border: border.thin, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{String.fromCharCode(65 + i)}</div>
              <div style={{ flex: 1, textAlign: 'left' }}>{opt}</div>
              {sel && <Check size={18} color={color.primaryInk} strokeWidth={3} />}
            </Tappable>
          )
        })}
      </div>
      {selected !== null && (
        <Tappable onClick={onClear} style={{ marginTop: 12, color: color.muted, fontSize: 12, fontWeight: 700, textDecoration: 'underline' }}>Clear answer</Tappable>
      )}
    </div>
  )
})

function ResultStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: color.card, border: border.thin, boxShadow: shadow.sm, borderRadius: 10, padding: '12px 6px', textAlign: 'center' }}>
      <div className="mono" style={{ fontWeight: 800, fontSize: 16, color: accent ?? color.text, fontFamily: font.mono }}>{value}</div>
      <div style={{ color: color.muted, fontSize: 10, marginTop: 2, fontWeight: 700 }}>{label}</div>
    </div>
  )
}
