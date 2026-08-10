import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'

export interface ChapterProgressRow {
  chapter_id: number
  video_watched: number
  pdfs_read: string
  quiz_completed: number
  quiz_score: number
  quiz_passed: number
  completed: number
  completed_at: string | null
}

export interface XpTransaction {
  id: number
  amount: number
  reason: string
  chapter_id: number | null
  created_at: string
}

export interface BadgeRow {
  badge_id: string
  unlocked: number
  unlocked_at: string | null
}

export interface FlashcardProgressRow {
  flashcard_id: string
  difficulty: number
  next_review: string
  review_count: number
}

export interface FlashcardSrsRow {
  flashcard_id: string
  ease: number
  interval: number
  due: string
  lapses: number
  streak: number
  last_reviewed: string
  reviews: number
}

export interface QuestionPerfRow {
  question_id: string
  chapter_id: number
  correct: number
  wrong: number
  streak: number
  last_seen: string
  last_result: number // 1 = correct last time, 0 = wrong last time
}

export interface QuizSessionRow {
  id?: number
  mode: string
  chapter_id: number | null
  score: number
  total: number
  seconds: number
  completed_at: string
}

export interface DailyStatsRow {
  day: string
  questions: number
  correct: number
  flashcards: number
  minutes: number
  quizzes: number
  tests: number
  revisions: number
}

export interface PersonalBestRow {
  key: string
  value: number
  achieved_at: string
}

export interface WeeklyChallengeRow {
  id: number
  challenge_id: number
  week_start: string
  progress: number
  completed: number
}

export interface UserProfileRow {
  id: number
  name: string
  daily_goal: number
  ui_mode: string
  onboarding_complete: number
  pdfs_generated: number
  level: string
  daily_minutes_goal: number
}

// Phase 4: mock exam attempt + result payloads
// One MockAttempt per question in the mock: chosen option, correctness, time
// spent and whether it was marked for review. Stored once per completed mock
// so history can replay the full analysis without re-recording anything.
export interface MockAttempt {
  q: string          // question id
  chosen: number | null // selected option index, null = unanswered
  correct: boolean
  seconds: number | null // time spent on this question (null = untracked)
  chapterId: number
  marked: boolean
}

export interface MockResultRow {
  id: number
  mode: string          // 'full' | 'practice' | 'weak'
  paperId: number | null
  level: string
  count: number
  score: number
  total: number
  seconds: number       // total duration used
  unanswered: number
  marked: number
  autoSubmit: number    // 1 = submitted when time expired
  completedAt: string
  data: string          // JSON: { poolIds, answers, marked[], perQSeconds, autoSubmit, startedAt, deadline }
}

// Phase 5: study planner
export interface PlannerSettingsRow {
  id: number
  level: string
  paper_ids: string | null  // JSON array of paper ids, null = all papers in level
  exam_date: string | null  // YYYY-MM-DD
  days_per_week: number
  minutes_per_day: number
  session_length: number
  set_flag: number
}

export interface PlannerTaskRow {
  id: string
  date: string
  type: string
  chapter_id: number | null
  paper_id: number | null
  minutes: number
  detail: string
  status: string
  completed_at: string | null
  actual_minutes: number
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT NOT NULL DEFAULT 'Student',
  daily_goal INTEGER DEFAULT 1,
  ui_mode TEXT DEFAULT 'dark',
  onboarding_complete INTEGER DEFAULT 0,
  pdfs_generated INTEGER DEFAULT 0,
  level TEXT DEFAULT 'foundation',
  daily_minutes_goal INTEGER DEFAULT 30
);
CREATE TABLE IF NOT EXISTS chapter_progress (
  chapter_id INTEGER PRIMARY KEY,
  video_watched INTEGER DEFAULT 0,
  pdfs_read TEXT DEFAULT '[]',
  quiz_completed INTEGER DEFAULT 0,
  quiz_score INTEGER DEFAULT 0,
  quiz_passed INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS xp_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  chapter_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS streaks (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_active_date TEXT
);
CREATE TABLE IF NOT EXISTS badges (
  badge_id TEXT PRIMARY KEY,
  unlocked INTEGER DEFAULT 0,
  unlocked_at TEXT
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  was_correct INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS flashcard_progress (
  flashcard_id TEXT PRIMARY KEY,
  difficulty REAL DEFAULT 3,
  next_review TEXT DEFAULT (date('now')),
  review_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bookmarks (
  chapter_id INTEGER PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS weekly_challenge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  week_start TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0
);
-- V2: performance / mastery engine tables
CREATE TABLE IF NOT EXISTS question_performance (
  question_id TEXT PRIMARY KEY,
  chapter_id INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  wrong INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  last_seen TEXT,
  last_result INTEGER
);
CREATE TABLE IF NOT EXISTS flashcard_srs (
  flashcard_id TEXT PRIMARY KEY,
  ease REAL DEFAULT 2.5,
  interval INTEGER DEFAULT 0,
  due TEXT,
  lapses INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  last_reviewed TEXT,
  reviews INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT,
  chapter_id INTEGER,
  score INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  seconds INTEGER DEFAULT 0,
  completed_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS daily_stats (
  day TEXT PRIMARY KEY,
  questions INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  flashcards INTEGER DEFAULT 0,
  minutes INTEGER DEFAULT 0,
  quizzes INTEGER DEFAULT 0,
  tests INTEGER DEFAULT 0,
  revisions INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  unlocked_at TEXT
);
CREATE TABLE IF NOT EXISTS personal_bests (
  key TEXT PRIMARY KEY,
  value REAL DEFAULT 0,
  achieved_at TEXT
);
-- Phase 4: mock exam results (history + replay payloads)
CREATE TABLE IF NOT EXISTS mock_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT,
  paper_id INTEGER,
  level TEXT,
  count INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  seconds INTEGER DEFAULT 0,
  unanswered INTEGER DEFAULT 0,
  marked INTEGER DEFAULT 0,
  auto_submit INTEGER DEFAULT 0,
  completed_at TEXT DEFAULT (datetime('now')),
  data TEXT
);
-- Phase 4: manually flagged "add to revision" questions
CREATE TABLE IF NOT EXISTS revision_flags (
  question_id TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now'))
);
-- Phase 5: smart study planner
CREATE TABLE IF NOT EXISTS planner_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  level TEXT DEFAULT 'foundation',
  paper_ids TEXT,
  exam_date TEXT,
  days_per_week INTEGER DEFAULT 5,
  minutes_per_day INTEGER DEFAULT 60,
  session_length INTEGER DEFAULT 40,
  set_flag INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS planner_tasks (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  chapter_id INTEGER,
  paper_id INTEGER,
  minutes INTEGER DEFAULT 0,
  detail TEXT DEFAULT '',
  status TEXT DEFAULT 'planned',
  completed_at TEXT,
  actual_minutes REAL DEFAULT 0
);
`

let db: SQLiteDBConnection | null = null
let sqlite: SQLiteConnection | null = null

export async function initDatabase(): Promise<void> {
  // Web uses the localStorage fallback in lib/store.ts; no SQLite connection needed.
  if (!Capacitor.isNativePlatform()) return

  sqlite = new SQLiteConnection(CapacitorSQLite)
  const conn = await sqlite.createConnection('compass', false, 'secret', 1, false)
  db = conn
  await db.open()
  await db.execute(SCHEMA)

  // ---- V2 migrations (idempotent) ----
  // user_profile.daily_minutes_goal — added in V2. Older installs (whose table
  // was created before the column existed) get it via ALTER TABLE.
  try {
    const cols = await db.query('PRAGMA table_info(user_profile)')
    const hasMinutes = (cols.values ?? []).some((c: any) => c.name === 'daily_minutes_goal')
    if (!hasMinutes) {
      await db.run('ALTER TABLE user_profile ADD COLUMN daily_minutes_goal INTEGER DEFAULT 30')
    }
  } catch (error) {
    console.warn('[DB] daily_minutes_goal migration failed (non-critical):', error)
  }

  // ensure user_profile row exists
  const res = await db.query('SELECT id FROM user_profile WHERE id = 1')
  if (!res.values || res.values.length === 0) {
    await db.run('INSERT INTO user_profile (id, name, daily_goal, ui_mode, onboarding_complete, pdfs_generated, level) VALUES (1, ?, 1, ?, 0, 0, ?)', ['Student', 'dark', 'foundation'])
  }
  // prune old XP transactions
  try { await pruneOldTransactions() } catch { /* non-critical */ }

  // ensure streaks row exists
  const sres = await db.query('SELECT id FROM streaks WHERE id = 1')
  if (!sres.values || sres.values.length === 0) {
    await db.run('INSERT INTO streaks (id, current_streak, longest_streak, last_active_date) VALUES (1, 0, 0, NULL)')
  }
}

export function getDb(): SQLiteDBConnection {
  if (!db) throw new Error('Database not initialised')
  return db
}

export const PRUNE_AFTER_DAYS = 90

export async function pruneOldTransactions(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const conn = getDb()
    const oldTotal = await conn.query(
      "SELECT COALESCE(SUM(amount),0) as total FROM xp_transactions WHERE created_at < datetime('now', '-90 days')"
    )
    const sum = (oldTotal.values?.[0]?.total as number) ?? 0
    if (sum === 0) return
    await conn.run("DELETE FROM xp_transactions WHERE created_at < datetime('now', '-90 days')")
    await conn.run("INSERT INTO xp_transactions (amount, reason, chapter_id, created_at) VALUES (?, 'pruned', NULL, datetime('now'))", [sum])
  } catch (error) {
    console.warn('[DB] Prune failed (non-critical):', error)
  }
}

export const sqliteAvailable = Capacitor.isNativePlatform()
