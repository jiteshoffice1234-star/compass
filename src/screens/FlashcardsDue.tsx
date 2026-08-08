import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { flashcards } from '../data/flashcards'
import { curriculum, chaptersForLevel } from '../data/curriculum'
import { getAllFlashcardProgress } from '../lib/store'
import { Tappable } from '../components/ui'
import { Check, RotateCcw, Loader2 } from 'lucide-react'
import { color, border, shadow, font } from '../theme'

const MAX_CARDS = 20

function dateStr(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

export function FlashcardsDue() {
  const reviewFlashcard = useStore((s) => s.reviewFlashcard)
  const level = useStore((s) => s.level)
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [dueIds, setDueIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Cards due for SRS review: no progress yet (new) or next_review <= today.
  // Scoped to the user's level so you never review another course's cards.
  const levelChapters = useMemo(
    () => new Set(chaptersForLevel(level).map((c) => c.id)),
    [level],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const today = dateStr()
      const progress = await getAllFlashcardProgress()
      const dueMap = new Map(progress.map((p) => [p.flashcard_id, p]))
      const all = flashcards
        .filter((f) => levelChapters.has(f.chapterId))
        .map((f) => ({ f, p: dueMap.get(f.id) }))
        .filter(({ p }) => !p || !p.next_review || p.next_review <= today)
        .sort((a, b) => {
          // new cards first, then oldest scheduled
          const da = a.p?.next_review ?? '0000-01-01'
          const db = b.p?.next_review ?? '0000-01-01'
          return da.localeCompare(db)
        })
        .slice(0, MAX_CARDS)
        .map(({ f }) => f.id)
      if (!cancelled) {
        setDueIds(all)
        setIdx(0)
        setFlipped(false)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [levelChapters, level])

  const card = flashcards.find((f) => f.id === dueIds[idx])
  const chapterTitle = card ? curriculum.find((c) => c.id === card.chapterId)?.title : ''

  const handle = async (q: number) => {
    if (!card) return
    await reviewFlashcard(card.id, q)
    setFlipped(false)
    setIdx((i) => i + 1)
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: color.muted }}><Loader2 className="spin" size={26} /></div>
  }

  if (!card || idx >= dueIds.length) {
    return (
      <div style={{ textAlign: 'center', padding: 30, color: color.muted }}>
        <div style={{ fontSize: 32 }}>🎉</div>
        <div style={{ fontWeight: 800, marginTop: 8, color: color.text }}>All caught up!</div>
        <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>
          No flashcards are due right now{level ? ` for ${level}` : ''}. Check back later for spaced-repetition reviews.
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '2px 4px 4px 2px' }}>
      <div className="mono" style={{ textAlign: 'center', color: color.muted, fontSize: 13, fontWeight: 700, marginBottom: 10, fontFamily: font.mono }}>
        {idx + 1} / {dueIds.length} DUE
      </div>
      {chapterTitle && (
        <div style={{ textAlign: 'center', color: color.muted, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
          {chapterTitle}
        </div>
      )}
      <Tappable onClick={() => setFlipped((f) => !f)} style={{ width: '100%', minHeight: 160, background: flipped ? color.primaryTint : color.card, border: border.thick, borderRadius: 12, boxShadow: shadow.md, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: color.text, background: flipped ? color.primary : color.secondaryTint, border: border.thin, borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 900, letterSpacing: 1, marginBottom: 10 }}>{flipped ? 'DEFINITION' : 'TERM'}</div>
        <div style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', lineHeight: 1.4 }}>{flipped ? card.back : card.front}</div>
      </Tappable>
      <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
        <Tappable onClick={() => handle(1)} style={{ flex: 1, background: color.dangerTint, border: `3px solid ${color.danger}`, color: color.danger, borderRadius: 10, boxShadow: shadow.sm, padding: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <RotateCcw size={15} /> Again
        </Tappable>
        <Tappable onClick={() => handle(5)} style={{ flex: 1, background: color.successTint, border: `3px solid ${color.success}`, color: color.success, borderRadius: 10, boxShadow: shadow.sm, padding: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Check size={15} /> Got it
        </Tappable>
      </div>
    </div>
  )
}
