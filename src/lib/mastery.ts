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
import { Chapter, Level, Paper, chaptersForLevel, papersForLevel, chapterById } from '../data/curriculum'
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
  mockComplete: 25,        // every completed mock exam
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
// Mastery calculation core
// ---------------------------------------------------------------------------
// The accuracy signal is built from REAL per-question rolls and shaped by four
// deterministic forces:
//   1. Difficulty — correctly answering a question that is HARD FOR THIS
//      STUDENT proves more mastery; missing one that is easy for them is more
//      damning. Per-question weight: hard 1.35 / medium 1.0 / easy 0.7.
//   2. Recency — evidence decays (~half-life 30 days), so a chapter last
//      practised a month ago contributes less than one practised today, and
//      a stale chapter drifts back toward needing revision.
//   3. Stability — Laplace smoothing (+1 / +2) keeps tiny samples from
//      swinging mastery wildly (a single correct answer no longer reads 100%).
//   4. Repeated mistakes — every persistently-failed (weak) question drags
//      the accuracy component down beyond its raw ratio.

function diffWeight(d: Difficulty): number {
  if (d === 'hard') return 1.35
  if (d === 'easy') return 0.7
  return 1
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a.slice(0, 10) + 'T00:00:00').getTime()
  const db = new Date(b.slice(0, 10) + 'T00:00:00').getTime()
  return Math.max(0, Math.round((db - da) / 86400000))
}

function recencyWeight(lastSeen: string | undefined, today: string): number {
  if (!lastSeen) return 1
  return 1 / (1 + daysBetween(lastSeen, today) / 30)
}

export interface WeightedAccuracy {
  accuracy: number | null // 0..1 smoothed
  attempts: number        // raw attempt count (display / confidence)
  lastSeenDays: number | null // days since the newest attempt in the group
}

export function computeWeightedAccuracy(rows: QuestionPerfRow[], today: string): WeightedAccuracy {
  let wCorrect = 0
  let wWrong = 0
  let rawTotal = 0
  let newest: number | null = null
  for (const p of rows) {
    const w = recencyWeight(p.last_seen, today)
    const dw = diffWeight(difficultyOf(p))
    wCorrect += p.correct * w * dw
    wWrong += p.wrong * w * (1 / dw)
    rawTotal += p.correct + p.wrong
    if (p.last_seen) {
      const d = daysBetween(p.last_seen, today)
      if (newest === null || d < newest) newest = d
    }
  }
  if (rawTotal === 0) return { accuracy: null, attempts: 0, lastSeenDays: newest }
  return { accuracy: (wCorrect + 1) / (wCorrect + wWrong + 2), attempts: rawTotal, lastSeenDays: newest }
}

/** Small deterministic freshness signal: recently-practised content gets a
 *  tiny boost; content untouched for 3+ weeks gets a tiny drag (needs a look). */
function recencyAdjust(lastSeenDays: number | null): number {
  if (lastSeenDays === null) return 0
  if (lastSeenDays <= 7) return 0.02
  if (lastSeenDays > 21) return -0.02
  return 0
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

// ---------------------------------------------------------------------------
// Chapter mastery
// ---------------------------------------------------------------------------
export interface ChapterStats {
  chapterId: number
  completion: number | null   // 0..1 across video/PDF/quiz evidence
  accuracy: number | null     // 0..1 weighted, smoothed, decayed
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
  return computeChapterStatsFromRows(
    chapter, prog, chapterQuestionsFor(chapter.id, perfByQ), srsByCard, chapterCards, today,
  )
}

/** Core chapter computation with pre-grouped rolls — used by the single-pass
 *  level computation to avoid re-scanning the whole performance table per chapter. */
export function computeChapterStatsFromRows(
  chapter: Chapter,
  prog: ChapterProgressRow | undefined,
  chapterQuestions: QuestionPerfRow[],
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

  // Accuracy: difficulty-weighted, recency-decayed, Laplace-smoothed.
  const wa = computeWeightedAccuracy(chapterQuestions, today)
  let weak = 0
  for (const p of chapterQuestions) if (isWeakQuestion(p)) weak += 1
  // Repeated mistakes drag accuracy beyond the raw ratio.
  const accuracy = wa.accuracy === null ? null : Math.max(0, wa.accuracy - Math.min(0.12, weak * 0.025))

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
  // Weights re-normalise so missing components never punish the student,
  // then the small recency freshness adjustment is applied.
  const W = { completion: 0.4, accuracy: 0.4, flashcards: 0.2 }
  let weight = 0
  let sum = 0
  if (completion !== null) { weight += W.completion; sum += completion * W.completion }
  if (accuracy !== null) { weight += W.accuracy; sum += accuracy * W.accuracy }
  if (flashcardMastery !== null) { weight += W.flashcards; sum += flashcardMastery * W.flashcards }
  const overall = weight > 0 ? clamp01(sum / weight + recencyAdjust(wa.lastSeenDays)) : (completion ?? null)

  const started = (prog?.video_watched || prog?.quiz_completed || pdfs.length > 0 || wa.attempts > 0 || cardsReviewed > 0) ?? false
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
    questionsAttempted: wa.attempts,
    questionsCorrect: chapterQuestions.reduce((s, p) => s + p.correct, 0),
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

// ---------------------------------------------------------------------------
// Paper mastery — Question → Chapter → Paper → Level
// ---------------------------------------------------------------------------
// Paper stats are NOT an average of chapter percentages. Each component is
// recomputed from raw paper-scope evidence: completion = mean chapter
// completion (null → 0, i.e. the fraction of the paper actually engaged),
// accuracy = the paper's own weighted/decayed/smoothed question rolls,
// flashcard mastery = mastered cards ÷ cards in the paper, and overall is the
// same re-normalised blend used at chapter level.

export interface PaperStats {
  paperId: number
  code: string
  name: string
  overall: number | null
  completion: number | null
  accuracy: number | null
  flashcardMastery: number | null
  status: Status
  chaptersStrong: number
  chaptersRevision: number
  chaptersWeak: number
  chaptersNew: number
  chaptersTotal: number
  questionsAttempted: number
  questionsCorrect: number
  cardsMastered: number
  cardsTotal: number
}

export function computePaperStats(
  paper: Paper,
  chapters: Chapter[],
  chapterStats: Map<number, ChapterStats>,
  paperRows: QuestionPerfRow[],
  srsByCard: Map<string, FlashcardSrsRow>,
  cardsByChapter: Map<number, Flashcard[]>,
  today: string,
): PaperStats {
  const paperChapters = chapters.filter((c) => c.paperId === paper.id)

  // Completion: mean of chapter completions (untouched chapters count as 0).
  let completion: number | null = null
  if (paperChapters.length > 0) {
    let sum = 0
    for (const c of paperChapters) sum += chapterStats.get(c.id)?.completion ?? 0
    completion = sum / paperChapters.length
  }

  // Accuracy: the paper's own aggregate question rolls.
  const wa = computeWeightedAccuracy(paperRows, today)
  let weakQ = 0
  for (const p of paperRows) if (isWeakQuestion(p)) weakQ += 1
  const accuracy = wa.accuracy === null ? null : Math.max(0, wa.accuracy - Math.min(0.1, weakQ * 0.02))

  // Flashcard mastery across the paper's chapters.
  let mastered = 0
  let cardsTotal = 0
  for (const c of paperChapters) {
    for (const card of cardsByChapter.get(c.id) ?? []) {
      cardsTotal += 1
      if (cardTier(srsByCard.get(card.id) ?? null) === 'mastered') mastered += 1
    }
  }
  const flashcardMastery = cardsTotal > 0 ? mastered / cardsTotal : null

  // Chapter status counts.
  const counts = { strong: 0, revision: 0, weak: 0, fresh: 0 }
  for (const c of paperChapters) {
    const st = chapterStats.get(c.id)
    if (!st) continue
    if (st.status === 'strong') counts.strong += 1
    else if (st.status === 'weak') counts.weak += 1
    else if (st.status === 'revision') counts.revision += 1
    else counts.fresh += 1
  }

  const W = { completion: 0.4, accuracy: 0.4, flashcards: 0.2 }
  let weight = 0
  let sum = 0
  if (completion !== null) { weight += W.completion; sum += completion * W.completion }
  if (accuracy !== null) { weight += W.accuracy; sum += accuracy * W.accuracy }
  if (flashcardMastery !== null) { weight += W.flashcards; sum += flashcardMastery * W.flashcards }
  const overall = weight > 0 ? clamp01(sum / weight + recencyAdjust(wa.lastSeenDays)) : completion

  let status: Status = 'new'
  if (counts.strong + counts.revision + counts.weak > 0) {
    if (overall === null) status = 'revision'
    else if (overall >= 0.75) status = 'strong'
    else if (overall >= 0.5) status = 'revision'
    else status = 'weak'
  }

  let questionsCorrect = 0
  for (const p of paperRows) questionsCorrect += p.correct

  return {
    paperId: paper.id,
    code: paper.code,
    name: paper.name,
    overall,
    completion,
    accuracy,
    flashcardMastery,
    status,
    chaptersStrong: counts.strong,
    chaptersRevision: counts.revision,
    chaptersWeak: counts.weak,
    chaptersNew: counts.fresh,
    chaptersTotal: paperChapters.length,
    questionsAttempted: wa.attempts,
    questionsCorrect,
    cardsMastered: mastered,
    cardsTotal,
  }
}

// ---------------------------------------------------------------------------
// Level mastery — one efficient pass over the level's data.
// ---------------------------------------------------------------------------
export interface LevelMastery {
  level: Level
  chapters: ChapterStats[]
  chapterById: Map<number, ChapterStats>
  papers: PaperStats[]
  overall: number | null
  accuracy: number | null
  completion: number | null
  flashcardMastery: number | null
  status: Status
  questionsAttempted: number
  questionsCorrect: number
  chaptersStrong: number
  chaptersRevision: number
  chaptersWeak: number
  chaptersNew: number
  chaptersTotal: number
}

export function computeLevelMastery(
  level: Level,
  chapters: Chapter[],
  progress: Record<number, ChapterProgressRow>,
  perfByQ: Map<string, QuestionPerfRow>,
  srsByCard: Map<string, FlashcardSrsRow>,
  flashcards: Flashcard[],
  today: string,
): LevelMastery {
  const levelChapters = chapters.filter((c) => c.level === level)
  const papers = papersForLevel(level)
  const levelIds = new Set(levelChapters.map((c) => c.id))
  const paperOfChapter = new Map<number, number>()
  levelChapters.forEach((c) => paperOfChapter.set(c.id, c.paperId))

  // Group data ONCE — cards by chapter, rolls by chapter and by paper.
  const cardsByChapter = new Map<number, Flashcard[]>()
  const rowsByChapter = new Map<number, QuestionPerfRow[]>()
  const rowsByPaper = new Map<number, QuestionPerfRow[]>()
  for (const f of flashcards) {
    if (!levelIds.has(f.chapterId)) continue
    const arr = cardsByChapter.get(f.chapterId) ?? []
    arr.push(f)
    cardsByChapter.set(f.chapterId, arr)
  }
  for (const p of perfByQ.values()) {
    if (!levelIds.has(p.chapter_id)) continue
    const rc = rowsByChapter.get(p.chapter_id) ?? []
    rc.push(p)
    rowsByChapter.set(p.chapter_id, rc)
    const pid = paperOfChapter.get(p.chapter_id)
    if (pid === undefined) continue
    const rp = rowsByPaper.get(pid) ?? []
    rp.push(p)
    rowsByPaper.set(pid, rp)
  }

  // All chapter stats in one pass.
  const chapterById = new Map<number, ChapterStats>()
  for (const c of levelChapters) {
    chapterById.set(c.id, computeChapterStatsFromRows(
      c, progress[c.id], rowsByChapter.get(c.id) ?? [], srsByCard, cardsByChapter.get(c.id) ?? [], today,
    ))
  }

  // Paper stats.
  const paperStats: PaperStats[] = []
  for (const p of papers) {
    paperStats.push(computePaperStats(p, levelChapters, chapterById, rowsByPaper.get(p.id) ?? [], srsByCard, cardsByChapter, today))
  }

  // Level-wide aggregates.
  const levelRows: QuestionPerfRow[] = []
  rowsByPaper.forEach((rows) => levelRows.push(...rows))
  const wa = computeWeightedAccuracy(levelRows, today)
  let cardsMastered = 0
  let cardsTotal = 0
  cardsByChapter.forEach((cards) => {
    cardsTotal += cards.length
    for (const c of cards) if (cardTier(srsByCard.get(c.id) ?? null) === 'mastered') cardsMastered += 1
  })
  const flashcardMastery = cardsTotal > 0 ? cardsMastered / cardsTotal : null
  const completions = paperStats.map((ps) => ps.completion ?? 0)
  const completion = completions.length > 0 ? completions.reduce((s, v) => s + v, 0) / completions.length : null

  const counts = { strong: 0, revision: 0, weak: 0, fresh: 0 }
  chapterById.forEach((st) => {
    if (st.status === 'strong') counts.strong += 1
    else if (st.status === 'weak') counts.weak += 1
    else if (st.status === 'revision') counts.revision += 1
    else counts.fresh += 1
  })

  const W = { completion: 0.4, accuracy: 0.4, flashcards: 0.2 }
  let weight = 0
  let sum = 0
  if (completion !== null) { weight += W.completion; sum += completion * W.completion }
  if (wa.accuracy !== null) { weight += W.accuracy; sum += wa.accuracy * W.accuracy }
  if (flashcardMastery !== null) { weight += W.flashcards; sum += flashcardMastery * W.flashcards }
  const overall = weight > 0 ? clamp01(sum / weight + recencyAdjust(wa.lastSeenDays)) : completion

  let status: Status = 'new'
  if (counts.strong + counts.revision + counts.weak > 0) {
    if (overall === null) status = 'revision'
    else if (overall >= 0.75) status = 'strong'
    else if (overall >= 0.5) status = 'revision'
    else status = 'weak'
  }

  let questionsCorrect = 0
  chapterById.forEach((st) => { questionsCorrect += st.questionsCorrect })

  return {
    level,
    chapters: [...chapterById.values()],
    chapterById,
    papers: paperStats,
    overall,
    accuracy: wa.accuracy,
    completion,
    flashcardMastery,
    status,
    questionsAttempted: wa.attempts,
    questionsCorrect,
    chaptersStrong: counts.strong,
    chaptersRevision: counts.revision,
    chaptersWeak: counts.weak,
    chaptersNew: counts.fresh,
    chaptersTotal: levelChapters.length,
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
  let questionsCorrect = 0
  let cardsReviewed = 0
  let cardsMastered = 0
  const counts = { strong: 0, revision: 0, weak: 0 }
  const ids = new Set(chapters.map((c) => c.id))
  const rows: QuestionPerfRow[] = []
  perfByQ.forEach((p) => { if (ids.has(p.chapter_id)) rows.push(p) })
  for (const chapter of chapters) {
    const cards = flashcards.filter((f) => f.chapterId === chapter.id)
    const st = computeChapterStats(chapter, progress[chapter.id], perfByQ, srsByCard, cards, today)
    questionsCorrect += st.questionsCorrect
    cardsReviewed += st.cardsReviewed
    for (const card of cards) {
      if (cardTier(srsByCard.get(card.id) ?? null) === 'mastered') cardsMastered += 1
    }
    if (st.status === 'strong') counts.strong += 1
    else if (st.status === 'weak') counts.weak += 1
    else if (st.status === 'revision') counts.revision += 1
  }
  const wa = computeWeightedAccuracy(rows, today)
  return {
    accuracy: wa.accuracy,
    questionsAttempted: wa.attempts,
    questionsCorrect,
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

  const cardsByChapter = new Map<number, Flashcard[]>()
  for (const f of flashcards) {
    if (!levelIds.has(f.chapterId)) continue
    const arr = cardsByChapter.get(f.chapterId) ?? []
    arr.push(f)
    cardsByChapter.set(f.chapterId, arr)
  }

  const weakChapters: ChapterStats[] = []
  const chaptersDueRevision: ChapterStats[] = []
  for (const c of levelChapters) {
    const st = computeChapterStats(c, progress[c.id], perfByQ, srsByCard, cardsByChapter.get(c.id) ?? [], today)
    if (st.status === 'weak') weakChapters.push(st)
    if (st.status === 'revision' || st.status === 'weak') chaptersDueRevision.push(st)
  }
  weakChapters.sort((a, b) => (a.overall ?? 1) - (b.overall ?? 1))
  chaptersDueRevision.sort((a, b) => (a.overall ?? 1) - (b.overall ?? 1))

  return { dueFlashcards, weakQuestions, previousMistakes, difficultFlashcards, recentlyCompleted, weakChapters, chaptersDueRevision }
}

// ---------------------------------------------------------------------------
// Targeted revision engine (Phase 3)
// ---------------------------------------------------------------------------
// computeTargetedSession builds a focused question+flashcard session for ONE
// weak area from REAL stored performance. Selection is deterministic:
// touched questions rank by a revision score (repeated mistakes > low personal
// accuracy > recently-failed > hard-for-you); untouched questions only fill
// when the chapter genuinely has little data. Difficult/weak/due cards rank
// above unseen ones. Unrelated chapters are never mixed in.

export type RevisionMode = 'quick' | 'deep' | 'wrong' | 'cards' | 'weakest'

export interface RevisionTarget {
  chapterId: number
  chapterTitle: string
  mode: RevisionMode
  questionIds: string[]
  cardIds: string[]
  reasons: string[]
  estimated: { questions: number; cards: number }
}

const REVISION_SIZES: Record<RevisionMode, { q: number; fc: number }> = {
  quick: { q: 10, fc: 5 },
  deep: { q: 20, fc: 10 },
  wrong: { q: 20, fc: 5 },
  cards: { q: 0, fc: 15 },
  weakest: { q: 10, fc: 5 },
}

/** How urgently THIS question needs revision: repeated mistakes weigh most,
 *  a recently-failed question outranks stale evidence, hard-for-you adds
 *  weight. Untouched questions score 0 — new is not weak. */
export function revisionQuestionScore(p: QuestionPerfRow | null, today: string): number {
  if (!p) return 0
  const total = p.correct + p.wrong
  if (total === 0) return 0
  let s = weaknessScore(p)
  if (p.last_seen) {
    const d = daysBetween(p.last_seen, today)
    if (d <= 7 && p.last_result === 0) s += 1.5 // just failed → urgent
    else if (d <= 7 && p.last_result === 1) s += 0.5
    else if (d > 14) s -= 0.5 // stale → less urgent than fresh failures
  }
  if (difficultyOf(p) === 'hard') s += 0.5
  return Math.max(0, s)
}

/** Flashcard priority: difficult > weak > due > seen-but-not-due > unseen. */
export function cardRevisionPriority(srs: FlashcardSrsRow | null, today: string): number {
  if (!srs) return 0.2
  const t = cardTier(srs)
  if (t === 'difficult') return 3
  if (t === 'weak') return 2
  if (t === 'mastered') return 0
  return isCardDue(srs, today) ? 1 : 0.3
}

export function computeTargetedSession(
  chapterId: number,
  mode: RevisionMode,
  perfByQ: Map<string, QuestionPerfRow>,
  srsByCard: Map<string, FlashcardSrsRow>,
  questions: Question[],
  flashcards: Flashcard[],
  today: string,
  flags?: Set<string>,
): RevisionTarget {
  const chapter = chapterById(chapterId)
  const chapterQs = questions.filter((q) => q.chapterId === chapterId)
  const chapterCards = flashcards.filter((f) => f.chapterId === chapterId)

  const scoredQs = chapterQs
    .map((q) => {
      let s = revisionQuestionScore(perfByQ.get(q.id) ?? null, today)
      if (flags?.has(q.id)) s += 2 // manually flagged "add to revision" from mock review
      return { q, s }
    })
    .sort((a, b) => b.s - a.s)
  const scoredCards = chapterCards
    .map((c) => ({ c, s: cardRevisionPriority(srsByCard.get(c.id) ?? null, today) }))
    .sort((a, b) => b.s - a.s)

  const size = REVISION_SIZES[mode]

  let qSel: Question[]
  let cSel: Flashcard[]
  if (mode === 'wrong') {
    qSel = scoredQs.filter((x) => isPreviousMistake(perfByQ.get(x.q.id) ?? null)).slice(0, size.q).map((x) => x.q)
    cSel = scoredCards.filter((x) => x.s >= 2).slice(0, size.fc).map((x) => x.c)
  } else if (mode === 'cards') {
    qSel = []
    cSel = scoredCards.filter((x) => x.s >= 2).slice(0, size.fc).map((x) => x.c)
  } else {
    qSel = scoredQs.slice(0, size.q).map((x) => x.q)
    cSel = scoredCards.slice(0, size.fc).map((x) => x.c)
  }

  // Graceful fill — never an empty/broken session: top up from the chapter.
  // "Wrong Answers" is the exception: it must stay strictly within previously-
  // missed questions (a few fewer is better than padding with unseen ones).
  if (mode !== 'wrong' && qSel.length < size.q && qSel.length < chapterQs.length) {
    qSel = scoredQs.slice(0, Math.min(size.q, chapterQs.length)).map((x) => x.q)
  }
  if (mode !== 'cards' && cSel.length < Math.min(size.fc, 5) && chapterCards.length > 0) {
    cSel = scoredCards.slice(0, Math.min(size.fc, chapterCards.length)).map((x) => x.c)
  }

  const mistakes = scoredQs.filter((x) => isPreviousMistake(perfByQ.get(x.q.id) ?? null)).length
  const weakQs = scoredQs.filter((x) => isWeakQuestion(perfByQ.get(x.q.id) ?? null)).length
  const difficultCards = scoredCards.filter((x) => x.s >= 2).length
  const dueCards = scoredCards.filter((x) => x.s === 1).length

  const reasons: string[] = []
  if (mode === 'wrong') reasons.push('Only previously-missed questions')
  if (mode === 'cards') reasons.push('Only difficult/weak cards')
  if (mistakes > 0) reasons.push(`${mistakes} repeated mistake${mistakes > 1 ? 's' : ''}`)
  if (weakQs > 0 && mode !== 'wrong') reasons.push(`${weakQs} weak question${weakQs > 1 ? 's' : ''}`)
  if (difficultCards > 0) reasons.push(`${difficultCards} difficult card${difficultCards > 1 ? 's' : ''}`)
  if (dueCards > 0) reasons.push(`${dueCards} card${dueCards > 1 ? 's' : ''} due`)

  return {
    chapterId,
    chapterTitle: chapter?.title ?? `Chapter ${chapterId}`,
    mode,
    questionIds: qSel.map((q) => q.id),
    cardIds: cSel.map((c) => c.id),
    reasons,
    estimated: { questions: qSel.length, cards: cSel.length },
  }
}

// ---------------------------------------------------------------------------
// Revision areas — the hub's view of the whole level, one grouped pass.
// ---------------------------------------------------------------------------
export interface RevisionAreaDetails {
  chapterId: number
  status: Status
  overall: number | null
  accuracy: number | null
  mistakes: number
  weakQs: number
  difficultCards: number
  dueCards: number
  recentAccuracy: number | null
  improving: boolean
}

export interface RevisionAreas {
  byChapter: Map<number, RevisionAreaDetails>
  weakest: RevisionAreaDetails | null
  needsRevision: RevisionAreaDetails[]
  improving: RevisionAreaDetails[]
}

export function computeRevisionAreas(
  level: Level,
  chapters: Chapter[],
  progress: Record<number, ChapterProgressRow>,
  perfByQ: Map<string, QuestionPerfRow>,
  srsByCard: Map<string, FlashcardSrsRow>,
  questions: Question[],
  flashcards: Flashcard[],
  today: string,
): RevisionAreas {
  const levelChapters = chapters.filter((c) => c.level === level)
  const ids = new Set(levelChapters.map((c) => c.id))
  const todayMs = new Date(today + 'T00:00:00').getTime()

  const mistakes = new Map<number, number>()
  const weakQs = new Map<number, number>()
  const recentRows = new Map<number, { correct: number; total: number }>()
  for (const q of questions) {
    const p = perfByQ.get(q.id)
    if (!p || !ids.has(p.chapter_id)) continue
    if (p.wrong >= 1) mistakes.set(p.chapter_id, (mistakes.get(p.chapter_id) ?? 0) + 1)
    if (isWeakQuestion(p)) weakQs.set(p.chapter_id, (weakQs.get(p.chapter_id) ?? 0) + 1)
    if (p.last_seen) {
      const d = Math.round((todayMs - new Date(p.last_seen.slice(0, 10) + 'T00:00:00').getTime()) / 86400000)
      if (d >= 0 && d <= 7) {
        const r = recentRows.get(p.chapter_id) ?? { correct: 0, total: 0 }
        r.correct += p.correct
        r.total += p.correct + p.wrong
        recentRows.set(p.chapter_id, r)
      }
    }
  }
  const difficult = new Map<number, number>()
  const dueCards = new Map<number, number>()
  for (const f of flashcards) {
    if (!ids.has(f.chapterId)) continue
    const s = srsByCard.get(f.id) ?? null
    const t = cardTier(s)
    if (t === 'difficult') difficult.set(f.chapterId, (difficult.get(f.chapterId) ?? 0) + 1)
    if (isCardDue(s, today)) dueCards.set(f.chapterId, (dueCards.get(f.chapterId) ?? 0) + 1)
  }

  const mastery = computeLevelMastery(level, chapters, progress, perfByQ, srsByCard, flashcards, today)
  const byChapter = new Map<number, RevisionAreaDetails>()
  for (const st of mastery.chapters) {
    if (st.status === 'new') continue
    const recent = recentRows.get(st.chapterId)
    const recentAccuracy = recent && recent.total >= 3 ? recent.correct / recent.total : null
    byChapter.set(st.chapterId, {
      chapterId: st.chapterId,
      status: st.status,
      overall: st.overall,
      accuracy: st.accuracy,
      mistakes: mistakes.get(st.chapterId) ?? 0,
      weakQs: weakQs.get(st.chapterId) ?? 0,
      difficultCards: difficult.get(st.chapterId) ?? 0,
      dueCards: dueCards.get(st.chapterId) ?? 0,
      recentAccuracy,
      improving: recentAccuracy !== null && recentAccuracy >= 0.6,
    })
  }

  const needing = [...byChapter.values()]
    .filter((d) => d.status === 'weak' || d.status === 'revision')
    .sort((a, b) => (a.overall ?? 1) - (b.overall ?? 1))
  const weakest = needing[0] ?? null
  const needsRevision = needing.filter((d) => d !== weakest)
  const improving = [...byChapter.values()]
    .filter((d) => d.improving)
    .sort((a, b) => (b.recentAccuracy ?? 0) - (a.recentAccuracy ?? 0))

  return { byChapter, weakest, needsRevision, improving }
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
