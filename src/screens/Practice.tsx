import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CreditCard, Layers, Calculator, BookA, ArrowRight, Play, Settings2, Brain, Target, AlertTriangle, RefreshCw, Check } from 'lucide-react'
import { useStore } from '../store'
import { chaptersForLevel, papersForLevel, chapterById } from '../data/curriculum'
import { questions } from '../data/questions'
import { flashcards } from '../data/flashcards'
import { Card, Tappable, Button } from '../components/ui'
import { BottomSheet } from '../components/BottomSheet'
import { FlashcardsDue } from './FlashcardsDue'
import { FormulaSheet } from './FormulaSheet'
import { Glossary } from './Glossary'
import { StageTestOverlay } from './StageTestOverlay'
import { QuizOverlay, QuizMode, DifficultyFilter } from '../components/QuizOverlay'
import { PracticeSession, SessionConfig } from '../components/PracticeSession'
import { computeRevisionData, computeLevelMastery, todayStr, Status } from '../lib/mastery'
import { EXAM_TERMS, FOUNDATION_MCQ_BANK, hasPastPapers, pastPaperUrl } from '../data/pastPapers'
import { color, border, shadow } from '../theme'

export function Practice() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [sheet, setSheet] = useState<'none' | 'flashcards' | 'formulas' | 'glossary' | 'stage' | 'setup' | 'smart'>('none')
  const [activeTest, setActiveTest] = useState<{ paperId: number; grand: boolean } | null>(null)

  // Smart quiz overlay state
  const [smartQuiz, setSmartQuiz] = useState<{ mode: QuizMode; difficulty: DifficultyFilter; timed: boolean } | null>(null)
  const [smartMode, setSmartMode] = useState<QuizMode>('weak')
  const [smartDifficulty, setSmartDifficulty] = useState<DifficultyFilter>('all')
  const [smartTimed, setSmartTimed] = useState(false)

  // Practice Exam Setup State
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null)
  const [setupPaperId, setSetupPaperId] = useState<number | null>(null)
  const [setupTermId, setSetupTermId] = useState<string>(EXAM_TERMS[0]?.id ?? 'jun26')
  const [setupCount, setSetupCount] = useState<number>(100)
  const [setupTimed, setSetupTimed] = useState<boolean>(true)
  const [setupMinutes, setSetupMinutes] = useState<number>(120)

  const level = useStore((s) => s.level)
  const progress = useStore((s) => s.progress)
  const qp = useStore((s) => s.qp)
  const srs = useStore((s) => s.srs)
  const papers = papersForLevel(level).filter((p) => chaptersForLevel(level).some((c) => c.paperId === p.id))
  const setupTerm = EXAM_TERMS.find((t) => t.id === setupTermId) ?? EXAM_TERMS[0]

  // Revision hub summary (drives the counters shown on the Practice screen).
  const revision = useMemo(
    () => computeRevisionData(level, chaptersForLevel(level), progress, new Map(Object.entries(qp)), new Map(Object.entries(srs)), questions, flashcards, todayStr()),
    [level, progress, qp, srs],
  )

  // Phase 2 — Mastery Engine surfaced here: paper bars + weak/strong areas.
  const mastery = useMemo(
    () => computeLevelMastery(level, chaptersForLevel(level), progress, new Map(Object.entries(qp)), new Map(Object.entries(srs)), flashcards, todayStr()),
    [level, progress, qp, srs],
  )
  const weakestAreas = useMemo(
    () => mastery.chapters
      .filter((c) => c.status === 'weak' || c.status === 'revision')
      .sort((a, b) => (a.overall ?? 1) - (b.overall ?? 1))
      .slice(0, 3),
    [mastery],
  )
  const strongestAreas = useMemo(
    () => mastery.chapters
      .filter((c) => c.status === 'strong')
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
      .slice(0, 3),
    [mastery],
  )

  // Handle deep links from the Home dashboard: ?mode=weak / ?deck=due
  useEffect(() => {
    const mode = params.get('mode')
    const deck = params.get('deck')
    if (mode === 'weak') {
      setSmartMode('weak')
      setSheet('smart')
      window.history.replaceState({}, '', '/practice')
    } else if (deck === 'due') {
      setSheet('flashcards')
      window.history.replaceState({}, '', '/practice')
    }
  }, [params])

  const startSmart = () => {
    setSmartQuiz({ mode: smartMode, difficulty: smartDifficulty, timed: smartTimed })
    setSheet('none')
  }

  const tiles = [
    { key: 'flashcards' as const, icon: CreditCard, tint: color.secondaryTint, iconColor: color.secondary, title: 'Flashcards', desc: 'Spaced repetition drills' },
    { key: 'stage' as const, icon: Layers, tint: color.primaryTint, iconColor: color.warning, title: 'Paper Tests', desc: '20 mixed Q · Grand Final 50' },
    { key: 'formulas' as const, icon: Calculator, tint: color.successTint, iconColor: color.success, title: 'Formula Sheet', desc: 'All formulas, searchable' },
    { key: 'glossary' as const, icon: BookA, tint: color.dangerTint, iconColor: color.danger, title: 'Glossary', desc: '150+ terms, A–Z' },
  ]

  const startPractice = () => {
    setSessionConfig({
      level,
      paperId: setupPaperId,
      termId: setupTermId,
      count: setupCount,
      timed: setupTimed,
      minutes: setupTimed ? setupMinutes : 0
    })
    setSheet('none')
  }

  const openOfficialPaper = () => {
    if (level === 'foundation') {
      window.open(FOUNDATION_MCQ_BANK, '_blank')
      return
    }
    if (!setupPaperId || !setupTerm || !hasPastPapers(setupPaperId)) return
    const url = pastPaperUrl(setupPaperId, setupTerm.folder)
    nav(`/pdf?src=${encodeURIComponent(url)}&title=${encodeURIComponent(`ICMAI Paper ${setupPaperId} · ${setupTerm.label}`)}`)
  }

  if (sessionConfig) {
    return <PracticeSession config={sessionConfig} onClose={() => setSessionConfig(null)} />
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: color.surface }}>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 900, fontSize: 27 }}>Practice</div>
        <div style={{ color: color.muted, fontSize: 14, marginTop: 2, fontWeight: 600 }}>Drill, test, and revise.</div>
      </div>
      <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }} className="safe-bottom">

        {/* ===== SMART SESSIONS (V2) ===== */}
        <Card style={{ padding: 18, background: color.secondaryTint, border: border.thick }} onClick={() => { setSmartMode('weak'); setSheet('smart') }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: color.secondary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: border.thin }}>
              <Brain size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 17 }}>Smart Quiz</div>
              <div style={{ color: color.text, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>The engine picks what you need most</div>
            </div>
            <ArrowRight size={18} color={color.secondary} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <MiniStat icon={<AlertTriangle size={13} color={color.danger} />} label="Weak" value={`${revision.weakQuestions.length}`} />
            <MiniStat icon={<RefreshCw size={13} color={color.warning} />} label="Mistakes" value={`${revision.previousMistakes.length}`} />
            <MiniStat icon={<Target size={13} color={color.secondary} />} label="Cards due" value={`${revision.dueFlashcards.length}`} />
          </div>
        </Card>

        {/* ===== REVISION HUB ===== */}
        <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} onClick={() => nav('/revision')}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 900, fontSize: 15 }}>Revision</div>
            <span style={{ fontSize: 12, fontWeight: 800, color: color.secondary }}>Open hub →</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <MiniStat icon={<RefreshCw size={13} color={color.warning} />} label="Due revision" value={`${revision.dueFlashcards.length}`} />
            <MiniStat icon={<AlertTriangle size={13} color={color.danger} />} label="Weak chapters" value={`${revision.weakChapters.length}`} />
            <MiniStat icon={<Check size={13} color={color.success} />} label="Done (7d)" value={`${revision.recentlyCompleted.length}`} />
          </div>
        </Card>

        {/* ===== MASTERY MAP (Phase 2) ===== */}
        <Card style={{ padding: 18, background: color.card, border: border.thin }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Mastery Map</div>
            <span style={{ fontSize: 12, fontWeight: 800, color: statusColor(mastery.status) }}>
              {mastery.overall === null ? 'No data yet' : `${Math.round(mastery.overall * 100)}% overall`}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {mastery.papers.map((p) => (
              <div key={p.paperId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ width: 46, fontSize: 11, fontWeight: 800, color: color.muted }}>{p.code}</span>
                <div style={{ flex: 1, height: 10, background: color.surface, borderRadius: 5, overflow: 'hidden', border: border.thin }}>
                  <div style={{ width: `${Math.round((p.overall ?? 0) * 100)}%`, height: '100%', background: statusColor(p.status), transition: 'width 0.3s' }} />
                </div>
                <span className="mono" style={{ width: 38, textAlign: 'right', fontSize: 12, fontWeight: 800 }}>
                  {p.overall === null ? '—' : Math.round(p.overall * 100) + '%'}
                </span>
              </div>
            ))}
          </div>

          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>🔴 Your Weakest Areas <span style={{ color: color.muted, fontWeight: 600, fontSize: 11 }}>— lowest mastery first</span></div>
          {weakestAreas.length === 0 ? (
            <div style={{ color: color.muted, fontSize: 12, fontWeight: 600, padding: '4px 0 10px' }}>No weak chapters yet — keep practising and they will show up here.</div>
          ) : (
            weakestAreas.map((st, i) => (
              <Tappable key={st.chapterId} onClick={() => nav(`/chapter/${st.chapterId}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', width: '100%', textAlign: 'left' }}>
                <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: color.muted, width: 16 }}>{i + 1}.</span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapterById(st.chapterId)?.title ?? `Chapter ${st.chapterId}`}</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: statusColor(st.status) }}>{Math.round((st.overall ?? 0) * 100)}%</span>
              </Tappable>
            ))
          )}

          <div style={{ fontWeight: 800, fontSize: 13, margin: '12px 0 6px' }}>🟢 Your Strongest Areas</div>
          {strongestAreas.length === 0 ? (
            <div style={{ color: color.muted, fontSize: 12, fontWeight: 600, padding: '4px 0 2px' }}>Nothing mastered yet — keep going!</div>
          ) : (
            strongestAreas.map((st, i) => (
              <Tappable key={st.chapterId} onClick={() => nav(`/chapter/${st.chapterId}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', width: '100%', textAlign: 'left' }}>
                <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: color.muted, width: 16 }}>{i + 1}.</span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapterById(st.chapterId)?.title ?? `Chapter ${st.chapterId}`}</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: statusColor(st.status) }}>{Math.round((st.overall ?? 0) * 100)}%</span>
              </Tappable>
            ))
          )}
        </Card>

        <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, background: color.primaryTint, border: border.thick }} onClick={() => setSheet('setup')}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: color.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', border: border.thin }}>
              <Layers size={24} />
            </div>
            <div style={{ background: color.primary, color: '#fff', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800, border: border.thin }}>MOCK EXAM</div>
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 22, marginTop: 4 }}>Practice Exam</div>
            <div style={{ color: color.text, fontSize: 14, marginTop: 4, fontWeight: 600, opacity: 0.8 }}>Full-length timed sessions (100 Qs). Select subjects, simulate real exams, and review answers.</div>
          </div>
          <Button variant="primary" style={{ marginTop: 8, width: '100%', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <Settings2 size={18} /> Configure & Start
          </Button>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {tiles.map((t) => {
            const Icon = t.icon
            return (
              <Card key={t.key} style={{ padding: 16, minHeight: 140, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} onClick={() => setSheet(t.key)}>
                <div style={{ width: 40, height: 40, borderRadius: 8, border: border.thin, background: t.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.iconColor }}><Icon size={20} /></div>
                <div><div style={{ fontWeight: 800, fontSize: 15 }}>{t.title}</div><div style={{ color: color.muted, fontSize: 12, marginTop: 2, fontWeight: 600 }}>{t.desc}</div></div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Smart quiz setup sheet */}
      <BottomSheet open={sheet === 'smart'} onClose={() => setSheet('none')} title="Smart Quiz">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 4px 16px' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Focus</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ModeRow active={smartMode === 'weak'} title="Weak Questions" desc="The questions you keep getting wrong" onClick={() => setSmartMode('weak')} />
              <ModeRow active={smartMode === 'mistakes'} title="Previous Mistakes" desc="Everything you have ever answered wrong" onClick={() => setSmartMode('mistakes')} />
              <ModeRow active={smartMode === 'timed'} title="Timed Quiz" desc="30s per question, mixed difficulty" onClick={() => { setSmartMode('timed'); setSmartTimed(true) }} />
              <ModeRow active={smartMode === 'practice'} title="Practice (mixed)" desc="A random 15-question warm-up" onClick={() => setSmartMode('practice')} />
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Difficulty (for you)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['all', 'easy', 'medium', 'hard'] as DifficultyFilter[]).map((d) => (
                <Tappable key={d} onClick={() => setSmartDifficulty(d)} style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: smartDifficulty === d ? color.primary : color.card, border: smartDifficulty === d ? border.thick : border.thin, borderRadius: 8, fontWeight: 800, fontSize: 13, textTransform: 'capitalize' }}>{d}</Tappable>
              ))}
            </div>
          </div>
          {smartMode === 'timed' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: color.card, border: border.thin, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>30 seconds per question</div>
              <Tappable onClick={() => setSmartTimed(!smartTimed)} style={{ background: smartTimed ? color.success : color.card, border: border.thin, borderRadius: 20, width: 44, height: 24, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 2, left: smartTimed ? 22 : 2, width: 18, height: 18, background: '#fff', border: border.thin, borderRadius: '50%', transition: '0.2s' }} />
              </Tappable>
            </div>
          )}
          <Button variant="primary" onClick={startSmart} style={{ width: '100%' }}>
            <Play size={18} /> Start Smart Quiz
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'setup'} onClose={() => setSheet('none')} title="Configure Exam">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 4px 16px' }}>
          
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Subject</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              <Tappable
                onClick={() => setSetupPaperId(null)}
                style={{ flexShrink: 0, padding: '8px 16px', background: setupPaperId === null ? color.secondary : color.card, color: setupPaperId === null ? '#fff' : color.text, border: border.thin, borderRadius: 8, fontWeight: 800, fontSize: 13 }}
              >
                All Subjects (Mixed)
              </Tappable>
              {papers.map(p => (
                <Tappable
                  key={p.id}
                  onClick={() => setSetupPaperId(p.id)}
                  style={{ flexShrink: 0, padding: '8px 16px', background: setupPaperId === p.id ? color.secondary : color.card, color: setupPaperId === p.id ? '#fff' : color.text, border: border.thin, borderRadius: 8, fontWeight: 800, fontSize: 13 }}
                >
                  {p.code}
                </Tappable>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Official Paper Term</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {EXAM_TERMS.map(term => (
                <Tappable
                  key={term.id}
                  onClick={() => setSetupTermId(term.id)}
                  style={{ flexShrink: 0, padding: '8px 14px', background: setupTermId === term.id ? color.secondary : color.card, color: setupTermId === term.id ? '#fff' : color.text, border: border.thin, borderRadius: 8, fontWeight: 800, fontSize: 13 }}
                >
                  {term.label}
                </Tappable>
              ))}
            </div>
          </div>

          <div style={{ background: color.secondaryTint, border: border.thin, borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 4 }}>Official ICMAI source</div>
            <div style={{ color: color.muted, fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>
              {level === 'foundation'
                ? 'Foundation objective practice is linked to ICMAI official MCQ portal.'
                : setupPaperId
                  ? `Open ${setupTerm?.label ?? 'selected term'} official paper PDF inside the app, then practise with the configured drill.`
                  : 'Choose one subject to open its official paper PDF inside the app.'}
            </div>
            {(level === 'foundation' || (setupPaperId && setupTerm && hasPastPapers(setupPaperId))) && (
              <Button variant="secondary" onClick={openOfficialPaper} style={{ width: '100%', marginTop: 10 }}>
                {level === 'foundation' ? 'Open ICMAI MCQ Portal' : 'Open Official Paper PDF'}
              </Button>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Questions</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[25, 50, 100].map(count => (
                <Tappable
                  key={count}
                  onClick={() => setSetupCount(count)}
                  style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: setupCount === count ? color.primaryTint : color.card, border: setupCount === count ? border.thick : border.thin, borderRadius: 8, fontWeight: 800, fontSize: 14 }}
                >
                  {count} Qs
                </Tappable>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>Timed Mode</span>
              <Tappable onClick={() => setSetupTimed(!setupTimed)} style={{ background: setupTimed ? color.success : color.card, border: border.thin, borderRadius: 20, width: 44, height: 24, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 2, left: setupTimed ? 22 : 2, width: 18, height: 18, background: '#fff', border: border.thin, borderRadius: '50%', transition: '0.2s' }} />
              </Tappable>
            </div>
            {setupTimed && (
              <div style={{ display: 'flex', gap: 8 }}>
                {[30, 60, 90, 120].map(mins => (
                  <Tappable
                    key={mins}
                    onClick={() => setSetupMinutes(mins)}
                    style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: setupMinutes === mins ? color.card : 'transparent', border: setupMinutes === mins ? border.thin : '1px solid transparent', borderRadius: 8, fontWeight: 700, fontSize: 13, opacity: setupMinutes === mins ? 1 : 0.6 }}
                  >
                    {mins}m
                  </Tappable>
                ))}
              </div>
            )}
          </div>

          <Button variant="primary" onClick={startPractice} style={{ marginTop: 8, width: '100%', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <Play size={18} /> Start Exam
          </Button>

        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'flashcards'} onClose={() => setSheet('none')} title="Flashcards Due"><FlashcardsDue /></BottomSheet>
      <BottomSheet open={sheet === 'formulas'} onClose={() => setSheet('none')} title="Formula Sheet" height={'80%'}><FormulaSheet /></BottomSheet>
      <BottomSheet open={sheet === 'glossary'} onClose={() => setSheet('none')} title="Glossary" height={'80%'}><Glossary /></BottomSheet>
      <BottomSheet open={sheet === 'stage'} onClose={() => setSheet('none')} title="Paper Tests">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '2px 4px 4px 2px' }}>
          {papers.map((p) => (
            <Tappable key={p.id} onClick={() => { setSheet('none'); setActiveTest({ paperId: p.id, grand: false }) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: color.card, border: border.thin, borderRadius: 10, boxShadow: shadow.sm, padding: 16 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{p.code} Test <span style={{ color: color.muted, fontWeight: 600 }}>(20 Q)</span></span>
              <ArrowRight size={18} color={color.secondary} />
            </Tappable>
          ))}
          <Tappable onClick={() => { setSheet('none'); setActiveTest({ paperId: 0, grand: true }) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: color.primary, border: border.thick, borderRadius: 10, boxShadow: shadow.md, padding: 16 }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: color.text }}>Grand Final Test (50 Q)</span>
            <ArrowRight size={18} color={color.text} />
          </Tappable>
        </div>
      </BottomSheet>

      {activeTest && <StageTestOverlay paperId={activeTest.paperId} grand={activeTest.grand} level={level} onClose={() => setActiveTest(null)} />}
      {smartQuiz && (
        <QuizOverlay
          pool={questions}
          mode={smartQuiz.mode}
          difficulty={smartQuiz.difficulty}
          timed={smartQuiz.mode === 'timed' ? (smartQuiz.timed ? 30 : null) : null}
          title={smartQuiz.mode === 'weak' ? 'Weak Questions' : smartQuiz.mode === 'mistakes' ? 'Previous Mistakes' : smartQuiz.mode === 'timed' ? 'Timed Quiz' : 'Practice'}
          onClose={() => setSmartQuiz(null)}
        />
      )}
    </div>
  )
}

function statusColor(s: Status): string {
  return s === 'strong' ? color.success : s === 'weak' ? color.danger : s === 'revision' ? color.warning : color.muted
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div style={{ flex: 1, background: color.card, border: border.thin, borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>{icon}<span className="mono" style={{ fontWeight: 800, fontSize: 14 }}>{value}</span></div>
      <div style={{ color: color.muted, fontSize: 10, marginTop: 2, fontWeight: 700 }}>{label}</div>
    </div>
  )
}

function ModeRow({ active, title, desc, onClick }: { active: boolean; title: string; desc: string; onClick: () => void }) {
  return (
    <Tappable onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, background: active ? color.primaryTint : color.card, border: active ? border.thick : border.thin, borderRadius: 10, boxShadow: shadow.sm, padding: 12, width: '100%', textAlign: 'left' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{title}</div>
        <div style={{ color: color.muted, fontSize: 12, fontWeight: 600 }}>{desc}</div>
      </div>
      {active && <span style={{ color: color.secondary, fontWeight: 900 }}>✓</span>}
    </Tappable>
  )
}
