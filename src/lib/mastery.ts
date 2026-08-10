// ============================================================================
// Compass V2 — Mastery Engine
// ----------------------------------------------------------------------------
// Pure, offline, deterministic logic that turns raw stored performance data
// (question rolls, SRS state, chapter progress, daily stats) into useful study
// intelligence: per-chapter mastery, weak/strong areas, revision priority,
// a daily study plan and milestone checks. No I/O — all computation.
//
// Every value is derived from REAL stored data. There is no randomness or
// fabricated "AI" here: if a student never attempted a question, it is simply
// treated as medium difficulty / unknown, never guessed as weak or strong.
// ============================================================================

import { Question } from '../data/questions'
import { Flashcard } from '../data/flashcards'
import { Chapter, Level, chaptersForLevel } from '../data/curriculum'
import type {
  QuestionPerfRow,
  FlashcardSrsRow,
  DailyStatsRow,
  ChapterProgressRow,
} from './db'

// ---------------------------------------------------------------------------
// XP economy (V2)
// ---------------------------------------------------------------------------
export const XP = {
  correctAnswer: 1,        // per correct quiz answer
  weakCorrect: 2,          // per correct answer in weak/mistakes revision modes
  flashcardHard: 1,        // flashcard: Hard
  flashcardGood: 2,        // flashcard: Good
  flashcardEasy: 3,        // flashcard: Easy
  quizPass: 20,            // first pass of a chapter quiz (legacy value kept)
  perfectBonus: 15,        // perfect chapter quiz (legacy value kept)
  chapterTestPass: 30,     // full chapter test passed
  dailyGoal: 25,           // daily target reached (once/day)
  weeklyGoal: 50,          // weekly challenge completed (once/week)
  milestone: 40,           // each milestone (once)
} as const

// ---------------------------------------------------------------------------
// Difficulty — derived from the STUDENT's own accuracy, never random.
// ---------------------------------------------------------------------------
export type Difficulty = 'easy' | 'medium' | 'hard'
export type Status = 'strong' | 'revision' | 'weak' | 'new'

export function accuracyOf(p: QuestionPerfRow | null): number | null {
  if (!p) return null
  const total = p.correct + p.wrong
  if (total <= 0) return null
  return p.correct / total
}

/** How hard THIS question is FOR THIS STUDENT. Unseen → medium. */
export function difficultyOf(p: QuestionPerfRow | null): Difficulty {
  const acc = accuracyOf(p)
  if (acc === null) return 'medium'
  if (acc >= 0.85) return 'easy'
  if (acc >= 0.55) return 'medium'
  return 'hard'
}

/** A question is weak when it has been attempted enough to judge and the
 *  student keeps failing it (accuracy < 50% with ≥2 attempts, or ≥2 wrongs). */
export function isWeakQuestion(p: QuestionPerfRow | null): boolean {
  if (!p) return false
  const total = p.correct + p.wrong
  if (total >= 2 && p.correct / total < 0.5) return true
  if (p.wrong >= 2 && p.correct === 0) return true
  return false
}

/** Ranking score for "how urgently this question needs revision". */
export function weaknessScore(p: QuestionPerfRow | null): number {
  if (!p) return 0
  const total = p.correct + p.wrong
  if (total === 0) return 0
  const failRate = 1 - p.correct / total
  // Wrong answers hurt more than correct answers help; recency not stored in
  // the rollup, so weight purely on volume + failure rate.
  return failRate * total + (p.wrong >= 2 && p.correct === 0 ? 2 : 0)
}

/** A "previous mistake" = answered wrong at least once, most recent first. */
export function isPreviousMistake(p: QuestionPerfRow | null): boolean {
  if (!p) return false
  return p.wrong >= 1
}

// ---------------------------------------------------------------------------
// Flashcard spaced repetition (SM-2 style, 4 grades)
// ---------------------------------------------------------------------------
export type SrsGrade = 0 | 1 | 2 | 3 // Again | Hard | Good | Easy

export const SRS_GRADE_LABELS = ['Again', 'Hard', 'Good', 'Easy'] as const

export function srsReview(prev: FlashcardSrsRow | null, grade: SrsGrade, today: string): FlashcardSrsRow {
  const ease0 = prev?.ease ?? 2.5
  const interval0 = prev?.interval ?? 0
  const lapses0 = prev?.lapses ?? 0
  const streak0 = prev?.streak ?? 0
  const reviews0 = prev?.reviews ?? 0

  let ease = ease0
  let interval: number
  let lapses = lapses0
  let streak = streak0

  switch (grade) {
    case 0: // Again — forgot it
      ease = Math.max(1.3, ease0 - 0.2)
      interval = 0
      lapses += 1
      streak = 0
      break
    case 1: // Hard
      ease = Math.max(1.3, ease0 - 0.15)
      interval = Math.max(1, Math.round(interval0 * 1.2))
      streak += 1
      break
    case 2: // Good
      interval = interval0 === 0 ? 1 : Math.round(interval0 * ease0)
      streak += 1
      break
    case 3: // Easy
      ease = Math.min(3.0, ease0 + 0.15)
      interval = interval0 === 0 ? 3 : Math.round(interval0 * ease0 * 1.3)
      streak += 1
      break
  }

  const due = new Date(today + 'T00:00:00')
  due.setDate(due.getDate() + interval)
  return {
    flashcard_id: prev?.flashcard_id ?? '',
    ease: Math.round(ease * 100) / 100,
    interval,
    due: due.toISOString().slice(0, 10),
    lapses,
    streak,
    last_reviewed: today,
    reviews: reviews0 + 1,
  }
}

export function isCardDue(srs: FlashcardSrsRow | null, today: string): boolean {
  if (!srs) return true // never seen → due
  if (srs.reviews === 0) return true
  return !srs.due || srs.due <= today
}

export type CardTier = 'new' | 'learning' | 'mastered' | 'difficult' | 'weak'

export function cardTier(srs: FlashcardSrsRow | null): CardTier {
  if (!srs || srs.reviews === 0) return 'new'
  if (srs.interval >= 21) return 'mastered'
  if (srs.ease < 2.0 || srs.lapses >= 2) return 'difficult'
  if (srs.lapses >= 1 || (srs.reviews >= 3 && srs.streak <= 1)) return 'weak'
  return 'learning'
}

export function isRecentlyLearned(srs: FlashcardSrsRow | null, today: string): boolean {
  if (!srs || !srs.last_reviewed) return false
  const last = new Date(srs.last_reviewed + 'T00:00:00')
  const now = new Date(today + 'T00:00:00')
  const diff = Math.round((now.getTime() - last.getTime()) / 86400000)
  return diff >= 0 && diff <= 7
}

// ---------------------------------------------------------------------------
// Chapter / level mastery
// ---------------------------------------------------------------------------
export interface ChapterStats {
  chapterId: number
  completion: number | null   // 0..1 across video/PDF/quiz evidence
  accuracy: number | null     // 0..1 across attempted questions
  flashcardMastery: number | null // 0..1 fraction of cards mastered
  overall: number | null      // 0..1 weighted mastery
  status: Status
  questionsAttempted: number
  questionsCorrect: number
  cardsReviewed: number
  cardsTotal: number
  cardsDue: number
  weakQuestions: number
  quizPassed: boolean
}

export function computeChapterStats(
  chapter: Chapter,
  prog: ChapterProgressRow | undefined,
  perfByQ: Map<string, QuestionPerfRow>,
  srsByCard: Map<string, FlashcardSrsRow>,
  chapterCards: Flashcard[],
  today: string,
): ChapterStats {
  // Completion: evidence the student engaged with the chapter's content.
  let compWeight = 0
  let compSum = 0
  if (prog?.video_watched) { compWeight += 1; compSum += 1 }
  const pdfs = safeList(prog?.pdfs_read)
  if (pdfs.length > 0) { compWeight += 1; compSum += 1 }
  if (prog?.quiz_passed) { compWeight += 1; compSum += 1 }
  const completion = compWeight > 0 ? compSum / compWeight : null

  // Accuracy: aggregate the chapter's question rolls.
  const chapterQuestions = chapterQuestionsFor(chapter.id, perfByQ)
  let correct = 0
  let wrong = 0
  let weak = 0
  for (const p of chapterQuestions) {
    correct += p.correct
    wrong += p.wrong
    if (isWeakQuestion(p)) weak += 1
  }
  const total = correct + wrong
  const accuracy = total > 0 ? correct / total : null

  // Flashcard mastery: fraction of the chapter's cards that reached mastery.
  let cardsReviewed = 0
  let cardsDue = 0
  let mastered = 0
  for (const card of chapterCards) {
    const srs = srsByCard.get(card.id) ?? null
    if (srs && srs.reviews > 0) cardsReviewed += 1
    if (isCardDue(srs, today)) cardsDue += 1
    if (cardTier(srs) === 'mastered') mastered += 1
  }
  const flashcardMastery = chapterCards.length > 0 ? mastered / chapterCards.length : null

  // Overall mastery: weighted blend of the components that have data.
  // Weights re-normalise so missing components never punish the student.
  const W = { completion: 0.4, accuracy: 0.4, flashcards: 0.2 }
  let weight = 0
  let sum = 0
  if (completion !== null) { weight += W.completion; sum += completion * W.completion }
  if (accuracy !== null) { weight += W.accuracy; sum += accuracy * W.accuracy }
  if (flashcardMastery !== null) { weight += W.flashcards; sum += flashcardMastery * W.flashcards }
  const overall = weight > 0 ? sum / weight : (completion ?? null)

  const started = (prog?.video_watched || prog?.quiz_completed || pdfs.length > 0 || total > 0 || cardsReviewed > 0) ?? false
  let status: Status
  if (!started) status = 'new'
  else if (overall === null) status = 'revision'
  else if (overall >= 0.75) status = 'strong'
  else if (overall >= 0.5) status = 'revision'
  else status = 'weak'

  return {
    chapterId: chapter.id,
    completion,
    accuracy,
    flashcardMastery,
    overall,
    status,
    questionsAttempted: total,
    questionsCorrect: correct,
    cardsReviewed,
    cardsTotal: chapterCards.length,
    cardsDue,
    weakQuestions: weak,
    quizPassed: !!prog?.quiz_passed,
  }
}

function chapterQuestionsFor(chapterId: number, perfByQ: Map<string, QuestionPerfRow>): QuestionPerfRow[] {
  const out: QuestionPerfRow[] = []
  perfByQ.forEach((p) => { if (p.chapter_id === chapterId) out.push(p) })
  return out
}

function safeList(raw: string | undefined | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export interface MasterySummary {
  accuracy: number | null
  questionsAttempted: number
  questionsCorrect: number
  flashcardsReviewed: number
  flashcardsMastered: number
  chaptersStrong: number
  chaptersRevision: number
  chaptersWeak: number
  chaptersTotal: number
  level: Level
}

export function computeMasterySummary(
  level: Level,
  chapters: Chapter[],
  progress: Record<number, ChapterProgressRow>,
  perfByQ: Map<string, QuestionPerfRow>,
  srsByCard: Map<string, FlashcardSrsRow>,
  flashcards: Flashcard[],
  today: string,
): MasterySummary {
  let correct = 0
  let wrong = 0
  let cardsReviewed = 0
  let cardsMastered = 0
  const counts = { strong: 0, revision: 0, weak: 0 }
  for (const chapter of chapters) {
    const cards = flashcards.filter((f) => f.chapterId === chapter.id)
    const st = computeChapterStats(chapter, progress[chapter.id], perfByQ, srsByCard, cards, today)
    correct += st.questionsCorrect
    wrong += st.questionsAttempted - st.questionsCorrect
    cardsReviewed += st.cardsReviewed
    for (const card of cards) {
      if (cardTier(srsByCard.get(card.id) ?? null) === 'mastered') cardsMastered += 1
    }
    if (st.status === 'strong') counts.strong += 1
    else if (st.status === 'weak') counts.weak += 1
    else if (st.status === 'revision') counts.revision += 1
  }
  const total = correct + wrong
  return {
    accuracy: total > 0 ? correct / total : null,
    questionsAttempted: total,
    questionsCorrect: correct,
    flashcardsReviewed: cardsReviewed,
    flashcardsMastered: cardsMastered,
    chaptersStrong: counts.strong,
    chaptersRevision: counts.revision,
    chaptersWeak: counts.weak,
    chaptersTotal: chapters.length,
    level,
  }
}

// ---------------------------------------------------------------------------
// Daily plan (Home dashboard)
// ---------------------------------------------------------------------------
export interface DailyPlan {
  // live activity today
  questionsToday: number
  correctToday: number
  flashcardsToday: number
  minutesToday: number
  quizzesToday: number
  testsToday: number
  revisionsToday: number
  xpToday: number
  // what the engine recommends
  weakQuestions: number
  dueFlashcards: number
  recommendedChapterId: number | null
  recommendedChapterTitle: string | null
  recommendedMastery: number | null
  // goals
  dailyGoalChapters: number
  dailyGoalMinutes: number
  chaptersDoneToday: number
  dailyDone: boolean
  weeklyProgress: number
  weeklyTarget: number
  weeklyName: string
  weeklyDone: boolean
  streak: number
}

export function computeDailyPlan(
  level: Level,
  chapters: Chapter[],
  progress: Record<number, ChapterProgressRow>,
  perfByQ: Map<string, QuestionPerfRow>,
  srsByCard: Map<string, FlashcardSrsRow>,
  flashcards: Flashcard[],
  daily: DailyStatsRow | null,
  xpToday: number,
  profile: { daily_goal: number; daily_minutes_goal: number },
  weekly: { progress: number; target: number; name: string; completed: number } | null,
  streak: number,
  today: string,
): DailyPlan {
  const levelChapters = chapters.filter((c) => c.level === level)
  const levelIds = new Set(levelChapters.map((c) => c.id))

  // Weak questions across the level.
  let weakQuestions = 0
  perfByQ.forEach((p) => { if (levelIds.has(p.chapter_id) && isWeakQuestion(p)) weakQuestions += 1 })

  // Due flashcards across the level.
  let dueFlashcards = 0
  for (const f of flashcards) {
    if (levelIds.has(f.chapterId) && isCardDue(srsByCard.get(f.id) ?? null, today)) dueFlashcards += 1
  }

  // Recommended chapter: weakest started chapter first, then weakest overall.
  let recommended: ChapterStats | null = null
  for (const c of levelChapters) {
    const st = computeChapterStats(c, progress[c.id], perfByQ, srsByCard, flashcards.filter((f) => f.chapterId === c.id), today)
    if (st.status === 'new') continue
    if (!recommended || (st.overall ?? 0) < (recommended.overall ?? 0)) recommended = st
  }

  const chaptersDoneToday = levelChapters.filter((c) => {
    const at = progress[c.id]?.completed_at
    return at && at.slice(0, 10) === today
  }).length

  return {
    questionsToday: daily?.questions ?? 0,
    correctToday: daily?.correct ?? 0,
    flashcardsToday: daily?.flashcards ?? 0,
    minutesToday: daily?.minutes ?? 0,
    quizzesToday: daily?.quizzes ?? 0,
    testsToday: daily?.tests ?? 0,
    revisionsToday: daily?.revisions ?? 0,
    xpToday,
    weakQuestions,
    dueFlashcards,
    recommendedChapterId: recommended ? recommended.chapterId : levelChapters[0]?.id ?? null,
    recommendedChapterTitle: recommended ? chapters.find((c) => c.id === recommended.chapterId)?.title ?? null : levelChapters[0]?.title ?? null,
    recommendedMastery: recommended?.overall ?? null,
    dailyGoalChapters: profile.daily_goal,
    dailyGoalMinutes: profile.daily_minutes_goal,
    chaptersDoneToday,
    dailyDone: chaptersDoneToday >= profile.daily_goal && (daily?.minutes ?? 0) >= profile.daily_minutes_goal,
    weeklyProgress: weekly?.progress ?? 0,
    weeklyTarget: weekly?.target ?? 1,
    weeklyName: weekly?.name ?? '',
    weeklyDone: !!weekly?.completed,
    streak,
  }
}

// ---------------------------------------------------------------------------
// Revision hub data
// ---------------------------------------------------------------------------
export interface RevisionData {
  dueFlashcards: { card: Flashcard; srs: FlashcardSrsRow | null }[]
  weakQuestions: { q: Question; perf: QuestionPerfRow | null; score: number }[]
  previousMistakes: { q: Question; perf: QuestionPerfRow | null; score: number }[]
  difficultFlashcards: { card: Flashcard; srs: FlashcardSrsRow | null }[]
  recentlyCompleted: Chapter[]
  weakChapters: ChapterStats[]
  chaptersDueRevision: ChapterStats[]
}

export function computeRevisionData(
  level: Level,
  chapters: Chapter[],
  progress: Record<number, ChapterProgressRow>,
  perfByQ: Map<string, QuestionPerfRow>,
  srsByCard: Map<string, FlashcardSrsRow>,
  questions: Question[],
  flashcards: Flashcard[],
  today: string,
): RevisionData {
  const levelChapters = chapters.filter((c) => c.level === level)
  const levelIds = new Set(levelChapters.map((c) => c.id))

  const dueFlashcards: RevisionData['dueFlashcards'] = []
  for (const f of flashcards) {
    if (!levelIds.has(f.chapterId)) continue
    const srs = srsByCard.get(f.id) ?? null
    if (isCardDue(srs, today) && cardTier(srs) !== 'new') dueFlashcards.push({ card: f, srs })
  }
  // Recently learned/difficult shown separately — due list is strictly SRS-due.
  dueFlashcards.sort((a, b) => (a.srs?.due ?? '0000').localeCompare(b.srs?.due ?? '0000'))

  const difficultFlashcards: RevisionData['difficultFlashcards'] = []
  for (const f of flashcards) {
    if (!levelIds.has(f.chapterId)) continue
    const srs = srsByCard.get(f.id) ?? null
    if (cardTier(srs) === 'difficult') difficultFlashcards.push({ card: f, srs })
  }

  const weakQuestions: RevisionData['weakQuestions'] = []
  const previousMistakes: RevisionData['previousMistakes'] = []
  for (const q of questions) {
    if (!levelIds.has(q.chapterId)) continue
    const perf = perfByQ.get(q.id) ?? null
    if (isWeakQuestion(perf)) weakQuestions.push({ q, perf, score: weaknessScore(perf) })
    if (isPreviousMistake(perf)) previousMistakes.push({ q, perf, score: weaknessScore(perf) })
  }
  weakQuestions.sort((a, b) => b.score - a.score)
  previousMistakes.sort((a, b) => b.score - a.score)

  const recentlyCompleted: Chapter[] = []
  for (const c of levelChapters) {
    const at = progress[c.id]?.completed_at
    if (!at) continue
    const last = new Date(at.slice(0, 10) + 'T00:00:00')
    const now = new Date(today + 'T00:00:00')
    const diff = Math.round((now.getTime() - last.getTime()) / 86400000)
    if (diff >= 0 && diff <= 7) recentlyCompleted.push(c)
  }
  recentlyCompleted.sort((a, b) => (progress[b.id]?.completed_at ?? '').localeCompare(progress[a.id]?.completed_at ?? ''))

  const weakChapters: ChapterStats[] = []
  const chaptersDueRevision: ChapterStats[] = []
  for (const c of levelChapters) {
    const st = computeChapterStats(c, progress[c.id], perfByQ, srsByCard, flashcards.filter((f) => f.chapterId === c.id), today)
    if (st.status === 'weak') weakChapters.push(st)
    if (st.status === 'revision' || st.status === 'weak') chaptersDueRevision.push(st)
  }
  weakChapters.sort((a, b) => (a.overall ?? 1) - (b.overall ?? 1))
  chaptersDueRevision.sort((a, b) => (a.overall ?? 1) - (b.overall ?? 1))

  return { dueFlashcards, weakQuestions, previousMistakes, difficultFlashcards, recentlyCompleted, weakChapters, chaptersDueRevision }
}

// ---------------------------------------------------------------------------
// Milestones — unlocked from real aggregated stats, each once.
// ---------------------------------------------------------------------------
export interface MilestoneCheckStats {
  questionsAnswered: number
  flashcardsReviewed: number
  quizzesDone: number
  testsDone: number
  revisionsDone: number
  accuracy: number | null
  daysStudied: number
}

export const MILESTONE_DEFS: { id: string; name: string; desc: string; icon: string }[] = [
  { id: 'm_q_50', name: 'Question Starter', desc: 'Answer 50 quiz questions', icon: 'help-circle' },
  { id: 'm_q_250', name: 'Question Machine', desc: 'Answer 250 quiz questions', icon: 'help-circle' },
  { id: 'm_q_1000', name: 'Question Champion', desc: 'Answer 1,000 quiz questions', icon: 'trophy' },
  { id: 'm_fc_50', name: 'Flashcard Novice', desc: 'Review 50 flashcards', icon: 'layers' },
  { id: 'm_fc_250', name: 'Flashcard Master', desc: 'Review 250 flashcards', icon: 'layers' },
  { id: 'm_qz_5', name: 'Quiz Taker', desc: 'Complete 5 quizzes', icon: 'target' },
  { id: 'm_qz_25', name: 'Quiz Crusher', desc: 'Complete 25 quizzes', icon: 'target' },
  { id: 'm_tst_5', name: 'Test Pilot', desc: 'Complete 5 chapter/paper tests', icon: 'flag' },
  { id: 'm_rev_25', name: 'Revisionist', desc: 'Run 25 revision sessions', icon: 'refresh-cw' },
  { id: 'm_acc_80', name: 'Sharpshooter', desc: 'Reach 80% overall accuracy (100+ questions)', icon: 'crosshair' },
  { id: 'm_days_7', name: 'Week Warrior', desc: 'Study 7 days in a row', icon: 'calendar' },
]

/** Returns the milestone ids whose thresholds the stats now satisfy. */
export function checkMilestones(stats: MilestoneCheckStats, already: Set<string>): string[] {
  const out: string[] = []
  const push = (id: string, ok: boolean) => { if (ok && !already.has(id)) out.push(id) }
  push('m_q_50', stats.questionsAnswered >= 50)
  push('m_q_250', stats.questionsAnswered >= 250)
  push('m_q_1000', stats.questionsAnswered >= 1000)
  push('m_fc_50', stats.flashcardsReviewed >= 50)
  push('m_fc_250', stats.flashcardsReviewed >= 250)
  push('m_qz_5', stats.quizzesDone >= 5)
  push('m_qz_25', stats.quizzesDone >= 25)
  push('m_tst_5', stats.testsDone >= 5)
  push('m_rev_25', stats.revisionsDone >= 25)
  push('m_acc_80', (stats.accuracy ?? 0) >= 0.8 && stats.questionsAnswered >= 100)
  push('m_days_7', stats.daysStudied >= 7)
  return out
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------
export function dateStr(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

export function todayStr(): string {
  return dateStr()
}

export { chaptersForLevel }
