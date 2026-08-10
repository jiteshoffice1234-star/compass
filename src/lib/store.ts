import { Capacitor } from '@capacitor/core'
import {
  getDb,
  ChapterProgressRow,
  XpTransaction,
  BadgeRow,
  FlashcardProgressRow,
  FlashcardSrsRow,
  QuestionPerfRow,
  QuizSessionRow,
  DailyStatsRow,
  PersonalBestRow,
  WeeklyChallengeRow,
  UserProfileRow,
  initDatabase,
} from './db'

export const isNative = Capacitor.isNativePlatform()

// ---------- Database error tracking ----------
export type DbErrorSeverity = 'WARNING' | 'ERROR' | 'CRITICAL'

export interface DatabaseError {
  operation: string
  severity: DbErrorSeverity
  message: string
  timestamp: string
  context?: Record<string, unknown>
}

const DB_ERROR_LOG_KEY = 'cma_db_errors'
const MAX_DB_ERRORS = 50

export function logDatabaseError(err: Omit<DatabaseError, 'timestamp'>): void {
  const entry: DatabaseError = { ...err, timestamp: new Date().toISOString() }
  console.error(`[DB] ${err.severity} in ${err.operation}:`, err.message, err.context ?? '')
  try {
    const log = JSON.parse(localStorage.getItem(DB_ERROR_LOG_KEY) || '[]') as DatabaseError[]
    log.push(entry)
    localStorage.setItem(DB_ERROR_LOG_KEY, JSON.stringify(log.slice(-MAX_DB_ERRORS)))
  } catch { /* storage full — silently drop */ }
}

export function getDbErrorLog(): DatabaseError[] {
  try {
    return JSON.parse(localStorage.getItem(DB_ERROR_LOG_KEY) || '[]') as DatabaseError[]
  } catch {
    return []
  }
}

export function clearDbErrorLog(): void {
  localStorage.removeItem(DB_ERROR_LOG_KEY)
}

// ---------- localStorage web fallback ----------
const LS_PREFIX = 'cma_'
function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value))
  } catch {
    /* noop */
  }
}

// ---------- User Profile ----------
const PROFILE_DEFAULTS: UserProfileRow = { id: 1, name: 'Student', daily_goal: 1, ui_mode: 'dark', onboarding_complete: 0, pdfs_generated: 0, level: 'foundation', daily_minutes_goal: 30 }

export async function getProfile(): Promise<UserProfileRow> {
  if (!isNative) {
    const p = lsGet<UserProfileRow>('profile', PROFILE_DEFAULTS)
    return { ...PROFILE_DEFAULTS, ...p }
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM user_profile WHERE id = 1')
    const row = { ...PROFILE_DEFAULTS, ...(r.values?.[0] ?? {}) } as UserProfileRow
    if (!row.level) row.level = 'foundation'
    return row
  } catch (error) {
    logDatabaseError({ operation: 'getProfile', severity: 'ERROR', message: String(error) })
    return { ...PROFILE_DEFAULTS }
  }
}

export async function saveProfile(p: Partial<UserProfileRow>): Promise<void> {
  if (!isNative) {
    const cur = await getProfile()
    lsSet('profile', { ...cur, ...p })
    return
  }
  try {
    const db = getDb()
    const cur = await getProfile()
    const m = { ...cur, ...p }
    await db.run(
      'UPDATE user_profile SET name = ?, daily_goal = ?, ui_mode = ?, onboarding_complete = ?, pdfs_generated = ?, level = ?, daily_minutes_goal = ? WHERE id = 1',
      [m.name ?? 'Student', m.daily_goal ?? 1, m.ui_mode ?? 'dark', m.onboarding_complete ?? 0, m.pdfs_generated ?? 0, m.level ?? 'foundation', m.daily_minutes_goal ?? 30],
    )
  } catch (error) {
    logDatabaseError({ operation: 'saveProfile', severity: 'ERROR', message: String(error), context: p as Record<string, unknown> })
  }
}

// ---------- Chapter Progress ----------
export async function getChapterProgress(id: number): Promise<ChapterProgressRow> {
  const def: ChapterProgressRow = { chapter_id: id, video_watched: 0, pdfs_read: '[]', quiz_completed: 0, quiz_score: 0, quiz_passed: 0, completed: 0, completed_at: null }
  if (!isNative) {
    const all = lsGet<Record<number, ChapterProgressRow>>('chapters', {})
    return all[id] ?? def
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM chapter_progress WHERE chapter_id = ?', [id])
    return r.values && r.values.length ? (r.values[0] as ChapterProgressRow) : def
  } catch (error) {
    logDatabaseError({ operation: 'getChapterProgress', severity: 'ERROR', message: String(error), context: { id } })
    return def
  }
}

export async function getAllChapterProgress(): Promise<ChapterProgressRow[]> {
  if (!isNative) {
    const all = lsGet<Record<number, ChapterProgressRow>>('chapters', {})
    return Object.values(all)
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM chapter_progress')
    return (r.values as ChapterProgressRow[]) ?? []
  } catch (error) {
    logDatabaseError({ operation: 'getAllChapterProgress', severity: 'ERROR', message: String(error) })
    return []
  }
}

export async function saveChapterProgress(p: ChapterProgressRow): Promise<void> {
  if (!isNative) {
    const all = lsGet<Record<number, ChapterProgressRow>>('chapters', {})
    all[p.chapter_id] = p
    lsSet('chapters', all)
    return
  }
  try {
    const db = getDb()
    await db.run(
      `INSERT INTO chapter_progress (chapter_id, video_watched, pdfs_read, quiz_completed, quiz_score, quiz_passed, completed, completed_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(chapter_id) DO UPDATE SET
         video_watched=excluded.video_watched, pdfs_read=excluded.pdfs_read, quiz_completed=excluded.quiz_completed,
         quiz_score=excluded.quiz_score, quiz_passed=excluded.quiz_passed, completed=excluded.completed, completed_at=excluded.completed_at`,
      [p.chapter_id, p.video_watched, p.pdfs_read, p.quiz_completed, p.quiz_score, p.quiz_passed, p.completed, p.completed_at],
    )
  } catch (error) {
    logDatabaseError({ operation: 'saveChapterProgress', severity: 'ERROR', message: String(error), context: { chapter_id: p.chapter_id } })
  }
}

// ---------- XP ----------
export async function addXp(amount: number, reason: string, chapterId: number | null): Promise<void> {
  if (!isNative) {
    const txns = lsGet<XpTransaction[]>('xp', [])
    txns.push({ id: txns.length + 1, amount, reason, chapter_id: chapterId, created_at: new Date().toISOString() })
    lsSet('xp', txns)
    return
  }
  try {
    const db = getDb()
    await db.run('INSERT INTO xp_transactions (amount, reason, chapter_id) VALUES (?,?,?)', [amount, reason, chapterId])
  } catch (error) {
    logDatabaseError({ operation: 'addXp', severity: 'WARNING', message: String(error), context: { amount, reason, chapterId } })
  }
}

export async function getTotalXp(): Promise<number> {
  if (!isNative) {
    const txns = lsGet<XpTransaction[]>('xp', [])
    return txns.reduce((s, t) => s + t.amount, 0)
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT COALESCE(SUM(amount),0) as total FROM xp_transactions')
    return (r.values?.[0]?.total as number) ?? 0
  } catch (error) {
    logDatabaseError({ operation: 'getTotalXp', severity: 'ERROR', message: String(error) })
    return 0
  }
}

// True when the Grand Final reward has already been claimed (persists across
// restarts — the guard must not rely on in-memory state or users could farm
// +200 XP by re-running the Grand Final after relaunching).
export async function hasClaimedGrandFinal(): Promise<boolean> {
  if (!isNative) {
    const txns = lsGet<XpTransaction[]>('xp', [])
    return txns.some((t) => t.reason === 'grand_final')
  }
  try {
    const db = getDb()
    const r = await db.query("SELECT 1 FROM xp_transactions WHERE reason = 'grand_final' LIMIT 1")
    return !!r.values && r.values.length > 0
  } catch (error) {
    logDatabaseError({ operation: 'hasClaimedGrandFinal', severity: 'WARNING', message: String(error) })
    return false
  }
}

export async function getXpTodayCount(): Promise<number> {
  if (!isNative) {
    const txns = lsGet<XpTransaction[]>('xp', [])
    const today = new Date().toDateString()
    return txns.filter((t) => new Date(t.created_at).toDateString() === today).length
  }
  try {
    const db = getDb()
    const r = await db.query("SELECT COUNT(*) as c FROM xp_transactions WHERE date(created_at) = date('now')")
    return (r.values?.[0]?.c as number) ?? 0
  } catch (error) {
    logDatabaseError({ operation: 'getXpTodayCount', severity: 'WARNING', message: String(error) })
    return 0
  }
}

// ---------- Badges ----------
export async function getBadges(): Promise<BadgeRow[]> {
  if (!isNative) return lsGet<BadgeRow[]>('badges', [])
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM badges')
    return (r.values as BadgeRow[]) ?? []
  } catch (error) {
    logDatabaseError({ operation: 'getBadges', severity: 'ERROR', message: String(error) })
    return []
  }
}

export async function unlockBadge(id: string): Promise<void> {
  if (!isNative) {
    const b = lsGet<BadgeRow[]>('badges', [])
    const idx = b.findIndex((x) => x.badge_id === id)
    const row: BadgeRow = { badge_id: id, unlocked: 1, unlocked_at: new Date().toISOString() }
    if (idx >= 0) b[idx] = row
    else b.push(row)
    lsSet('badges', b)
    return
  }
  try {
    const db = getDb()
    await db.run(
      `INSERT INTO badges (badge_id, unlocked, unlocked_at) VALUES (?,1,?)
       ON CONFLICT(badge_id) DO UPDATE SET unlocked=1, unlocked_at=excluded.unlocked_at`,
      [id, new Date().toISOString()],
    )
  } catch (error) {
    logDatabaseError({ operation: 'unlockBadge', severity: 'WARNING', message: String(error), context: { badgeId: id } })
  }
}

// ---------- Streaks ----------
export interface StreakRow { id: number; current_streak: number; longest_streak: number; last_active_date: string | null }
export async function getStreak(): Promise<StreakRow> {
  if (!isNative) return lsGet<StreakRow>('streak', { id: 1, current_streak: 0, longest_streak: 0, last_active_date: null })
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM streaks WHERE id = 1')
    return (r.values?.[0] ?? { id: 1, current_streak: 0, longest_streak: 0, last_active_date: null }) as StreakRow
  } catch (error) {
    logDatabaseError({ operation: 'getStreak', severity: 'ERROR', message: String(error) })
    return { id: 1, current_streak: 0, longest_streak: 0, last_active_date: null }
  }
}

export async function saveStreak(s: StreakRow): Promise<void> {
  if (!isNative) {
    lsSet('streak', s)
    return
  }
  try {
    const db = getDb()
    await db.run('UPDATE streaks SET current_streak=?, longest_streak=?, last_active_date=? WHERE id=1', [s.current_streak, s.longest_streak, s.last_active_date])
  } catch (error) {
    logDatabaseError({ operation: 'saveStreak', severity: 'WARNING', message: String(error) })
  }
}

export async function getStreakRawDate(): Promise<string | null> {
  const s = await getStreak()
  return s.last_active_date
}

// ---------- Quiz attempts ----------
export async function recordQuizAttempt(chapterId: number, questionId: string, wasCorrect: boolean): Promise<void> {
  if (!isNative) {
    const a = lsGet<any[]>('attempts', [])
    a.push({ chapter_id: chapterId, question_id: questionId, was_correct: wasCorrect ? 1 : 0, created_at: new Date().toISOString() })
    lsSet('attempts', a)
    return
  }
  try {
    const db = getDb()
    await db.run('INSERT INTO quiz_attempts (chapter_id, question_id, was_correct) VALUES (?,?,?)', [chapterId, questionId, wasCorrect ? 1 : 0])
  } catch (error) {
    logDatabaseError({ operation: 'recordQuizAttempt', severity: 'WARNING', message: String(error), context: { chapterId, questionId } })
  }
}

// ---------- Flashcards ----------
export async function getFlashcardProgress(id: string): Promise<FlashcardProgressRow | null> {
  if (!isNative) {
    const all = lsGet<Record<string, FlashcardProgressRow>>('fc', {})
    return all[id] ?? null
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM flashcard_progress WHERE flashcard_id = ?', [id])
    return r.values && r.values.length ? (r.values[0] as FlashcardProgressRow) : null
  } catch (error) {
    logDatabaseError({ operation: 'getFlashcardProgress', severity: 'WARNING', message: String(error), context: { flashcardId: id } })
    return null
  }
}

export async function getAllFlashcardProgress(): Promise<FlashcardProgressRow[]> {
  if (!isNative) {
    const all = lsGet<Record<string, FlashcardProgressRow>>('fc', {})
    return Object.values(all)
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM flashcard_progress')
    return (r.values as FlashcardProgressRow[]) ?? []
  } catch (error) {
    logDatabaseError({ operation: 'getAllFlashcardProgress', severity: 'WARNING', message: String(error) })
    return []
  }
}

export async function saveFlashcardProgress(p: FlashcardProgressRow): Promise<void> {
  if (!isNative) {
    const all = lsGet<Record<string, FlashcardProgressRow>>('fc', {})
    all[p.flashcard_id] = p
    lsSet('fc', all)
    return
  }
  try {
    const db = getDb()
    await db.run(
      `INSERT INTO flashcard_progress (flashcard_id, difficulty, next_review, review_count) VALUES (?,?,?,?)
       ON CONFLICT(flashcard_id) DO UPDATE SET difficulty=excluded.difficulty, next_review=excluded.next_review, review_count=excluded.review_count`,
      [p.flashcard_id, p.difficulty, p.next_review, p.review_count],
    )
  } catch (error) {
    logDatabaseError({ operation: 'saveFlashcardProgress', severity: 'WARNING', message: String(error), context: { flashcardId: p.flashcard_id } })
  }
}

// ---------- Bookmarks ----------
export async function getBookmarks(): Promise<number[]> {
  if (!isNative) return lsGet<number[]>('bookmarks', [])
  try {
    const db = getDb()
    const r = await db.query('SELECT chapter_id FROM bookmarks')
    return (r.values ?? []).map((x: any) => x.chapter_id as number)
  } catch (error) {
    logDatabaseError({ operation: 'getBookmarks', severity: 'WARNING', message: String(error) })
    return []
  }
}

export async function toggleBookmark(chapterId: number): Promise<boolean> {
  const bms = await getBookmarks()
  const exists = bms.includes(chapterId)
  if (!isNative) {
    if (exists) lsSet('bookmarks', bms.filter((x) => x !== chapterId))
    else lsSet('bookmarks', [...bms, chapterId])
    return !exists
  }
  try {
    const db = getDb()
    if (exists) await db.run('DELETE FROM bookmarks WHERE chapter_id = ?', [chapterId])
    else await db.run('INSERT INTO bookmarks (chapter_id) VALUES (?)', [chapterId])
  } catch (error) {
    logDatabaseError({ operation: 'toggleBookmark', severity: 'WARNING', message: String(error), context: { chapterId } })
  }
  return !exists
}

// ---------- Weekly challenge ----------
export async function getWeeklyChallenge(): Promise<WeeklyChallengeRow | null> {
  if (!isNative) return lsGet<WeeklyChallengeRow | null>('weekly', null)
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM weekly_challenge ORDER BY id DESC LIMIT 1')
    return r.values && r.values.length ? (r.values[0] as WeeklyChallengeRow) : null
  } catch (error) {
    logDatabaseError({ operation: 'getWeeklyChallenge', severity: 'WARNING', message: String(error) })
    return null
  }
}

export async function saveWeeklyChallenge(w: WeeklyChallengeRow): Promise<void> {
  if (!isNative) {
    lsSet('weekly', w)
    return
  }
  try {
    const db = getDb()
    if (w.id) {
      await db.run('UPDATE weekly_challenge SET challenge_id=?, week_start=?, progress=?, completed=? WHERE id=?', [w.challenge_id, w.week_start, w.progress, w.completed, w.id])
    } else {
      await db.run('INSERT INTO weekly_challenge (challenge_id, week_start, progress, completed) VALUES (?,?,?,?)', [w.challenge_id, w.week_start, w.progress, w.completed])
    }
  } catch (error) {
    logDatabaseError({ operation: 'saveWeeklyChallenge', severity: 'WARNING', message: String(error) })
  }
}

// ---------- V2: question performance rollup ----------
export async function getAllQuestionPerf(): Promise<QuestionPerfRow[]> {
  if (!isNative) {
    const all = lsGet<Record<string, QuestionPerfRow>>('qp', {})
    return Object.values(all)
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM question_performance')
    return (r.values as QuestionPerfRow[]) ?? []
  } catch (error) {
    logDatabaseError({ operation: 'getAllQuestionPerf', severity: 'WARNING', message: String(error) })
    return []
  }
}

export async function saveQuestionPerf(p: QuestionPerfRow): Promise<void> {
  if (!isNative) {
    const all = lsGet<Record<string, QuestionPerfRow>>('qp', {})
    all[p.question_id] = p
    lsSet('qp', all)
    return
  }
  try {
    const db = getDb()
    await db.run(
      `INSERT INTO question_performance (question_id, chapter_id, correct, wrong, streak, last_seen, last_result)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(question_id) DO UPDATE SET
         chapter_id=excluded.chapter_id, correct=excluded.correct, wrong=excluded.wrong,
         streak=excluded.streak, last_seen=excluded.last_seen, last_result=excluded.last_result`,
      [p.question_id, p.chapter_id, p.correct, p.wrong, p.streak, p.last_seen, p.last_result],
    )
  } catch (error) {
    logDatabaseError({ operation: 'saveQuestionPerf', severity: 'WARNING', message: String(error), context: { questionId: p.question_id } })
  }
}

// ---------- V2: flashcard spaced-repetition scheduling ----------
export async function getAllFlashcardSrs(): Promise<FlashcardSrsRow[]> {
  if (!isNative) {
    const all = lsGet<Record<string, FlashcardSrsRow>>('srs', {})
    return Object.values(all)
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM flashcard_srs')
    return (r.values as FlashcardSrsRow[]) ?? []
  } catch (error) {
    logDatabaseError({ operation: 'getAllFlashcardSrs', severity: 'WARNING', message: String(error) })
    return []
  }
}

export async function saveFlashcardSrs(p: FlashcardSrsRow): Promise<void> {
  if (!isNative) {
    const all = lsGet<Record<string, FlashcardSrsRow>>('srs', {})
    all[p.flashcard_id] = p
    lsSet('srs', all)
    return
  }
  try {
    const db = getDb()
    await db.run(
      `INSERT INTO flashcard_srs (flashcard_id, ease, interval, due, lapses, streak, last_reviewed, reviews)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(flashcard_id) DO UPDATE SET
         ease=excluded.ease, interval=excluded.interval, due=excluded.due,
         lapses=excluded.lapses, streak=excluded.streak, last_reviewed=excluded.last_reviewed, reviews=excluded.reviews`,
      [p.flashcard_id, p.ease, p.interval, p.due, p.lapses, p.streak, p.last_reviewed, p.reviews],
    )
  } catch (error) {
    logDatabaseError({ operation: 'saveFlashcardSrs', severity: 'WARNING', message: String(error), context: { flashcardId: p.flashcard_id } })
  }
}

// ---------- V2: quiz session history ----------
export async function recordQuizSession(s: Omit<QuizSessionRow, 'completed_at'>, completedAt = new Date().toISOString()): Promise<void> {
  if (!isNative) {
    const list = lsGet<QuizSessionRow[]>('qsh', [])
    list.push({ ...s, completed_at: completedAt })
    lsSet('qsh', list.slice(-200))
    return
  }
  try {
    const db = getDb()
    await db.run('INSERT INTO quiz_sessions (mode, chapter_id, score, total, seconds) VALUES (?,?,?,?,?)', [s.mode, s.chapter_id, s.score, s.total, s.seconds])
  } catch (error) {
    logDatabaseError({ operation: 'recordQuizSession', severity: 'WARNING', message: String(error), context: { mode: s.mode } })
  }
}

export async function getRecentQuizSessions(limit = 30): Promise<QuizSessionRow[]> {
  if (!isNative) {
    const list = lsGet<QuizSessionRow[]>('qsh', [])
    return list.slice(-limit).reverse()
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM quiz_sessions ORDER BY id DESC LIMIT ?', [limit])
    return (r.values as QuizSessionRow[]) ?? []
  } catch (error) {
    logDatabaseError({ operation: 'getRecentQuizSessions', severity: 'WARNING', message: String(error) })
    return []
  }
}

// ---------- V2: daily stats ----------
export async function getDailyStats(day: string): Promise<DailyStatsRow> {
  const def: DailyStatsRow = { day, questions: 0, correct: 0, flashcards: 0, minutes: 0, quizzes: 0, tests: 0, revisions: 0 }
  if (!isNative) {
    const all = lsGet<Record<string, DailyStatsRow>>('ds', {})
    return all[day] ?? def
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM daily_stats WHERE day = ?', [day])
    return r.values && r.values.length ? (r.values[0] as DailyStatsRow) : def
  } catch (error) {
    logDatabaseError({ operation: 'getDailyStats', severity: 'WARNING', message: String(error) })
    return def
  }
}

export async function saveDailyStats(p: DailyStatsRow): Promise<void> {
  if (!isNative) {
    const all = lsGet<Record<string, DailyStatsRow>>('ds', {})
    all[p.day] = p
    lsSet('ds', all)
    return
  }
  try {
    const db = getDb()
    await db.run(
      `INSERT INTO daily_stats (day, questions, correct, flashcards, minutes, quizzes, tests, revisions)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(day) DO UPDATE SET
         questions=excluded.questions, correct=excluded.correct, flashcards=excluded.flashcards,
         minutes=excluded.minutes, quizzes=excluded.quizzes, tests=excluded.tests, revisions=excluded.revisions`,
      [p.day, p.questions, p.correct, p.flashcards, p.minutes, p.quizzes, p.tests, p.revisions],
    )
  } catch (error) {
    logDatabaseError({ operation: 'saveDailyStats', severity: 'WARNING', message: String(error), context: { day: p.day } })
  }
}

// ---------- V2: milestones ----------
export async function getMilestones(): Promise<{ id: string; unlocked_at: string }[]> {
  if (!isNative) return lsGet<{ id: string; unlocked_at: string }[]>('ms', [])
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM milestones')
    return (r.values as { id: string; unlocked_at: string }[]) ?? []
  } catch (error) {
    logDatabaseError({ operation: 'getMilestones', severity: 'WARNING', message: String(error) })
    return []
  }
}

export async function unlockMilestone(id: string): Promise<void> {
  const at = new Date().toISOString()
  if (!isNative) {
    const list = lsGet<{ id: string; unlocked_at: string }[]>('ms', [])
    if (list.some((m) => m.id === id)) return
    list.push({ id, unlocked_at: at })
    lsSet('ms', list)
    return
  }
  try {
    const db = getDb()
    await db.run('INSERT OR IGNORE INTO milestones (id, unlocked_at) VALUES (?,?)', [id, at])
  } catch (error) {
    logDatabaseError({ operation: 'unlockMilestone', severity: 'WARNING', message: String(error), context: { id } })
  }
}

// ---------- V2: personal bests ----------
export async function getAllPersonalBests(): Promise<PersonalBestRow[]> {
  if (!isNative) {
    const all = lsGet<Record<string, PersonalBestRow>>('pb', {})
    return Object.values(all)
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM personal_bests')
    return (r.values as PersonalBestRow[]) ?? []
  } catch (error) {
    logDatabaseError({ operation: 'getAllPersonalBests', severity: 'WARNING', message: String(error) })
    return []
  }
}

export async function savePersonalBest(key: string, value: number): Promise<PersonalBestRow> {
  const at = new Date().toISOString()
  const row: PersonalBestRow = { key, value, achieved_at: at }
  if (!isNative) {
    const all = lsGet<Record<string, PersonalBestRow>>('pb', {})
    const cur = all[key]
    if (cur && cur.value >= value) return cur
    all[key] = row
    lsSet('pb', all)
    return row
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM personal_bests WHERE key = ?', [key])
    const cur = r.values?.[0] as PersonalBestRow | undefined
    if (cur && (cur.value as number) >= value) return cur
    await db.run(
      `INSERT INTO personal_bests (key, value, achieved_at) VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, achieved_at=excluded.achieved_at`,
      [key, value, at],
    )
    return row
  } catch (error) {
    logDatabaseError({ operation: 'savePersonalBest', severity: 'WARNING', message: String(error), context: { key, value } })
    return row
  }
}

// ---------- Full reset (used by Profile → Reset progress) ----------
// Wipes every activity table so XP/badges/attempts do not resurrect after a
// reset. Chapter progress rows themselves are re-created (zeroed) by the store.
export async function resetAllData(): Promise<void> {
  if (!isNative) {
    localStorage.removeItem(LS_PREFIX + 'xp')
    localStorage.removeItem(LS_PREFIX + 'badges')
    localStorage.removeItem(LS_PREFIX + 'bookmarks')
    localStorage.removeItem(LS_PREFIX + 'attempts')
    localStorage.removeItem(LS_PREFIX + 'fc')
    localStorage.removeItem(LS_PREFIX + 'weekly')
    localStorage.removeItem(LS_PREFIX + 'streak')
    localStorage.removeItem(LS_PREFIX + 'qp')
    localStorage.removeItem(LS_PREFIX + 'srs')
    localStorage.removeItem(LS_PREFIX + 'qsh')
    localStorage.removeItem(LS_PREFIX + 'ds')
    localStorage.removeItem(LS_PREFIX + 'ms')
    localStorage.removeItem(LS_PREFIX + 'pb')
    return
  }
  try {
    const db = getDb()
    await db.run('DELETE FROM xp_transactions')
    await db.run('DELETE FROM quiz_attempts')
    await db.run('DELETE FROM flashcard_progress')
    await db.run('DELETE FROM bookmarks')
    await db.run('DELETE FROM weekly_challenge')
    await db.run('DELETE FROM badges')
    await db.run('DELETE FROM question_performance')
    await db.run('DELETE FROM flashcard_srs')
    await db.run('DELETE FROM quiz_sessions')
    await db.run('DELETE FROM daily_stats')
    await db.run('DELETE FROM milestones')
    await db.run('DELETE FROM personal_bests')
  } catch (error) {
    logDatabaseError({ operation: 'resetAllData', severity: 'ERROR', message: String(error) })
  }
}

export { initDatabase }
