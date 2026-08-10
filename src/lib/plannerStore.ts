import { getDb, PlannerSettingsRow, PlannerTaskRow } from './db'
import { isNative, logDatabaseError } from './store'

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

export interface PlannerSettings {
  level: string
  paperIds: number[] | null // null = all papers in the level
  examDate: string | null   // YYYY-MM-DD
  daysPerWeek: number       // 1..7
  minutesPerDay: number
  sessionLength: number     // preferred minutes per study session
  set: boolean              // student completed setup
}

export const PLANNER_SETTINGS_DEFAULTS: PlannerSettings = {
  level: 'foundation',
  paperIds: null,
  examDate: null,
  daysPerWeek: 5,
  minutesPerDay: 60,
  sessionLength: 40,
  set: false,
}

export interface PlannerTask {
  id: string
  date: string          // YYYY-MM-DD
  type: 'learn' | 'practice' | 'revision' | 'flashcards' | 'mock' | 'mistakes'
  chapterId: number | null
  paperId: number | null
  minutes: number
  detail: string
  status: 'planned' | 'inprogress' | 'done' | 'skipped'
  completedAt: string | null
  actualMinutes: number
}

export function toSettingsRow(s: PlannerSettings): PlannerSettingsRow {
  return {
    id: 1,
    level: s.level,
    paper_ids: s.paperIds ? JSON.stringify(s.paperIds) : null,
    exam_date: s.examDate,
    days_per_week: s.daysPerWeek,
    minutes_per_day: s.minutesPerDay,
    session_length: s.sessionLength,
    set_flag: s.set ? 1 : 0,
  }
}

export function fromSettingsRow(r: PlannerSettingsRow): PlannerSettings {
  let paperIds: number[] | null = null
  if (r.paper_ids) {
    try { paperIds = JSON.parse(r.paper_ids) as number[] } catch { paperIds = null }
  }
  return {
    level: r.level || 'foundation',
    paperIds,
    examDate: r.exam_date,
    daysPerWeek: r.days_per_week || 5,
    minutesPerDay: r.minutes_per_day || 60,
    sessionLength: r.session_length || 40,
    set: !!r.set_flag,
  }
}

export function toTaskRow(t: PlannerTask): PlannerTaskRow {
  return {
    id: t.id, date: t.date, type: t.type, chapter_id: t.chapterId, paper_id: t.paperId,
    minutes: t.minutes, detail: t.detail, status: t.status, completed_at: t.completedAt, actual_minutes: t.actualMinutes,
  }
}

export function fromTaskRow(r: PlannerTaskRow): PlannerTask {
  return {
    id: r.id, date: r.date, type: r.type as PlannerTask['type'], chapterId: r.chapter_id ?? null,
    paperId: r.paper_id ?? null, minutes: r.minutes || 0, detail: r.detail || '', status: r.status as PlannerTask['status'],
    completedAt: r.completed_at, actualMinutes: r.actual_minutes || 0,
  }
}

// ---------- Settings ----------
export async function getPlannerSettings(): Promise<PlannerSettings> {
  if (!isNative) {
    return { ...PLANNER_SETTINGS_DEFAULTS, ...lsGet<Partial<PlannerSettings>>('planner_settings', {}) }
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM planner_settings WHERE id = 1')
    if (r.values && r.values.length) return fromSettingsRow(r.values[0] as PlannerSettingsRow)
    return { ...PLANNER_SETTINGS_DEFAULTS }
  } catch (error) {
    logDatabaseError({ operation: 'getPlannerSettings', severity: 'WARNING', message: String(error) })
    return { ...PLANNER_SETTINGS_DEFAULTS }
  }
}

export async function savePlannerSettings(s: PlannerSettings): Promise<void> {
  const row = toSettingsRow(s)
  if (!isNative) {
    lsSet('planner_settings', {
      level: row.level, paperIds: s.paperIds, examDate: s.examDate, daysPerWeek: row.days_per_week,
      minutesPerDay: row.minutes_per_day, sessionLength: row.session_length, set: s.set,
    })
    return
  }
  try {
    const db = getDb()
    await db.run(
      `INSERT INTO planner_settings (id, level, paper_ids, exam_date, days_per_week, minutes_per_day, session_length, set_flag)
       VALUES (1,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         level=excluded.level, paper_ids=excluded.paper_ids, exam_date=excluded.exam_date,
         days_per_week=excluded.days_per_week, minutes_per_day=excluded.minutes_per_day,
         session_length=excluded.session_length, set_flag=excluded.set_flag`,
      [row.level, row.paper_ids, row.exam_date, row.days_per_week, row.minutes_per_day, row.session_length, row.set_flag],
    )
  } catch (error) {
    logDatabaseError({ operation: 'savePlannerSettings', severity: 'WARNING', message: String(error), context: s as unknown as Record<string, unknown> })
  }
}

// ---------- Tasks ----------
export async function getPlannerTasks(): Promise<PlannerTask[]> {
  if (!isNative) {
    return lsGet<PlannerTask[]>('planner_tasks', [])
  }
  try {
    const db = getDb()
    const r = await db.query('SELECT * FROM planner_tasks ORDER BY date, id')
    return ((r.values as PlannerTaskRow[]) ?? []).map(fromTaskRow)
  } catch (error) {
    logDatabaseError({ operation: 'getPlannerTasks', severity: 'WARNING', message: String(error) })
    return []
  }
}

export async function savePlannerTasks(tasks: PlannerTask[]): Promise<void> {
  if (tasks.length === 0) return
  if (!isNative) {
    const existing = lsGet<PlannerTask[]>('planner_tasks', [])
    const byId = new Map(existing.map((t) => [t.id, t]))
    for (const t of tasks) byId.set(t.id, t)
    lsSet('planner_tasks', [...byId.values()].slice(-400))
    return
  }
  try {
    const db = getDb()
    for (const t of tasks) {
      const row = toTaskRow(t)
      await db.run(
        `INSERT INTO planner_tasks (id, date, type, chapter_id, paper_id, minutes, detail, status, completed_at, actual_minutes)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           date=excluded.date, type=excluded.type, chapter_id=excluded.chapter_id, paper_id=excluded.paper_id,
           minutes=excluded.minutes, detail=excluded.detail, status=excluded.status,
           completed_at=excluded.completed_at, actual_minutes=excluded.actual_minutes`,
        [row.id, row.date, row.type, row.chapter_id, row.paper_id, row.minutes, row.detail, row.status, row.completed_at, row.actual_minutes],
      )
    }
  } catch (error) {
    logDatabaseError({ operation: 'savePlannerTasks', severity: 'WARNING', message: String(error), context: { count: tasks.length } })
  }
}

/** Delete all planned (non-done/skipped) tasks on or after `fromDate` — used by REPLAN. */
export async function clearFuturePlannerTasks(fromDate: string): Promise<void> {
  if (!isNative) {
    const list = lsGet<PlannerTask[]>('planner_tasks', [])
    lsSet('planner_tasks', list.filter((t) => t.status === 'done' || t.status === 'skipped' || t.date < fromDate))
    return
  }
  try {
    const db = getDb()
    await db.run("DELETE FROM planner_tasks WHERE date >= ? AND status NOT IN ('done','skipped')", [fromDate])
  } catch (error) {
    logDatabaseError({ operation: 'clearFuturePlannerTasks', severity: 'WARNING', message: String(error) })
  }
}

/** Prune old tasks (keep ~60 days of history). */
export async function prunePlannerTasks(): Promise<void> {
  if (!isNative) return
  try {
    await getDb().run("DELETE FROM planner_tasks WHERE date < date('now', '-60 days')")
  } catch (error) {
    logDatabaseError({ operation: 'prunePlannerTasks', severity: 'WARNING', message: String(error) })
  }
}
