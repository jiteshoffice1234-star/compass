import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, Bookmark, BookmarkCheck, Play, FileText, Check } from 'lucide-react'
import { useStore } from '../store'
import { curriculum, paperById, LEVEL_LABELS, playlistForChapter, videosForChapter } from '../data/curriculum'
import { Card, ProgressRing, IconButton, Button } from '../components/ui'
import { ChapterStudyGuide } from '../components/ChapterStudyGuide'
import { QuizOverlay } from '../components/QuizOverlay'
import { FlashcardStack } from '../components/FlashcardStack'
import { PdfTab } from './PdfTab'
import { TabButton } from '../components/TabButton'
import { TabNavigation } from '../components/TabNavigation'
import { ResponsiveVideo } from '../components/ResponsiveVideo'
import { color, border, font } from '../theme'

type Tab = 'overview' | 'quiz' | 'flashcards' | 'pdf'

export function ChapterDetail() {
  const { id } = useParams()
  const chapterId = parseInt(id || '1', 10)
  const nav = useNavigate()
  const chapter = curriculum.find((c) => c.id === chapterId)
  const { progress, isUnlocked, markVideoWatched, toggleBookmarkChapter, bookmarks } = useStore()
  const p = progress[chapterId]
  const [tab, setTab] = useState<Tab>('overview')
  const [quizOpen, setQuizOpen] = useState(false)
  const bookmarked = bookmarks.includes(chapterId)

  // All hooks MUST be declared unconditionally (before any early return) so
  // hook order stays consistent across renders.
  const videos = chapter ? videosForChapter(chapterId) : []
  const playlistId = chapter ? playlistForChapter(chapter) : ''
  const [videoIdx, setVideoIdx] = useState(0) // index into videos; -1 = playlist

  useEffect(() => { setVideoIdx(videos.length ? 0 : -1) }, [chapterId, videos.length])

  const unlocked = isUnlocked(chapterId)
  useEffect(() => {
    // Unknown chapter or still-locked chapter → send the user somewhere useful
    // instead of rendering a blank screen.
    if (!chapter || !unlocked) nav('/chapters')
  }, [chapter, unlocked, nav])

  if (!chapter) return null

  const embedSrc = videoIdx >= 0 && videos[videoIdx]
    ? `https://www.youtube.com/embed/${videos[videoIdx].id}?autoplay=0&rel=0&modestbranding=1&playsinline=1`
    : `https://www.youtube.com/embed/videoseries?list=${playlistId}&rel=0&modestbranding=1&playsinline=1`

  const videoWatched = !!p?.video_watched

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
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <ProgressRing value={p?.quiz_passed ? 1 : 0} size={80} label={<span>{p?.quiz_score || 0}</span>} />
            <div style={{ fontWeight: 900, fontSize: 17, marginTop: 16 }}>Chapter Quiz</div>
            <div style={{ color: color.muted, fontSize: 14, marginTop: 4, fontWeight: 600 }}>15 random questions · pass 50% · +20 XP</div>
            <Button variant="secondary" onClick={() => setQuizOpen(true)} style={{ marginTop: 20, width: '100%' }}>
              {p?.quiz_completed ? 'Retake Quiz' : 'Start Quiz'}
            </Button>
          </div>
        )}

        {tab === 'flashcards' && <FlashcardStack chapterId={chapterId} />}

        {tab === 'pdf' && <PdfTab chapterId={chapterId} />}
      </div>

      <AnimatePresence>
        {quizOpen && <QuizOverlay chapterId={chapterId} onClose={() => setQuizOpen(false)} />}
      </AnimatePresence>
    </div>
  )
}
