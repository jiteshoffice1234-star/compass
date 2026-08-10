import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Brain, RotateCcw, CreditCard, Layers, AlertTriangle, Calendar, RefreshCw, Settings2, Play, Check, SkipForward, ArrowRight } from 'lucide-react'
import { useStore, usePlannerData } from '../store'
import { papersForLevel, chaptersForLevel, LEVEL_LABELS, Level } from '../data/curriculum'
import { Card, Tappable, Button } from '../components/ui'
import { BottomSheet } from '../components/BottomSheet'
import { PlannerTask } from '../lib/plannerStore'
import { color, border, font } from '../theme'

const TYPE_ICON: Record<PlannerTask['type'], { icon: any; tint: string; iconColor: string }> = {
  learn: { icon: BookOpen, tint: color.primaryTint, iconColor: color.primary },
  practice: { icon: Brain, tint: color.secondaryTint, iconColor: color.secondary },
  revision: { icon: RotateCcw, tint: color.warningTint, iconColor: color.warning },
  flashcards: { icon: CreditCard, tint: color.successTint, iconColor: color.success },
  mock: { icon: Layers, tint: color.primaryTint, iconColor: color.primary },
  mistakes: { icon: AlertTriangle, tint: color.dangerTint, iconColor: color.danger },
}

const TYPE_LABEL: Record<PlannerTask['type'], string> = {
  learn: 'Learn', practice: 'Practice', revision: 'Revision', flashcards: 'Flashcards', mock: 'Mock exam', mistakes: 'Review mistakes',
}

function fmtMins(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

export function Planner() {
  const nav = useNavigate()
  const storeLevel = useStore((s) => s.level)
  const savePlannerSettings = useStore((s) => s.savePlannerSettings)
  const replan = useStore((s) => s.replan)
  const startPlannerTask = useStore((s) => s.startPlannerTask)
  const skipPlannerTask = useStore((s) => s.skipPlannerTask)
  const { settings, todayTasks, weekPlan, infos, counts, overview, weekActuals } = usePlannerData()

  const [setupOpen, setSetupOpen] = useState(false)
  const [fLevel, setFLevel] = useState<Level>(settings.set ? (settings.level as Level) : storeLevel)
  const [fPapers, setFPapers] = useState<number[] | null>(settings.paperIds)
  const [fExam, setFExam] = useState(settings.examDate ?? '')
  const [fDays, setFDays] = useState(settings.daysPerWeek)
  const [fMinutes, setFMinutes] = useState(settings.minutesPerDay)
  const [fSession, setFSession] = useState(settings.sessionLength)

  const papers = useMemo(() => papersForLevel(fLevel).filter((p) => chaptersForLevel(fLevel).some((c) => c.paperId === p.id)), [fLevel])

  const openSetup = () => {
    setFLevel(settings.set ? (settings.level as Level) : storeLevel)
    setFPapers(settings.paperIds)
    setFExam(settings.examDate ?? '')
    setFDays(settings.daysPerWeek)
    setFMinutes(settings.minutesPerDay)
    setFSession(settings.sessionLength)
    setSetupOpen(true)
  }

  const saveSetup = async () => {
    await savePlannerSettings({
      level: fLevel, paperIds: fPapers, examDate: fExam || null,
      daysPerWeek: fDays, minutesPerDay: fMinutes, sessionLength: fSession, set: true,
    })
    setSetupOpen(false)
  }

  const runTask = (t: PlannerTask) => {
    startPlannerTask(t.id)
    if (t.type === 'learn' || t.type === 'practice') { if (t.chapterId) nav(`/chapter/${t.chapterId}`) }
    else if (t.type === 'revision') nav('/revision')
    else if (t.type === 'flashcards') nav('/practice?deck=due')
    else if (t.type === 'mistakes') nav('/practice?mode=weak')
    else if (t.type === 'mock') nav('/practice')
  }

  const nextTask = todayTasks.find((t) => t.status === 'planned' || t.status === 'inprogress')

  // Per-paper progress from real mastery data.
  const paperProgress = useMemo(() => {
    const map = new Map<number, { done: number; total: number; masterySum: number; masteryN: number }>()
    for (const i of infos) {
      const g = map.get(i.paperId) ?? { done: 0, total: 0, masterySum: 0, masteryN: 0 }
      g.total += 1
      if (i.completed) g.done += 1
      if (i.overall !== null) { g.masterySum += i.overall; g.masteryN += 1 }
      map.set(i.paperId, g)
    }
    return [...map.entries()].map(([paperId, g]) => ({
      paperId,
      paper: papersForLevel(settings.level as Level).find((p) => p.id === paperId),
      done: g.done, total: g.total,
      mastery: g.masteryN > 0 ? g.masterySum / g.masteryN : null,
    }))
  }, [infos, settings.level])

  const countdown = overview.daysUntil === null
    ? 'No exam date set'
    : overview.daysUntil <= 0
      ? 'Exam date passed'
      : `Exam in ${overview.daysUntil} day${overview.daysUntil > 1 ? 's' : ''}`

  const plannedH = Math.round((weekActuals.plannedMinutes / 60) * 10) / 10
  const completedH = Math.round((weekActuals.completedMinutes / 60) * 10) / 10

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: color.surface }}>
      <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 27 }}>Planner</div>
          <div style={{ color: color.muted, fontSize: 13, fontWeight: 600 }}>What to study, when — driven by your data</div>
        </div>
        {settings.set && (
          <Tappable onClick={() => nav('/')} style={{ background: color.card, border: border.thin, borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 800, color: color.muted }}>
            Home
          </Tappable>
        )}
      </div>

      <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }} className="safe-bottom">
        {/* ===== Setup CTA ===== */}
        {!settings.set && (
          <Card style={{ padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: color.primaryTint, border: border.thick }}>
            <div style={{ width: 64, height: 64, borderRadius: 14, background: color.primary, color: '#fff', border: border.thin, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={30} />
            </div>
            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 4 }}>Plan your CMA prep</div>
            <div style={{ color: color.text, fontSize: 13.5, fontWeight: 600, opacity: 0.8, lineHeight: 1.5, maxWidth: 280 }}>
              Set your exam date and daily study time — Compass will build a daily plan from your syllabus, mastery, revision needs and mock results.
            </div>
            <Button variant="primary" onClick={openSetup} style={{ marginTop: 8, width: '100%' }}>
              <Settings2 size={18} /> Set up my plan
            </Button>
          </Card>
        )}

        {settings.set && (
          <>
            {/* ===== Countdown + phase ===== */}
            <Card style={{ padding: 16, background: color.card, border: border.thin, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: overview.daysUntil !== null && overview.daysUntil <= 14 ? color.warningTint : color.primaryTint, color: overview.daysUntil !== null && overview.daysUntil <= 14 ? color.warning : color.primary, border: border.thin, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Calendar size={24} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 17 }}>{countdown}</div>
                <div style={{ color: color.muted, fontSize: 12, fontWeight: 600 }}>{overview.phaseLabel} · {settings.minutesPerDay} min/day · {settings.daysPerWeek} days/week</div>
              </div>
              <Tappable onClick={openSetup} style={{ background: color.card, border: border.thin, borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800 }}>
                <Settings2 size={14} /> Edit
              </Tappable>
            </Card>

            {/* ===== Today's Plan ===== */}
            <Card style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>📅 Today — {fmtMins(todayTasks.reduce((s, t) => s + t.minutes, 0))}</div>
                <span style={{ fontSize: 12, fontWeight: 800, color: color.muted }}>{overview.unfinishedCount} chapters left</span>
              </div>

              {todayTasks.length === 0 ? (
                <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, padding: '8px 0 4px' }}>
                  Nothing scheduled — {counts.unfinishedCount > 0 ? 'press REPLAN to regenerate from your latest data.' : 'you have finished the selected syllabus. 🎉'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {todayTasks.map((t) => {
                    const cfg = TYPE_ICON[t.type]
                    const Icon = cfg.icon
                    const done = t.status === 'done'
                    const skipped = t.status === 'skipped'
                    const inProgress = t.status === 'inprogress'
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: color.card, border: border.thin, borderRadius: 10, padding: '10px 12px', opacity: done || skipped ? 0.6 : 1 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: cfg.tint, color: cfg.iconColor, border: border.thin, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {done ? <Check size={17} /> : <Icon size={17} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.detail}</div>
                          <div style={{ color: color.muted, fontSize: 11, fontWeight: 700 }}>
                            {TYPE_LABEL[t.type]} · {t.minutes} min{inProgress ? ' · in progress' : done ? ` · done (${t.actualMinutes}m)` : skipped ? ' · skipped' : ''}
                          </div>
                        </div>
                        {!done && !skipped && (
                          <Tappable onClick={() => runTask(t)} style={{ background: cfg.iconColor, color: '#fff', border: border.thin, borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <Play size={12} /> START
                          </Tappable>
                        )}
                        {!done && !skipped && (
                          <Tappable onClick={() => skipPlannerTask(t.id)} aria-label="Skip task" style={{ color: color.muted, padding: 6, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                            <SkipForward size={14} />
                          </Tappable>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {nextTask && (
                <Button variant="primary" onClick={() => runTask(nextTask)} style={{ width: '100%', marginTop: 12 }}>
                  <Play size={18} /> Start next task — {TYPE_LABEL[nextTask.type]}
                </Button>
              )}
            </Card>

            {/* ===== This week ===== */}
            <Card style={{ padding: 16 }}>
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>This week</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                <span>Planned: <span className="mono" style={{ fontFamily: font.mono }}>{plannedH}h</span></span>
                <span>Completed: <span className="mono" style={{ fontFamily: font.mono }}>{completedH}h</span></span>
              </div>
              <div style={{ height: 10, background: color.surface, border: border.thin, borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${Math.round(weekActuals.percent * 100)}%`, height: '100%', background: color.success, transition: 'width 0.3s' }} />
              </div>
              <div style={{ color: color.muted, fontSize: 11, fontWeight: 600, marginTop: 6 }}>
                {weekActuals.percent >= 1 ? 'Week complete! 🎉' : `${Math.round(weekActuals.percent * 100)}% of this week's plan done so far`}
              </div>

              {paperProgress.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
                  {paperProgress.map((p) => (
                    <div key={p.paperId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="mono" style={{ width: 46, fontSize: 11, fontWeight: 800, color: color.muted }}>{p.paper?.code ?? p.paperId}</span>
                      <div style={{ flex: 1, height: 9, background: color.surface, border: border.thin, borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(((p.mastery ?? 0)) * 100)}%`, height: '100%', background: color.secondary, transition: 'width 0.3s' }} />
                      </div>
                      <span className="mono" style={{ width: 78, textAlign: 'right', fontSize: 11, fontWeight: 700, color: color.muted, fontFamily: font.mono }}>
                        {p.done}/{p.total} · {p.mastery !== null ? Math.round(p.mastery * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ===== Upcoming ===== */}
            <Card style={{ padding: 16 }}>
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Upcoming</div>
              {weekPlan.days.slice(1, 4).map((d) => {
                const dLabel = new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
                const mins = d.tasks.reduce((s, t) => s + t.minutes, 0)
                return (
                  <div key={d.date} style={{ padding: '8px 0', borderBottom: d.date !== weekPlan.days.slice(1, 4)[weekPlan.days.slice(1, 4).length - 1]?.date ? border.thin : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, color: color.muted }}>
                      <span>{dLabel}</span>
                      <span className="mono" style={{ fontFamily: font.mono }}>{mins > 0 ? `${fmtMins(mins)}` : 'Rest day'}</span>
                    </div>
                    {d.tasks.length > 0 && (
                      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {d.tasks.map((t) => (
                          <div key={t.id} style={{ fontSize: 12.5, fontWeight: 600, color: color.text }}>
                            <span style={{ color: TYPE_ICON[t.type].iconColor, fontWeight: 800 }}>{TYPE_LABEL[t.type]}:</span> {t.detail} · {t.minutes}m
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </Card>

            {/* ===== Warnings ===== */}
            {overview.warnings.length > 0 && (
              <Card style={{ padding: 14, background: color.warningTint, border: border.thick }}>
                {overview.warnings.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, fontWeight: 700, color: color.text, lineHeight: 1.4, marginBottom: i < overview.warnings.length - 1 ? 8 : 0 }}>
                    <AlertTriangle size={16} color={color.warning} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{w}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* ===== Replan ===== */}
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="primary" onClick={() => { replan(); }} style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 8 }}>
                <RefreshCw size={16} /> Replan
              </Button>
              <Tappable onClick={() => nav('/revision')} style={{ background: color.card, border: border.thin, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13 }}>
                Revision hub <ArrowRight size={14} />
              </Tappable>
            </div>
          </>
        )}
      </div>

      {/* ===== Setup sheet ===== */}
      <BottomSheet open={setupOpen} onClose={() => setSetupOpen(false)} title="Plan setup">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 4px 16px' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Level</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(Object.keys(LEVEL_LABELS) as Level[]).map((lv) => (
                <Tappable key={lv} onClick={() => { setFLevel(lv); setFPapers(null) }} style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: fLevel === lv ? color.primary : color.card, color: fLevel === lv ? color.primaryInk : color.text, border: fLevel === lv ? border.thick : border.thin, borderRadius: 8, fontWeight: 800, fontSize: 12.5 }}>
                  {LEVEL_LABELS[lv]}
                </Tappable>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Papers to prepare</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Tappable onClick={() => setFPapers(null)} style={{ padding: '8px 14px', background: fPapers === null ? color.secondary : color.card, color: fPapers === null ? '#fff' : color.text, border: border.thin, borderRadius: 8, fontWeight: 800, fontSize: 13 }}>
                All papers
              </Tappable>
              {papers.map((p) => (
                <Tappable key={p.id} onClick={() => setFPapers((cur) => (cur === null ? [p.id] : cur.includes(p.id) ? (cur.length === 1 ? null : cur.filter((x) => x !== p.id)) : [...cur, p.id]))}
                  style={{ padding: '8px 14px', background: fPapers?.includes(p.id) ? color.secondary : color.card, color: fPapers?.includes(p.id) ? '#fff' : color.text, border: border.thin, borderRadius: 8, fontWeight: 800, fontSize: 13 }}>
                  {p.code}
                </Tappable>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Exam date</div>
            <input type="date" value={fExam} onChange={(e) => setFExam(e.target.value)}
              style={{ width: '100%', background: color.card, border: border.thin, borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, color: color.text }} />
          </div>

          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Study days per week</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[3, 4, 5, 6, 7].map((d) => (
                <Tappable key={d} onClick={() => setFDays(d)} style={{ flex: 1, textAlign: 'center', padding: '9px 0', background: fDays === d ? color.primary : color.card, color: fDays === d ? color.primaryInk : color.text, border: fDays === d ? border.thick : border.thin, borderRadius: 8, fontWeight: 800, fontSize: 13 }}>{d}</Tappable>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Study time per day</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[30, 60, 90, 120, 180].map((m) => (
                <Tappable key={m} onClick={() => setFMinutes(m)} style={{ flex: 1, textAlign: 'center', padding: '9px 0', background: fMinutes === m ? color.primary : color.card, color: fMinutes === m ? color.primaryInk : color.text, border: fMinutes === m ? border.thick : border.thin, borderRadius: 8, fontWeight: 800, fontSize: 13 }}>{m}m</Tappable>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Preferred session length</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[20, 40, 60].map((m) => (
                <Tappable key={m} onClick={() => setFSession(m)} style={{ flex: 1, textAlign: 'center', padding: '9px 0', background: fSession === m ? color.primary : color.card, color: fSession === m ? color.primaryInk : color.text, border: fSession === m ? border.thick : border.thin, borderRadius: 8, fontWeight: 800, fontSize: 13 }}>{m} min</Tappable>
              ))}
            </div>
          </div>

          <Button variant="primary" onClick={saveSetup} style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <Check size={18} /> Save & build my plan
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
