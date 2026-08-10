import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, Bookmark, BookmarkCheck, Play, FileText, Check, Clock, Target } from 'lucide-react'
import { useStore } from '../store'
import { curriculum, paperById, LEVEL_LABELS, playlistForChapter, videosForChapter } from '../data/curriculum'
import { flashcards } from '../data/flashcards'
import { Card, ProgressRing, IconButton, Button } from '../components/ui'
import { ChapterStudyGuide } from '../components/ChapterStudyGuide'
import { QuizOverlay, QuizMode, DifficultyFilter } from '../components/QuizOverlay'
import { FlashcardStack } from '../components/FlashcardStack'
import { PdfTab } from './PdfTab'
import { TabButton } from '../components/TabButton'
import { TabNavigation } from '../components/TabNavigation'
import { ResponsiveVideo } from '../components/ResponsiveVideo'
import { computeChapterStats, todayStr } from '../lib/mastery'
import { color, border, font } from '../theme'

type Tab = 'overview' | 'quiz' | 'flashcards' | 'pdf'

export function ChapterDetail() {
  const { id } = useParams()
  const chapterId = parseInt(id || '1', 10)
  const nav = useNavigate()
  const chapter = curriculum.find((c) => c.id === chapterId)
  const { progress, isUnlocked, markVideoWatched, toggleBookmarkChapter, bookmarks, qp, srs } = useStore()
  const p = progress[chapterId]
  const [tab, setTab] = useState<Tab>('overview')
  const [quizOpen, setQuizOpen] = useState(false)
  const [quizMode, setQuizMode] = useState<QuizMode>('chapter')
  const [quizDifficulty, setQuizDifficulty] = useState<DifficultyFilter>('all')
  const [quizTimed, setQuizTimed] = useState(false)
  const bookmarked = bookmarks.includes(chapterId)

  // All hooks MUST be declared unconditionally (before any early return) so
  // hook order stays consistent across renders.
  const videos = chapter ? videosForChapter(chapterId) : []
  const playlistId = chapter ? playlistForChapter(chapter) : ''
  const [videoIdx, setVideoIdx] = useState(0)

  useEffect(() => { setVideoIdx(videos.length ? 0 : -1) }, [chapterId, videos.length])

  const unlocked = isUnlocked(chapterId)
  useEffect(() => {
    if (!chapter || !unlocked) nav('/chapters')
  }, [chapter, unlocked, nav])

  // Chapter mastery (V2 engine) — memoized so it recomputes only when data moves.
  const stats = useMemo(() => {
    if (!chapter) return null
    const chapterCards = flashcards.filter((f) => f.chapterId === chapterId)
    const perfMap = new Map(Object.entries(qp))
    const srsMap = new Map(Object.entries(srs))
    return computeChapterStats(chapter, progress[chapterId], perfMap, srsMap, chapterCards, todayStr())
  }, [chapter, chapterId, progress, qp, srs])

  if (!chapter) return null

  const embedSrc = videoIdx >= 0 && videos[videoIdx]
    ? `https://www.youtube.com/embed/${videos[videoIdx].id}?autoplay=0&rel=0&modestbranding=1&playsinline=1`
    : `https://www.youtube.com/embed/videoseries?list=${playlistId}&rel=0&modestbranding=1&playsinline=1`

  const videoWatched = !!p?.video_watched

  const startQuiz = (mode: QuizMode) => {
    setQuizMode(mode)
    setQuizOpen(true)
  }

  const statusChip = stats ? statusLabel(stats.status) : null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: color.surface }}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 8px', gap: 8 }}>
        <IconButton onClick={() => nav(-1)} size={36} aria-label="Go back"><ArrowLeft size={20} /></IconButton>
        <div style={{ fontWeight: 800, fontSize: 15, textAlign: 'center', flex: 1, padding: '0 4px' }}>{chapter.title}</div>
        <IconButton onClick={() => toggleBookmarkChapter(chapterId)} size={36} aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}>
          {bookmarked ? <BookmarkCheck size={19} color={color.secondary} /> : <Bookmark size={19} />}
        </IconButton>
      </div>

      <ResponsiveVideo src={embedSrc} title={chapter.title} />

      {(videos.length > 0) && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 12px 4px', flexShrink: 0 }}>
          {videos.map((v, i) => (
            <TabButton key={v.id} active={videoIdx === i} onClick={() => setVideoIdx(i)} icon={Play} label={v.label} />
          ))}
          <TabButton active={videoIdx === -1} onClick={() => setVideoIdx(-1)} icon={null} label="Full course playlist" />
        </div>
      )}

      <TabNavigation
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'quiz', label: 'Quiz' },
          { id: 'flashcards', label: 'Flashcards' },
          { id: 'pdf', label: 'PDF' },
        ]}
        active={tab}
        onChange={(t) => setTab(t as Tab)}
      />

      {/* content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="safe-bottom">
        {tab === 'overview' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{chapter.title}</div>
              <div className="mono" style={{ color: color.text, background: color.primary, border: border.thin, borderRadius: 6, padding: '2px 8px', fontWeight: 800, fontSize: 12, fontFamily: font.mono }}>{chapter.xpAvailable} XP</div>
            </div>
            <div style={{ color: color.muted, fontSize: 12, marginBottom: 14, fontWeight: 600 }}>
              {LEVEL_LABELS[chapter.level]} · {paperById(chapter.paperId)?.code} · {chapter.section}
            </div>
            <ChapterStudyGuide chapter={chapter} />
            <Button variant={videoWatched ? 'ghost' : 'primary'} onClick={() => markVideoWatched(chapterId)} style={{ width: '100%', marginTop: 16, background: videoWatched ? color.successTint : color.primary }}>
              {videoWatched ? <><Check size={18} color={color.success} /> Watched (+10 XP)</> : <><Play size={18} /> Mark as Watched (+10 XP)</>}
            </Button>
            <Card style={{ padding: 14, marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => setTab('pdf')}>
              <FileText size={20} color={color.secondary} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 14 }}>Chapter PDFs</div><div style={{ color: color.muted, fontSize: 12, fontWeight: 600 }}>Summary, Practice, Cheat Sheet</div></div>
            </Card>
          </div>
        )}

        {tab === 'quiz' && (
          <div>
            {/* Mastery panel */}
            {stats && (
              <Card style={{ padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>Chapter Mastery</div>
                  {statusChip}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <MasteryCell label="Completion" value={stats.completion !== null ? `${Math.round(stats.completion * 100)}%` : '—'} />
                  <MasteryCell label="Accuracy" value={stats.accuracy !== null ? `${Math.round(stats.accuracy * 100)}%` : '—'} />
                  <MasteryCell label="Flashcard mastery" value={stats.flashcardMastery !== null ? `${Math.round(stats.flashcardMastery * 100)}%` : '—'} />
                  <MasteryCell label="Overall" value={stats.overall !== null ? `${Math.round(stats.overall * 100)}%` : '—'} />
                </div>
                {stats.weakQuestions > 0 && (
                  <div style={{ marginTop: 10, background: color.dangerTint, border: border.thin, borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700, color: color.danger }}>
                    🔴 {stats.weakQuestions} weak question{stats.weakQuestions > 1 ? 's' : ''} — revise them below
                  </div>
                )}
              </Card>
            )}

            <div style={{ textAlign: 'center', padding: '4px 0 16px' }}>
              <ProgressRing value={p?.quiz_passed ? 1 : 0} size={80} label={<span>{p?.quiz_score || 0}</span>} />
              <div style={{ fontWeight: 900, fontSize: 17, marginTop: 16 }}>Chapter Quiz</div>
              <div style={{ color: color.muted, fontSize: 14, marginTop: 4, fontWeight: 600 }}>15 random questions · pass 50% · never lose XP</div>
              <Button variant="secondary" onClick={() => startQuiz('chapter')} style={{ marginTop: 16, width: '100%' }}>
                {p?.quiz_completed ? 'Retake Quiz' : 'Start Quiz'} <Play size={16} />
              </Button>
            </div>

            {/* Smart quiz modes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
              <ModeCard icon={<Target size={16} />} title="Full Chapter Test" desc="Every question in this chapter" tint={color.primaryTint} fg={color.warning} onClick={() => startQuiz('chapter_test')} />
              <ModeCard icon={<Clock size={16} />} title="Weak Questions" desc="The ones you keep missing" tint={color.dangerTint} fg={color.danger} onClick={() => startQuiz('weak')} />
              <ModeCard icon={<Check size={16} />} title="Previous Mistakes" desc="Wrong answers, newest first" tint={color.warningTint} fg={color.warning} onClick={() => startQuiz('mistakes')} />
              <ModeCard icon={<Clock size={16} />} title="Timed Quiz" desc="30s per question" tint={color.secondaryTint} fg={color.secondary} onClick={() => { setQuizTimed(true); startQuiz('timed') }} />
            </div>

            {/* Difficulty + timed controls */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, color: color.muted, marginBottom: 6 }}>DIFFICULTY (FOR YOU)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['all', 'easy', 'medium', 'hard'] as DifficultyFilter[]).map((d) => (
                  <TappableChip key={d} active={quizDifficulty === d} label={d === 'all' ? 'All' : d} onClick={() => setQuizDifficulty(d)} />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, background: color.card, border: border.thin, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Timed mode · 30s per question</div>
                <TappableChip active={quizTimed} label={quizTimed ? 'On' : 'Off'} onClick={() => setQuizTimed(!quizTimed)} />
              </div>
              <Button variant="primary" onClick={() => startQuiz(quizTimed ? 'timed' : 'chapter')} style={{ width: '100%', marginTop: 12 }}>
                <Play size={16} /> Start {quizTimed ? 'Timed ' : ''}Quiz {quizDifficulty !== 'all' ? `· ${quizDifficulty}` : ''}
              </Button>
            </div>
          </div>
        )}

        {tab === 'flashcards' && <FlashcardStack chapterId={chapterId} />}

        {tab === 'pdf' && <PdfTab chapterId={chapterId} />}
      </div>

      <AnimatePresence>
        {quizOpen && (
          <QuizOverlay
            chapterId={chapterId}
            mode={quizMode}
            difficulty={quizDifficulty}
            timed={quizTimed ? 30 : null}
            onClose={() => { setQuizOpen(false); setQuizTimed(false) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function statusLabel(status: 'strong' | 'revision' | 'weak' | 'new'): React.ReactNode {
  if (status === 'strong') return <span style={{ fontSize: 12, fontWeight: 900, padding: '3px 10px', borderRadius: 20, background: color.successTint, color: color.success, border: `1px solid ${color.success}` }}>🟢 Strong</span>
  if (status === 'revision') return <span style={{ fontSize: 12, fontWeight: 900, padding: '3px 10px', borderRadius: 20, background: color.warningTint, color: color.warning, border: `1px solid ${color.warning}` }}>🟡 Needs Revision</span>
  if (status === 'weak') return <span style={{ fontSize: 12, fontWeight: 900, padding: '3px 10px', borderRadius: 20, background: color.dangerTint, color: color.danger, border: `1px solid ${color.danger}` }}>🔴 Weak</span>
  return <span style={{ fontSize: 12, fontWeight: 900, padding: '3px 10px', borderRadius: 20, background: color.card, color: color.muted, border: border.thin }}>New</span>
}

function MasteryCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: color.surface, border: border.thin, borderRadius: 8, padding: '8px 10px' }}>
      <div className="mono" style={{ fontSize: 16, fontWeight: 800, fontFamily: font.mono }}>{value}</div>
      <div style={{ color: color.muted, fontSize: 11, marginTop: 1, fontWeight: 700 }}>{label}</div>
    </div>
  )
}

function ModeCard({ icon, title, desc, tint, fg, onClick }: { icon: React.ReactNode; title: string; desc: string; tint: string; fg: string; onClick: () => void }) {
  return (
    <Card style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }} onClick={onClick}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: tint, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: border.thin }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 13 }}>{title}</div>
        <div style={{ color: color.muted, fontSize: 11, fontWeight: 600 }}>{desc}</div>
      </div>
    </Card>
  )
}

function TappableChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <Button variant={active ? 'primary' : 'ghost'} onClick={onClick} style={{ flex: 1, padding: '10px 0', fontSize: 13, borderRadius: 8 }}>
      {label}
    </Button>
  )
}
