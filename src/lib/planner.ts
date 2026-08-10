import { Chapter } from '../data/curriculum'
import { Question } from '../data/questions'
import { Flashcard } from '../data/flashcards'
import { ChapterProgressRow, QuestionPerfRow, FlashcardSrsRow, MockResultRow, DailyStatsRow } from './db'
import { computeChapterStats, Status, todayStr } from './mastery'
import { PlannerSettings, PlannerTask } from './plannerStore'

// ---------------------------------------------------------------------------
// Date helpers (all YYYY-MM-DD, local time)
// ---------------------------------------------------------------------------

export function dateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return dateStr(d)
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00').getTime()
  const b = new Date(to + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const dow = (d.getDay() + 6) % 7 // Mon=0
  d.setDate(d.getDate() - dow)
  return dateStr(d)
}

// ---------------------------------------------------------------------------
// Phase — transparent, date-driven. Not arbitrary percentages: the closer the
// exam, the more the mix shifts from learning toward revision and mocks.
// ---------------------------------------------------------------------------

export type PlanPhase = 'learning' | 'practice' | 'revision' | 'sprint'

export function planPhaseFor(daysUntil: number | null): PlanPhase {
  if (daysUntil === null) return 'learning'      // no exam date → syllabus-first
  if (daysUntil > 45) return 'learning'          // early: build the base
  if (daysUntil > 15) return 'practice'          // middle: learn + practise
  if (daysUntil > 5) return 'revision'           // late: revise + fix weak spots
  return 'sprint'                                // final days: mocks + high-priority revision
}

export const PHASE_LABELS: Record<PlanPhase, string> = {
  learning: 'Learning phase',
  practice: 'Practice phase',
  revision: 'Revision phase',
  sprint: 'Final sprint',
}

/** Share of the daily budget per task type per phase. */
const PHASE_SHARES: Record<PlanPhase, Record<PlannerTask['type'], number>> = {
  learning: { learn: 0.4, practice: 0.2, revision: 0.15, flashcards: 0.15, mistakes: 0.1, mock: 0 },
  practice: { learn: 0.25, practice: 0.3, revision: 0.2, flashcards: 0.15, mistakes: 0.1, mock: 0 },
  revision: { learn: 0.15, practice: 0.2, revision: 0.35, flashcards: 0.15, mistakes: 0.15, mock: 0 },
  sprint: { learn: 0.05, practice: 0.15, revision: 0.4, flashcards: 0.15, mistakes: 0.1, mock: 0.15 },
}

const TYPE_MINS = { learn: 20, practice: 15, revision: 15, flashcards: 10, mistakes: 10, mock: 45 } as const

// ---------------------------------------------------------------------------
// Chapter classification — New ≠ Weak. A chapter is only Weak once the student
// has actually attempted it and performed poorly.
// ---------------------------------------------------------------------------

export interface ChapterPlanInfo {
  chapterId: number
  paperId: number
  title: string
  status: Status | 'new'
  overall: number | null
  questionsAttempted: number
  completed: boolean
  recentlyActive: boolean
  priority: number
}

export function computeChapterPlanInfos(
  settings: PlannerSettings,
  chapters: Chapter[],
  progress: Record<number, ChapterProgressRow>,
  perfByQ: Map<string, QuestionPerfRow>,
  srsByCard: Map<string, FlashcardSrsRow>,
  flashcards: Flashcard[],
  mockWeak: Map<number, number>,
  today: string,
): ChapterPlanInfo[] {
  const levelChapters = chapters.filter((c) => c.level === settings.level)
  const selected = settings.paperIds && settings.paperIds.length
    ? levelChapters.filter((c) => settings.paperIds!.includes(c.paperId))
    : levelChapters
  const cardsByChapter = new Map<number, Flashcard[]>()
  for (const f of flashcards) {
    const arr = cardsByChapter.get(f.chapterId) ?? []
    arr.push(f)
    cardsByChapter.set(f.chapterId, arr)
  }
  const todayMs = new Date(today + 'T00:00:00').getTime()

  const infos: ChapterPlanInfo[] = []
  for (const ch of selected) {
    const prog = progress[ch.id]
    const st = computeChapterStats(ch, prog, perfByQ, srsByCard, cardsByChapter.get(ch.id) ?? [], today)
    const engaged = (prog?.video_watched || prog?.quiz_completed || st.questionsAttempted > 0)
    const status: Status | 'new' = engaged ? (st.status === 'new' ? 'revision' : st.status) : 'new'

    // Recently active = any roll or card review within the last 3 days.
    let recentlyActive = false
    const perfRows = perfByQ.values()
    for (const p of perfRows) {
      if (p.chapter_id !== ch.id) continue
      if (p.last_seen && todayMs - new Date(p.last_seen.slice(0, 10) + 'T00:00:00').getTime() < 3 * 86400000) {
        recentlyActive = true
        break
      }
    }
    if (!recentlyActive) {
      for (const s of srsByCard.values()) {
        if (!cardsByChapter.get(ch.id)?.some((f) => f.id === s.flashcard_id)) continue
        if (s.last_reviewed && todayMs - new Date(s.last_reviewed.slice(0, 10) + 'T00:00:00').getTime() < 3 * 86400000) {
          recentlyActive = true
          break
        }
      }
    }

    // Priority — transparent scoring. Weak/revision chapters outrank New
    // (unfinished syllabus) chapters; New outranks Strong; recent activity
    // deprioritises; mock failures add a real boost.
    let priority = 0
    const overall = st.overall ?? 0
    const mockBoost = (mockWeak.get(ch.id) ?? 0) * 10
    if (status === 'weak') priority = 120 + (1 - overall) * 40 + mockBoost
    else if (status === 'revision') priority = 70 + (1 - overall) * 30 + mockBoost
    else if (status === 'new') priority = 55
    else priority = 25 + (1 - overall) * 20
    if (prog?.completed) priority -= 40
    if (recentlyActive) priority -= 15

    infos.push({
      chapterId: ch.id,
      paperId: ch.paperId,
      title: ch.title,
      status,
      overall: st.overall,
      questionsAttempted: st.questionsAttempted,
      completed: !!prog?.completed,
      recentlyActive,
      priority,
    })
  }
  return infos.sort((a, b) => b.priority - a.priority)
}

// ---------------------------------------------------------------------------
// Mock performance → weak chapters (real data: wrong answers in recent mocks)
// ---------------------------------------------------------------------------

export function mockWeakChapters(mockRows: MockResultRow[], questions: Question[], limit = 5): Map<number, number> {
  const byId = new Map<string, number>()
  for (const q of questions) byId.set(q.id, q.chapterId)
  const weak = new Map<number, number>()
  for (const m of mockRows.slice(0, limit)) {
    let data: any = null
    try { data = JSON.parse(m.data) } catch { continue }
    if (!data || !Array.isArray(data.poolIds) || !Array.isArray(data.answers)) continue
    data.poolIds.forEach((qid: string, i: number) => {
      const chosen = data.answers[i]
      if (chosen === null) return
      const ch = byId.get(qid)
      if (ch === undefined) return
      const correct = questions.find((q) => q.id === qid)?.correctIndex
      if (correct !== undefined && chosen !== correct) weak.set(ch, (weak.get(ch) ?? 0) + 1)
    })
  }
  return weak
}

// ---------------------------------------------------------------------------
// Aggregated counts (due cards / weak questions / mistakes) for selected papers
// ---------------------------------------------------------------------------

export interface PlannerCounts {
  dueCards: number
  weakQuestions: number
  mistakes: number
  weakestChapterId: number | null
  weakestChapterTitle: string | null
  unfinishedCount: number
}

export function computePlannerCounts(
  settings: PlannerSettings,
  chapters: Chapter[],
  perfByQ: Map<string, QuestionPerfRow>,
  srsByCard: Map<string, FlashcardSrsRow>,
  questions: Question[],
  flashcards: Flashcard[],
  infos: ChapterPlanInfo[],
  today: string,
): PlannerCounts {
  const levelChapters = chapters.filter((c) => c.level === settings.level)
  const selected = settings.paperIds && settings.paperIds.length
    ? new Set(levelChapters.filter((c) => settings.paperIds!.includes(c.paperId)).map((c) => c.id))
    : new Set(levelChapters.map((c) => c.id))

  let weakQuestions = 0
  let mistakes = 0
  for (const q of questions) {
    if (!selected.has(q.chapterId)) continue
    const p = perfByQ.get(q.id)
    if (!p) continue
    if (p.wrong >= 2) weakQuestions += 1
    if (p.wrong >= 1) mistakes += 1
  }
  let dueCards = 0
  for (const f of flashcards) {
    if (!selected.has(f.chapterId)) continue
    const s = srsByCard.get(f.id)
    if (!s) continue
    if (s.due && s.due <= today) dueCards += 1
  }

  const weakest = infos.find((i) => i.status === 'weak' || i.status === 'revision')
  const unfinishedCount = infos.filter((i) => !i.completed).length
  return {
    dueCards,
    weakQuestions,
    mistakes,
    weakestChapterId: weakest?.chapterId ?? null,
    weakestChapterTitle: weakest?.title ?? null,
    unfinishedCount,
  }
}

// ---------------------------------------------------------------------------
// Daily plan generation
// ---------------------------------------------------------------------------

export interface PlanInputs {
  settings: PlannerSettings
  chapters: Chapter[]
  progress: Record<number, ChapterProgressRow>
  perfByQ: Map<string, QuestionPerfRow>
  srsByCard: Map<string, FlashcardSrsRow>
  questions: Question[]
  flashcards: Flashcard[]
  mockRows: MockResultRow[]
  today: string
}

export function computeDailyPlanTasks(
  inputs: PlanInputs,
  infos: ChapterPlanInfo[],
  counts: PlannerCounts,
  skipChapterIds: Set<number> = new Set(),
): PlannerTask[] {
  const { settings, today } = inputs
  const phase = planPhaseFor(settings.examDate ? daysBetween(today, settings.examDate) : null)
  const shares = PHASE_SHARES[phase]
  const budget = Math.max(20, settings.minutesPerDay)
  const daysUntil = settings.examDate ? daysBetween(today, settings.examDate) : null

  const learnCh = infos.find((i) => !i.completed && i.status !== 'strong' && !skipChapterIds.has(i.chapterId))
    ?? infos.find((i) => !i.completed && !skipChapterIds.has(i.chapterId))
  const practiceCh = learnCh ?? infos.find((i) => !i.completed)
  const revCh = infos.find((i) => (i.status === 'weak' || i.status === 'revision') && !i.completed)
    ?? (counts.weakestChapterId ? infos.find((i) => i.chapterId === counts.weakestChapterId) : undefined)

  // Mock day: sprint → every 2 days, revision phase → every 3 days.
  const mockDay = phase === 'sprint' && daysUntil !== null && daysUntil % 2 === 0
    || phase === 'revision' && daysUntil !== null && daysUntil % 3 === 0

  const tasks: PlannerTask[] = []
  if (learnCh) {
    const mins = Math.max(TYPE_MINS.learn, Math.min(settings.sessionLength, Math.round(budget * shares.learn)))
    tasks.push({ id: `${today}|learn|${learnCh.chapterId}`, date: today, type: 'learn', chapterId: learnCh.chapterId, paperId: learnCh.paperId, minutes: mins, detail: `Learn Ch ${learnCh.chapterId}: ${learnCh.title}`, status: 'planned', completedAt: null, actualMinutes: 0 })
  }
  if (practiceCh) {
    const mins = Math.max(TYPE_MINS.practice, Math.round(budget * shares.practice))
    tasks.push({ id: `${today}|practice|${practiceCh.chapterId}`, date: today, type: 'practice', chapterId: practiceCh.chapterId, paperId: practiceCh.paperId, minutes: mins, detail: `Practise Ch ${practiceCh.chapterId}: ${practiceCh.title}`, status: 'planned', completedAt: null, actualMinutes: 0 })
  }
  if (revCh) {
    const mins = Math.max(TYPE_MINS.revision, Math.round(budget * shares.revision))
    tasks.push({ id: `${today}|revision|${revCh.chapterId}`, date: today, type: 'revision', chapterId: revCh.chapterId, paperId: revCh.paperId, minutes: mins, detail: `Revise Ch ${revCh.chapterId}: ${revCh.title} — weak area`, status: 'planned', completedAt: null, actualMinutes: 0 })
  }
  if (counts.dueCards > 0) {
    const mins = Math.max(TYPE_MINS.flashcards, Math.round(budget * shares.flashcards))
    tasks.push({ id: `${today}|flashcards|all`, date: today, type: 'flashcards', chapterId: null, paperId: null, minutes: mins, detail: `${counts.dueCards} flashcards due`, status: 'planned', completedAt: null, actualMinutes: 0 })
  }
  if (counts.mistakes > 0) {
    const mins = Math.max(TYPE_MINS.mistakes, Math.round(budget * shares.mistakes))
    tasks.push({ id: `${today}|mistakes|all`, date: today, type: 'mistakes', chapterId: null, paperId: null, minutes: mins, detail: `${counts.mistakes} previous mistakes`, status: 'planned', completedAt: null, actualMinutes: 0 })
  }
  if (mockDay) {
    const mins = budget >= 90 ? 60 : budget >= 60 ? 45 : 30
    tasks.push({ id: `${today}|mock|all`, date: today, type: 'mock', chapterId: null, paperId: settings.paperIds?.[0] ?? null, minutes: mins, detail: 'Full mock exam', status: 'planned', completedAt: null, actualMinutes: 0 })
  }

  // Fit the budget — the student's available time is a hard limit. First trim
  // surplus from the lowest-priority tasks (reverse order), then drop the
  // lowest-priority tasks entirely if the minimums still don't fit.
  const order: PlannerTask['type'][] = ['learn', 'practice', 'revision', 'mock', 'flashcards', 'mistakes']
  let total = tasks.reduce((s, t) => s + t.minutes, 0)
  if (total > budget) {
    let overflow = total - budget
    for (let i = order.length - 1; i >= 0 && overflow > 0; i--) {
      const t = tasks.find((x) => x.type === order[i])
      if (!t) continue
      const cut = Math.min(t.minutes - TYPE_MINS[t.type], overflow)
      t.minutes -= cut
      overflow -= cut
    }
    while (overflow > 0 && tasks.length > 1) {
      let worst = -1
      for (let i = order.length - 1; i >= 0; i--) {
        const idx = tasks.findIndex((x) => x.type === order[i])
        if (idx !== -1) { worst = idx; break }
      }
      if (worst === -1) break
      const [removed] = tasks.splice(worst, 1)
      overflow -= removed.minutes
    }
  }
  return tasks.filter((t) => t.minutes > 0)
}

// ---------------------------------------------------------------------------
// Weekly plan (next 7 days) + planner overview
// ---------------------------------------------------------------------------

export interface WeekPlan {
  tasks: PlannerTask[]
  days: { date: string; tasks: PlannerTask[] }[]
  plannedMinutes: number
}

export function computeWeekPlan(inputs: PlanInputs): WeekPlan {
  const { settings, today } = inputs
  const infos = computeChapterPlanInfos(
    settings, inputs.chapters, inputs.progress, inputs.perfByQ, inputs.srsByCard,
    inputs.flashcards, mockWeakChapters(inputs.mockRows, inputs.questions), today,
  )
  const counts = computePlannerCounts(settings, inputs.chapters, inputs.perfByQ, inputs.srsByCard, inputs.questions, inputs.flashcards, infos, today)

  const days: { date: string; tasks: PlannerTask[] }[] = []
  const scheduled = new Set<number>()
  const all: PlannerTask[] = []
  // Respect the student's study days: the first `daysPerWeek` days of each
  // week (Mon-based) are study days, the rest are rest days with no tasks.
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i)
    const dow = (new Date(d + 'T00:00:00').getDay() + 6) % 7 // Mon=0
    if (dow >= settings.daysPerWeek) {
      days.push({ date: d, tasks: [] })
      continue
    }
    const dayInfos = [...infos].map((c) => ({ ...c, priority: c.priority + (scheduled.has(c.chapterId) ? -30 : 0) }))
      .sort((a, b) => b.priority - a.priority)
    const dayTasks = computeDailyPlanTasks({ ...inputs, today: d }, dayInfos, counts, scheduled)
    dayTasks.forEach((t) => { if (t.chapterId !== null) scheduled.add(t.chapterId) })
    days.push({ date: d, tasks: dayTasks })
    all.push(...dayTasks)
  }
  return { tasks: all, days, plannedMinutes: all.reduce((s, t) => s + t.minutes, 0) }
}

export interface PlannerOverview {
  phase: PlanPhase
  daysUntil: number | null
  phaseLabel: string
  unfinishedCount: number
  weakRevisionCount: number
  warnings: string[]
}

export function computePlannerOverview(
  inputs: PlanInputs,
  infos: ChapterPlanInfo[],
  _weekPlan: WeekPlan,
): PlannerOverview {
  const { settings, today } = inputs
  const daysUntil = settings.examDate ? daysBetween(today, settings.examDate) : null
  const phase = planPhaseFor(daysUntil)
  const warnings: string[] = []

  const weakRevision = infos.filter((i) => i.status === 'weak' || i.status === 'revision')
  if (weakRevision.length >= 2) warnings.push(`${weakRevision.length} chapters need revision — focus on the weakest first.`)

  // Transparent pacing check: estimate hours needed vs capacity before the exam.
  if (daysUntil !== null && daysUntil > 0) {
    const unfinished = infos.filter((i) => !i.completed).length
    const avgHoursPerChapter = 3
    const estimate = unfinished * avgHoursPerChapter
    const capacity = (daysUntil * settings.minutesPerDay) / 60
    if (estimate > capacity) {
      const shortfall = Math.ceil((estimate - capacity) / avgHoursPerChapter)
      warnings.push(`At the current pace, about ${shortfall} chapter${shortfall > 1 ? 's' : ''} may remain before the exam. Consider more time or fewer papers.`)
    }
  }

  return {
    phase,
    daysUntil,
    phaseLabel: PHASE_LABELS[phase],
    unfinishedCount: infos.filter((i) => !i.completed).length,
    weakRevisionCount: weakRevision.length,
    warnings: warnings.slice(0, 2),
  }
}

// ---------------------------------------------------------------------------
// Weekly actuals from daily stats (planned vs completed)
// ---------------------------------------------------------------------------

export interface WeekActuals {
  plannedMinutes: number
  completedMinutes: number
  percent: number
}

export function computeWeekActuals(weekPlan: WeekPlan, dailyStats: DailyStatsRow[], today: string): WeekActuals {
  const ws = weekStart(today)
  let completed = 0
  for (const d of dailyStats) {
    if (d.day >= ws && d.day <= today) completed += d.minutes || 0
  }
  const planned = weekPlan.plannedMinutes
  const percent = planned > 0 ? Math.min(1, completed / planned) : 0
  return { plannedMinutes: planned, completedMinutes: Math.round(completed), percent }
}

export { todayStr }
