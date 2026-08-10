import { create } from 'zustand'
import { curriculum, Level, chaptersForLevel, chaptersForPaper, papersForLevel, chapterById } from '../data/curriculum'
import { questions as allQuestions } from '../data/questions'
import { flashcards as allFlashcards } from '../data/flashcards'
import {
  getProfile, saveProfile, getChapterProgress, getAllChapterProgress, saveChapterProgress,
  addXp, getTotalXp, getBadges, unlockBadge, getStreak, saveStreak,
  recordQuizAttempt, getFlashcardProgress, saveFlashcardProgress,
  getBookmarks, toggleBookmark, getWeeklyChallenge, saveWeeklyChallenge, initDatabase,
  resetAllData, hasClaimedGrandFinal, StreakRow,
  getAllQuestionPerf, saveQuestionPerf, getAllFlashcardSrs, saveFlashcardSrs,
  recordQuizSession, getDailyStats, saveDailyStats,
  getMilestones, unlockMilestone, getAllPersonalBests, savePersonalBest,
  clearMockResults, clearRevisionFlags, saveActiveMock,
} from '../lib/store'
import type { ChapterProgressRow, QuestionPerfRow, FlashcardSrsRow, DailyStatsRow, PersonalBestRow } from '../lib/db'
import { BADGES, WEEKLY_CHALLENGES, getChallengeForWeek, weekNumber, levelForXp } from '../lib/levels'
import { ThemeId, DEFAULT_THEME, normalizeTheme } from '../lib/themes'
import { setStatusBarColor } from '../lib/capacitor'
import { passMarkFor } from '../hooks/useQuizSession'
import {
  XP, SrsGrade, srsReview, dateStr, todayStr,
  checkMilestones, computeDailyPlan, computeMasterySummary,
} from '../lib/mastery'
import type { DailyPlan, MasterySummary } from '../lib/mastery'

export type ThemeMode = ThemeId

export type QuizMode = 'chapter' | 'chapter_test' | 'weak' | 'mistakes' | 'timed' | 'practice' | 'revision' | 'paper' | 'mock' | 'grand'

export interface QuizResultInput {
  chapterId: number | null
  mode: QuizMode
  score: number
  total: number
  perfect: boolean
  attempts: { q: string; correct: boolean; seconds?: number }[]
  seconds?: number
}

function weekStartStr(d = new Date()): string {
  const date = new Date(d)
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day)
  return dateStr(date)
}

export interface AppState {
  ready: boolean
  onboardingComplete: boolean
  name: string
  dailyGoal: number
  dailyMinutesGoal: number
  level: Level
  uiMode: ThemeMode
  totalXp: number
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
  progress: Record<number, ChapterProgressRow>
  badges: Record<string, boolean>
  bookmarks: number[]
  weeklyChallengeId: number
  weeklyProgress: number
  weeklyCompleted: number
  grandFinalDone: boolean
  // ---- V2 performance state (loaded once at init, kept in memory) ----
  qp: Record<string, QuestionPerfRow>
  srs: Record<string, FlashcardSrsRow>
  daily: DailyStatsRow | null
  milestones: Record<string, boolean>
  bests: Record<string, PersonalBestRow>
  levelUp: { name: string } | null
  badgeUnlock: { id: string; name: string } | null
  milestoneUnlock: { name: string } | null
  toast: string | null

  init: () => Promise<void>
  completeOnboarding: (name: string, dailyGoal: number, theme: ThemeMode, level: Level) => Promise<void>
  setLevel: (level: Level) => Promise<void>
  setTheme: (t: ThemeMode) => Promise<void>
  setDailyGoal: (g: number) => Promise<void>
  setDailyMinutesGoal: (m: number) => Promise<void>
  markVideoWatched: (chapterId: number) => Promise<void>
  markPdfRead: (chapterId: number, type: string) => Promise<void>
  completeQuiz: (chapterId: number, score: number, total: number, perfect: boolean, attempts: { q: string; correct: boolean }[]) => Promise<void>
  recordQuizSessionResult: (input: QuizResultInput) => Promise<void>
  isUnlocked: (chapterId: number) => boolean
  reviewFlashcard: (flashcardId: string, grade: SrsGrade) => Promise<void>
  recordRevision: (n?: number) => Promise<void>
  toggleBookmarkChapter: (chapterId: number) => Promise<void>
  checkDailyGoal: () => number
  completeGrandFinal: () => Promise<void>
  resetProgress: () => Promise<void>
  refreshProgress: () => Promise<void>
  bumpWeeklyProgress: (n: number) => Promise<void>
  showToast: (msg: string) => void
  clearToast: () => void
  dismissLevelUp: () => void
  dismissMilestone: () => void
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  onboardingComplete: false,
  name: 'Student',
  dailyGoal: 1,
  dailyMinutesGoal: 30,
  level: 'foundation',
  uiMode: DEFAULT_THEME,
  totalXp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null,
  progress: {},
  badges: {},
  bookmarks: [],
  weeklyChallengeId: 0,
  weeklyProgress: 0,
  weeklyCompleted: 0,
  grandFinalDone: false,
  qp: {},
  srs: {},
  daily: null,
  milestones: {},
  bests: {},
  levelUp: null,
  badgeUnlock: null,
  milestoneUnlock: null,
  toast: null,

  init: async () => {
    try {
      await initDatabase()
      const profile = await getProfile()
      const allProg = await getAllChapterProgress()
      const progress: Record<number, ChapterProgressRow> = {}
      allProg.forEach((p) => (progress[p.chapter_id] = p))
      const xp = await getTotalXp()
      const streak = await getStreak()
      const badgeRows = await getBadges()
      const badges: Record<string, boolean> = {}
      badgeRows.forEach((b) => (badges[b.badge_id] = !!b.unlocked))
      const bookmarks = await getBookmarks()

      // ---- V2: performance data ----
      const perfRows = await getAllQuestionPerf()
      const qp: Record<string, QuestionPerfRow> = {}
      perfRows.forEach((r) => (qp[r.question_id] = r))
      const srsRows = await getAllFlashcardSrs()
      const srs: Record<string, FlashcardSrsRow> = {}
      srsRows.forEach((r) => (srs[r.flashcard_id] = r))
      const daily = await getDailyStats(todayStr())
      const msRows = await getMilestones()
      const milestones: Record<string, boolean> = {}
      msRows.forEach((m) => (milestones[m.id] = true))
      const bestRows = await getAllPersonalBests()
      const bests: Record<string, PersonalBestRow> = {}
      bestRows.forEach((b) => (bests[b.key] = b))

      const ws = weekStartStr()
      let weekly = await getWeeklyChallenge()
      if (!weekly || weekly.week_start !== ws) {
        const challenge = getChallengeForWeek(weekNumber())
        weekly = { ...(weekly ?? { id: 0 }), challenge_id: challenge.id ?? weekNumber() % WEEKLY_CHALLENGES.length, week_start: ws, progress: 0, completed: 0 }
        await saveWeeklyChallenge(weekly)
      }

      set({
        ready: true,
        onboardingComplete: !!profile.onboarding_complete,
        name: profile.name,
        dailyGoal: profile.daily_goal,
        dailyMinutesGoal: profile.daily_minutes_goal,
        level: (profile.level as Level) || 'foundation',
        uiMode: normalizeTheme(profile.ui_mode),
        progress,
        totalXp: xp,
        currentStreak: streak.current_streak,
        longestStreak: streak.longest_streak,
        lastActiveDate: streak.last_active_date,
        badges,
        bookmarks,
        weeklyChallengeId: weekly.challenge_id,
        weeklyProgress: weekly.progress,
        weeklyCompleted: weekly.completed,
        qp, srs, daily, milestones, bests,
      })
      document.documentElement.setAttribute('data-theme', normalizeTheme(profile.ui_mode))
    } catch (error) {
      console.error('[Store] Init failed:', error)
      set({ ready: true })
    }
  },

  completeOnboarding: async (name, dailyGoal, theme, level) => {
    await saveProfile({ name, daily_goal: dailyGoal, ui_mode: theme, level, onboarding_complete: 1 })
    document.documentElement.setAttribute('data-theme', theme)
    requestAnimationFrame(() => set({ name, dailyGoal, uiMode: theme, level, onboardingComplete: true }))
  },

  setLevel: async (level) => {
    await saveProfile({ level })
    set({ level })
  },

  setTheme: async (t) => {
    await saveProfile({ ui_mode: t })
    document.documentElement.setAttribute('data-theme', t)
    setStatusBarColor(t)
    requestAnimationFrame(() => set({ uiMode: t }))
  },

  setDailyGoal: async (g) => {
    await saveProfile({ daily_goal: g })
    set({ dailyGoal: g })
  },

  setDailyMinutesGoal: async (m) => {
    await saveProfile({ daily_minutes_goal: m })
    set({ dailyMinutesGoal: m })
  },

  isUnlocked: (chapterId) => {
    return chapterById(chapterId) !== undefined
  },

  markVideoWatched: async (chapterId) => {
    try {
      const cur = await getChapterProgress(chapterId)
      if (cur.video_watched) return
      const row: ChapterProgressRow = { ...cur, chapter_id: chapterId, video_watched: 1 }
      await saveChapterProgress(row)
      set({ progress: { ...get().progress, [chapterId]: row } })
      await addXp(10, 'video', chapterId)
      await afterXp(get, set, { chapterId, reason: 'video' })
      get().showToast('+10 XP · Video watched')
      await maybeCompleteChapter(get, set, chapterId)
    } catch (error) {
      console.error('[Store] Failed to mark video watched:', error, { chapterId })
      get().showToast('❌ Failed to save progress. Try again.')
    }
  },

  markPdfRead: async (chapterId, type) => {
    try {
      const cur = await getChapterProgress(chapterId)
      let read: string[] = []
      try { read = JSON.parse(cur.pdfs_read || '[]') } catch { read = [] }
      if (read.includes(type)) return
      read.push(type)
      const row: ChapterProgressRow = { ...cur, chapter_id: chapterId, pdfs_read: JSON.stringify(read) }
      await saveChapterProgress(row)
      set({ progress: { ...get().progress, [chapterId]: row } })
      await addXp(5, 'pdf_' + type, chapterId)
      await afterXp(get, set, { chapterId, reason: 'pdf' })
      get().showToast('+5 XP · PDF read')
    } catch (error) {
      console.error('[Store] Failed to mark PDF read:', error, { chapterId, type })
    }
  },

  completeQuiz: async (chapterId, score, total, perfect, attempts) => {
    await get().recordQuizSessionResult({ chapterId, mode: 'chapter', score, total, perfect, attempts })
  },

  // -------------------------------------------------------------------------
  // V2: the single pipeline every quiz/test/mock result flows through.
  // Records per-question rolls, a session row, daily stats, XP rewards,
  // milestones, personal bests and goal completions.
  // -------------------------------------------------------------------------
  recordQuizSessionResult: async ({ chapterId, mode, score, total, perfect, attempts, seconds }) => {
    try {
      const correctCount = attempts.filter((a) => a.correct).length
      const today = todayStr()
      const revisionMode = mode === 'weak' || mode === 'mistakes' || mode === 'revision'
      const qidToChapter = new Map<string, number>()
      allQuestions.forEach((q) => qidToChapter.set(q.id, q.chapterId))

      // ---- 1. Per-question rollups + audit + daily stats ----
      const qp = { ...get().qp }
      const daily = { ...(get().daily ?? emptyDaily(today)) }
      for (const a of attempts) {
        const qc = qidToChapter.get(a.q) ?? chapterId ?? 0
        const prev = qp[a.q]
        const correct = a.correct
        const next: QuestionPerfRow = {
          question_id: a.q,
          chapter_id: qc,
          correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
          wrong: (prev?.wrong ?? 0) + (correct ? 0 : 1),
          streak: correct ? (prev?.streak ?? 0) + 1 : 0,
          last_seen: new Date().toISOString(),
          last_result: correct ? 1 : 0,
        }
        qp[a.q] = next
        await recordQuizAttempt(qc, a.q, correct)
        await saveQuestionPerf(next)
        daily.questions += 1
        if (correct) daily.correct += 1
        // ~45s per question; 2 questions ≈ 1 minute.
        daily.minutes += 0.75
      }

      // ---- 2. Session + daily counters by mode ----
      const isTest = mode === 'chapter_test' || mode === 'mock' || mode === 'paper' || mode === 'grand'
      daily.quizzes += isTest ? 0 : 1
      daily.tests += isTest ? 1 : 0
      if (revisionMode) daily.revisions += 1
      daily.questions = Math.round(daily.questions)
      daily.minutes = Math.round(daily.minutes)
      await saveDailyStats(daily)
      // Critical: write the new question rolls back to the store, or every
      // mastery/difficulty/weak computation keeps reading stale pre-session
      // data until a reload.
      set({ daily, qp })
      await recordQuizSession({ mode, chapter_id: chapterId, score, total, seconds: seconds ?? 0 })
      await bumpCumulative(get, set, isTest ? 'cum_tests' : 'cum_quizzes', 1)
      if (revisionMode) await bumpCumulative(get, set, 'cum_revisions', 1)

      // ---- 3. XP: correct answers (+revision bonus), pass bonuses ----
      let xpGained = 0
      const xpReasons: string[] = []
      const perCorrect = revisionMode ? XP.weakCorrect : XP.correctAnswer
      if (correctCount > 0) {
        xpGained += correctCount * perCorrect
        await addXp(correctCount * perCorrect, revisionMode ? 'quiz_weak' : 'quiz_correct', chapterId)
      }

      // Chapter progress + first-pass XP (kept from V1).
      const passMark = passMarkFor(total || 0)
      const passed = score >= passMark && total > 0
      if (mode === 'chapter' || mode === 'chapter_test') {
        const cur = await getChapterProgress(chapterId ?? 0)
        const firstPass = passed && !cur.quiz_passed
        const row: ChapterProgressRow = {
          ...cur,
          chapter_id: chapterId ?? cur.chapter_id,
          quiz_completed: 1,
          quiz_score: Math.max(cur.quiz_score || 0, score),
          quiz_passed: passed ? 1 : cur.quiz_passed,
          completed: passed ? 1 : cur.completed,
          completed_at: passed && !cur.completed_at ? new Date().toISOString() : cur.completed_at,
        }
        await saveChapterProgress(row)
        set({ progress: { ...get().progress, [row.chapter_id]: row } })

        if (mode === 'chapter' && firstPass) {
          xpGained += XP.quizPass
          await addXp(XP.quizPass, 'quiz', chapterId)
          if (perfect) {
            xpGained += XP.perfectBonus
            await addXp(XP.perfectBonus, 'perfect_quiz', chapterId)
          }
          xpReasons.push('Quiz passed')
        }
        if (mode === 'chapter_test' && passed) {
          xpGained += XP.chapterTestPass
          await addXp(XP.chapterTestPass, 'chapter_test', chapterId)
          xpReasons.push('Chapter test passed')
        }
        if (perfect) await tryBadge(get, set, 'perfect')
        await maybeCompleteChapter(get, set, chapterId ?? 0)
      }

      // Phase 4: every completed mock earns a completion bonus (on top of the
      // per-correct-answer XP above). Full exams are the big milestones here.
      if (mode === 'mock') {
        xpGained += XP.mockComplete
        await addXp(XP.mockComplete, 'mock_complete', null)
        xpReasons.push('Mock completed')
      }

      // ---- 4. Personal bests ----
      if (total > 0) {
        const pct = Math.round((score / total) * 100)
        await savePersonalBest('quiz_best_pct', pct)
      }
      await savePersonalBest('fc_best_day', daily.flashcards)

      // ---- 5. Milestones + daily goal + weekly goal ----
      const newlyUnlocked = await unlockMilestones(get, set)
      if (newlyUnlocked.length) xpGained += newlyUnlocked.length * XP.milestone
      await checkDailyGoalReward(get, set, daily)
      await checkWeeklyGoalReward(get, set)

      // ---- 6. Streak/level-up/badges + toast ----
      await afterXp(get, set, { chapterId, reason: mode })
      const msgParts = []
      if (xpGained > 0) msgParts.push(`+${xpGained} XP`)
      if (correctCount > 0) msgParts.push(`${correctCount}/${total || attempts.length} correct`)
      if (xpReasons.length) msgParts.push(xpReasons.join(' · '))
      get().showToast(msgParts.join(' · ') || (passed ? 'Quiz passed!' : `Scored ${score}/${total || 0} · need ${passMark} to pass`))
    } catch (error) {
      console.error('[Store] Quiz result failed:', error, { chapterId, mode, score })
      get().showToast('❌ Failed to save quiz result')
    }
  },

  reviewFlashcard: async (flashcardId, grade) => {
    try {
      const today = todayStr()
      const prev = get().srs[flashcardId] ?? null
      const next = srsReview(prev, grade, today)
      next.flashcard_id = flashcardId
      const srs = { ...get().srs, [flashcardId]: next }
      set({ srs })
      await saveFlashcardSrs(next)

      // Legacy flashcard_progress (older screens read it) — keep in sync.
      const curFp = await getFlashcardProgress(flashcardId)
      await saveFlashcardProgress({
        flashcard_id: flashcardId,
        difficulty: next.ease,
        next_review: next.due,
        review_count: (curFp?.review_count ?? 0) + 1,
      })

      // Daily stats + XP by grade.
      const daily = { ...(get().daily ?? emptyDaily(today)) }
      daily.flashcards += 1
      daily.minutes += 0.5
      daily.minutes = Math.round(daily.minutes)
      await saveDailyStats(daily)
      set({ daily })

      const gradeXp = grade === 0 ? 0 : grade === 1 ? XP.flashcardHard : grade === 2 ? XP.flashcardGood : XP.flashcardEasy
      if (gradeXp > 0) await addXp(gradeXp, 'flashcard', null)
      await afterXp(get, set, { chapterId: null, reason: 'flashcard' })
      await get().bumpWeeklyProgress(1)
      await unlockMilestones(get, set)
      await checkDailyGoalReward(get, set, daily)
    } catch (error) {
      console.error('[Store] Failed to review flashcard:', error, { flashcardId })
    }
  },

  recordRevision: async (n = 1) => {
    try {
      const today = todayStr()
      const daily = { ...(get().daily ?? emptyDaily(today)) }
      daily.revisions += n
      daily.minutes += 3
      daily.minutes = Math.round(daily.minutes)
      await saveDailyStats(daily)
      set({ daily })
      await unlockMilestones(get, set)
      await checkDailyGoalReward(get, set, daily)
    } catch (error) {
      console.error('[Store] Record revision failed:', error)
    }
  },

  toggleBookmarkChapter: async (chapterId) => {
    try {
      await toggleBookmark(chapterId)
      const bms = await getBookmarks()
      set({ bookmarks: bms })
    } catch (error) {
      console.error('[Store] Failed to toggle bookmark:', error, { chapterId })
    }
  },

  checkDailyGoal: () => {
    const today = todayStr()
    return Object.values(get().progress).filter((p) => p.completed_at && p.completed_at.slice(0, 10) === today).length
  },

  completeGrandFinal: async () => {
    if (get().grandFinalDone || (await hasClaimedGrandFinal())) {
      set({ grandFinalDone: true })
      get().showToast('Grand Final already cleared — +200 XP was already earned')
      return
    }
    try {
      await addXp(200, 'grand_final', null)
      await touchStreak(get, set)
      const allDone = chaptersForLevel(get().level).every((c) => get().progress[c.id]?.completed)
      set({ grandFinalDone: true })
      await afterXp(get, set, { chapterId: null, reason: 'grand_final' })
      get().showToast('Grand Final cleared! +200 XP')
      if (allDone) await tryBadge(get, set, 'cfo')
    } catch (error) {
      console.error('[Store] Grand Final failed:', error)
    }
  },

  resetProgress: async () => {
    try {
      const profile = await getProfile()
      await saveProfile({ ...profile, pdfs_generated: 0 })
      for (const c of curriculum) {
        await saveChapterProgress({
          chapter_id: c.id, video_watched: 0, pdfs_read: '[]', quiz_completed: 0,
          quiz_score: 0, quiz_passed: 0, completed: 0, completed_at: null,
        })
      }
      await saveStreak({ id: 1, current_streak: 0, longest_streak: 0, last_active_date: null })
      await resetAllData()
      await clearMockResults()
      await clearRevisionFlags()
      saveActiveMock(null)
      set({
        progress: {}, totalXp: 0, currentStreak: 0, longestStreak: 0, lastActiveDate: null,
        badges: {}, bookmarks: [], grandFinalDone: false, weeklyProgress: 0, weeklyCompleted: 0,
        qp: {}, srs: {}, daily: null, milestones: {}, bests: {},
      })
      get().showToast('Progress reset')
    } catch (error) {
      console.error('[Store] Reset failed:', error)
      get().showToast('❌ Failed to reset progress')
    }
  },

  refreshProgress: async () => {
    try {
      const all = await getAllChapterProgress()
      const prog: Record<number, ChapterProgressRow> = {}
      all.forEach((p) => (prog[p.chapter_id] = p))
      const xp = await getTotalXp()
      set({ progress: prog, totalXp: xp })
    } catch (error) {
      console.error('[Store] Refresh progress failed:', error)
    }
  },

  bumpWeeklyProgress: async (n) => {
    try {
      const ws = weekStartStr()
      let weekly = await getWeeklyChallenge()
      if (!weekly || weekly.week_start !== ws) {
        const challenge = getChallengeForWeek(weekNumber())
        weekly = { ...(weekly ?? { id: 0 }), challenge_id: challenge.id ?? 0, week_start: ws, progress: 0, completed: 0 }
      }
      const target = getChallengeForWeek(weekly.challenge_id).target
      const wasCompleted = weekly.completed === 1
      const progress = Math.min(target, weekly.progress + n)
      const completed = wasCompleted || progress >= target ? 1 : 0
      weekly = { ...weekly, progress, completed }
      await saveWeeklyChallenge(weekly)
      set({ weeklyChallengeId: weekly.challenge_id, weeklyProgress: progress, weeklyCompleted: completed })
      const key = 'weekly_goal_' + ws
      if (!wasCompleted && completed && !get().bests[key]) {
        await addXp(XP.weeklyGoal, 'weekly_goal', null)
        await savePersonalBest(key, 1)
        set({ bests: { ...get().bests, [key]: { key, value: 1, achieved_at: new Date().toISOString() } } })
        await afterXp(get, set, { chapterId: null, reason: 'weekly_goal' })
        get().showToast(`🎉 Weekly goal done! +${XP.weeklyGoal} XP`)
      }
    } catch (error) {
      console.error('[Store] Weekly progress update failed:', error)
    }
  },

  showToast: (msg) => {
    set({ toast: msg })
    setTimeout(() => {
      if (get().toast === msg) set({ toast: null })
    }, 2800)
  },
  clearToast: () => set({ toast: null }),
  dismissLevelUp: () => set({ levelUp: null }),
  dismissMilestone: () => set({ milestoneUnlock: null }),
}))

// ---- helpers ----

function emptyDaily(day: string): DailyStatsRow {
  return { day, questions: 0, correct: 0, flashcards: 0, minutes: 0, quizzes: 0, tests: 0, revisions: 0 }
}

/** Unlock any milestones the current aggregate stats now satisfy. Returns newly unlocked ids. */
async function unlockMilestones(get: () => AppState, set: (p: Partial<AppState>) => void): Promise<string[]> {
  try {
    let questionsAnswered = 0
    let correct = 0
    let flashcardsReviewed = 0
    Object.values(get().qp).forEach((p) => { questionsAnswered += p.correct + p.wrong; correct += p.correct })
    Object.values(get().srs).forEach((s) => { flashcardsReviewed += s.reviews })
    const quizzesDone = get().bests['cum_quizzes']?.value ?? 0
    const testsDone = get().bests['cum_tests']?.value ?? 0
    const revisionsDone = get().bests['cum_revisions']?.value ?? 0
    const accuracy = questionsAnswered > 0 ? correct / questionsAnswered : null
    const already = new Set(Object.keys(get().milestones))
    const newly = checkMilestones(
      { questionsAnswered, flashcardsReviewed, quizzesDone, testsDone, revisionsDone, accuracy, daysStudied: get().currentStreak },
      already,
    )
    for (const id of newly) {
      await unlockMilestone(id)
      await addXp(XP.milestone, 'milestone', null)
      const def = MILESTONE_DEFS.find((m) => m.id === id)
      set({ milestones: { ...get().milestones, [id]: true }, milestoneUnlock: def ? { name: def.name } : null })
      if (def) {
        setTimeout(() => {
          if (get().milestoneUnlock?.name === def.name) set({ milestoneUnlock: null })
        }, 3200)
      }
    }
    return newly
  } catch (error) {
    console.error('[Store] Milestone check failed:', error)
    return []
  }
}

/** Daily target (chapters done + minutes studied) reached → +XP, once per day. */
async function checkDailyGoalReward(get: () => AppState, set: (p: Partial<AppState>) => void, daily: DailyStatsRow): Promise<void> {
  try {
    const today = todayStr()
    const key = 'daily_goal_' + today
    if (get().bests[key]) return
    const chaptersDoneToday = Object.values(get().progress).filter((p) => p.completed_at && p.completed_at.slice(0, 10) === today).length
    if (chaptersDoneToday >= get().dailyGoal && daily.minutes >= get().dailyMinutesGoal) {
      await addXp(XP.dailyGoal, 'daily_goal', null)
      await savePersonalBest(key, 1)
      const bests = { ...get().bests, [key]: { key, value: 1, achieved_at: new Date().toISOString() } }
      set({ bests })
      await afterXp(get, set, { chapterId: null, reason: 'daily_goal' })
      get().showToast(`🎯 Daily goal complete! +${XP.dailyGoal} XP`)
    }
  } catch (error) {
    console.error('[Store] Daily goal check failed:', error)
  }
}

/** Weekly challenge completion → +XP, once per week. */
async function checkWeeklyGoalReward(get: () => AppState, set: (p: Partial<AppState>) => void): Promise<void> {
  try {
    const ws = weekStartStr()
    const key = 'weekly_goal_' + ws
    if (get().bests[key]) return
    const weekly = await getWeeklyChallenge()
    if (!weekly || weekly.completed) {
      if (weekly?.completed && !get().bests[key]) {
        await addXp(XP.weeklyGoal, 'weekly_goal', null)
        await savePersonalBest(key, 1)
        set({ bests: { ...get().bests, [key]: { key, value: 1, achieved_at: new Date().toISOString() } } })
        await afterXp(get, set, { chapterId: null, reason: 'weekly_goal' })
        get().showToast(`🎉 Weekly goal done! +${XP.weeklyGoal} XP`)
      }
    }
  } catch (error) {
    console.error('[Store] Weekly goal check failed:', error)
  }
}

const MILESTONE_DEFS = [
  { id: 'm_q_50', name: 'Question Starter' }, { id: 'm_q_250', name: 'Question Machine' },
  { id: 'm_q_1000', name: 'Question Champion' }, { id: 'm_fc_50', name: 'Flashcard Novice' },
  { id: 'm_fc_250', name: 'Flashcard Master' }, { id: 'm_qz_5', name: 'Quiz Taker' },
  { id: 'm_qz_25', name: 'Quiz Crusher' }, { id: 'm_tst_5', name: 'Test Pilot' },
  { id: 'm_rev_25', name: 'Revisionist' }, { id: 'm_acc_80', name: 'Sharpshooter' },
  { id: 'm_days_7', name: 'Week Warrior' },
]

async function touchStreak(get: () => AppState, set: (p: Partial<AppState>) => void) {
  const row = await getStreak()
  const today = todayStr()
  const last = row.last_active_date
  let cs = row.current_streak
  let ls = row.longest_streak
  if (last === today) {
    // already active today
  } else if (last) {
    const lastDate = new Date(last + 'T00:00:00')
    const now = new Date(today + 'T00:00:00')
    const diff = Math.round((now.getTime() - lastDate.getTime()) / 86400000)
    cs = diff === 1 ? cs + 1 : 1
  } else {
    cs = 1
  }
  if (cs > ls) ls = cs
  const updated: StreakRow = { id: 1, current_streak: cs, longest_streak: ls, last_active_date: today }
  await saveStreak(updated)
  set({ currentStreak: cs, longestStreak: ls, lastActiveDate: today })
  if (cs >= 7) await tryBadge(get, set, 'on_fire')
  void today
}

async function afterXp(
  get: () => AppState,
  set: (p: Partial<AppState>) => void,
  ctx: { chapterId: number | null; reason: string }
) {
  const before = get().totalXp
  const total = await getTotalXp()
  set({ totalXp: total })
  await touchStreak(get, set)

  const prevLevel = levelForXp(before)
  const newLevel = levelForXp(total)
  if (newLevel.index > prevLevel.index) {
    set({ levelUp: { name: newLevel.name } })
  }

  if (new Date().getHours() >= 22) await tryBadge(get, set, 'night_owl')

  const today = todayStr()
  const completedToday = Object.values(get().progress).filter((p) => p.completed_at && p.completed_at.slice(0, 10) === today).length
  if (completedToday >= 3) await tryBadge(get, set, 'speed_run')

  void ctx
}

async function tryBadge(get: () => AppState, set: (p: Partial<AppState>) => void, id: string) {
  if (get().badges[id]) return
  await unlockBadge(id)
  const def = BADGES.find((b) => b.id === id)
  set({ badges: { ...get().badges, [id]: true }, badgeUnlock: def ? { id, name: def.name } : null })
  if (def) {
    setTimeout(() => {
      if (get().badgeUnlock?.id === id) set({ badgeUnlock: null })
    }, 3200)
  }
}

async function maybeCompleteChapter(get: () => AppState, set: (p: Partial<AppState>) => void, chapterId: number) {
  const p = get().progress[chapterId]
  if (!p) return
  if (p.video_watched && p.quiz_passed) {
    const level = get().level
    const levelChapters = chaptersForLevel(level).sort((a, b) => a.id - b.id)
    if (levelChapters.length && levelChapters[0].id === chapterId) await tryBadge(get, set, 'first_step')
    for (const paper of papersForLevel(level)) {
      const paperChapters = chaptersForPaper(paper.id)
      if (!paperChapters.length) continue
      const done = paperChapters.every((c) => get().progress[c.id]?.completed)
      if (done) await tryBadge(get, set, `paper_${paper.id}`)
    }
    const levelDone = levelChapters.every((c) => get().progress[c.id]?.completed)
    if (levelDone) await tryBadge(get, set, level)
  }
}

export function useDailyPlan(): DailyPlan {
  const level = useStore((s) => s.level)
  const progress = useStore((s) => s.progress)
  const qp = useStore((s) => s.qp)
  const srs = useStore((s) => s.srs)
  const daily = useStore((s) => s.daily)
  const dailyGoal = useStore((s) => s.dailyGoal)
  const dailyMinutesGoal = useStore((s) => s.dailyMinutesGoal)
  const weeklyProgress = useStore((s) => s.weeklyProgress)
  const weeklyCompleted = useStore((s) => s.weeklyCompleted)
  const currentStreak = useStore((s) => s.currentStreak)
  const weekly = getChallengeForWeek(weekNumber())
  return computeDailyPlan(
    level,
    curriculum,
    progress,
    new Map(Object.entries(qp)),
    new Map(Object.entries(srs)),
    allFlashcards,
    daily,
    0,
    { daily_goal: dailyGoal, daily_minutes_goal: dailyMinutesGoal },
    { progress: weeklyProgress, target: weekly.target, name: weekly.name, completed: weeklyCompleted },
    currentStreak,
    todayStr(),
  )
}

export function useMasterySummary(): MasterySummary {
  const level = useStore((s) => s.level)
  const progress = useStore((s) => s.progress)
  const qp = useStore((s) => s.qp)
  const srs = useStore((s) => s.srs)
  return computeMasterySummary(
    level,
    chaptersForLevel(level),
    progress,
    new Map(Object.entries(qp)),
    new Map(Object.entries(srs)),
    allFlashcards,
    todayStr(),
  )
}

// Increment a cumulative counter used by milestone checks (keeps the store
// state in sync so milestone detection sees the update immediately).
async function bumpCumulative(get: () => AppState, set: (p: Partial<AppState>) => void, key: 'cum_quizzes' | 'cum_tests' | 'cum_revisions', n = 1): Promise<void> {
  const cur = get().bests[key]?.value ?? 0
  const row = await savePersonalBest(key, cur + n)
  const bests = { ...get().bests, [key]: row }
  set({ bests })
}
