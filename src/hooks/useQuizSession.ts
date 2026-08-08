import { useState, useCallback, useMemo, useRef } from 'react'

export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
  chapterId: number
}

export interface QuizAttempt {
  q: string
  correct: boolean
}

// Chapter-quiz pass ratio. Real ICMAI papers pass at 40%, but for a 15-question
// learning checkpoint 50% keeps it fair while still requiring competence.
export const QUIZ_PASS_RATIO = 0.5

// Number of questions drawn per chapter quiz (from the chapter's pool).
export const QUIZ_LENGTH = 15

// Chapter quiz XP (same scale as before: 10 questions → 20 XP).
export const QUIZ_XP = 20
export const PERFECT_BONUS_XP = 15

export function passMarkFor(total: number): number {
  return Math.ceil(total * QUIZ_PASS_RATIO)
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Shuffles the answer options of a single question (remapping correctIndex). */
function shuffleOptions<T extends QuizQuestion>(q: T): T {
  const idxs = shuffle(q.options.map((_, i) => i))
  return {
    ...q,
    options: idxs.map((i) => q.options[i]),
    correctIndex: idxs.indexOf(q.correctIndex),
  }
}

/**
 * Builds a session deck: pick `limit` random questions (once per session) and
 * shuffle each question's options once. The deck is memoized so it NEVER
 * re-shuffles between renders — a previous bug re-created the pool on every
 * state update, which made questions and options visibly change after each tap.
 */
export function shuffleQuestions<T extends QuizQuestion>(arr: T[], limit: number): T[] {
  return shuffle(arr).slice(0, Math.min(limit, arr.length)).map(shuffleOptions)
}

export function useQuizSession(questionPool: QuizQuestion[], limit: number) {
  const [sessionKey, setSessionKey] = useState(0)
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [finished, setFinished] = useState(false)
  const submittedRef = useRef(false)

  // Keyed on a stable identity (the pool reference from the caller's useMemo
  // plus our own session counter), so the deck is fixed for the session and
  // only refreshed on a deliberate restart.
  // `sessionKey` is intentionally in the deps (not referenced in the callback)
  // so a deliberate restart re-shuffles the deck.
  const questions = useMemo(
    () => shuffleQuestions(questionPool, limit),
    [questionPool, limit, sessionKey],
  )
  const current = questions[idx]

  const choose = useCallback((optionIndex: number, callback?: () => void) => {
    if (answered || finished) return
    setSelected(optionIndex)
    setAnswered(true)
    const correct = optionIndex === current?.correctIndex
    if (correct) setScore(prev => prev + 1)
    setAttempts(prev => [...prev, { q: current?.id ?? '', correct }])
    callback?.()
  }, [answered, finished, current])

  const next = useCallback(() => {
    if (idx + 1 < questions.length) {
      setIdx(prev => prev + 1)
      setSelected(null)
      setAnswered(false)
    } else {
      setFinished(true)
    }
  }, [idx, questions.length])

  const restart = useCallback(() => {
    setSessionKey(k => k + 1)
    setIdx(0)
    setSelected(null)
    setAnswered(false)
    setScore(0)
    setAttempts([])
    setFinished(false)
    submittedRef.current = false
  }, [])

  const getResults = useCallback(() => {
    const total = questions.length
    const passMark = passMarkFor(total)
    return {
      score,
      total,
      passed: score >= passMark,
      passMark,
      perfect: score === total,
      attempts,
    }
  }, [score, questions.length, attempts])

  return {
    current,
    idx,
    selected,
    answered,
    score,
    finished,
    questions,
    total: questions.length,
    choose,
    next,
    restart,
    getResults,
  }
}
