import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { flashcards } from '../data/flashcards'
import { curriculum, chaptersForLevel } from '../data/curriculum'
import { Tappable } from '../components/ui'
import { Play, Eye } from 'lucide-react'
import { cardTier, isCardDue, isRecentlyLearned, todayStr } from '../lib/mastery'
import { color, border, shadow, font } from '../theme'

const MAX_CARDS = 30

export type FcFilter = 'due' | 'weak' | 'difficult' | 'recent' | 'all'

const FILTERS: { id: FcFilter; label: string }[] = [
  { id: 'due', label: 'Due Today' },
  { id: 'weak', label: 'Weak' },
  { id: 'difficult', label: 'Difficult' },
  { id: 'recent', label: 'Recently Learned' },
  { id: 'all', label: 'All' },
]

export function FlashcardsDue({ initialFilter = 'due' }: { initialFilter?: FcFilter } = {}) {
  const reviewFlashcard = useStore((s) => s.reviewFlashcard)
  const srs = useStore((s) => s.srs)
  const level = useStore((s) => s.level)
  const [filter, setFilter] = useState<FcFilter>(initialFilter)
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const levelChapters = useMemo(
    () => new Set(chaptersForLevel(level).map((c) => c.id)),
    [level],
  )

  // Build the deck for the selected filter from live SRS state (no async load).
  const deck = useMemo(() => {
    const today = todayStr()
    const all = flashcards.filter((f) => levelChapters.has(f.chapterId))
    const withSrs = all.map((f) => ({ f, s: srs[f.id] ?? null }))
    let list = withSrs
    if (filter === 'due') list = withSrs.filter(({ s }) => isCardDue(s, today))
    if (filter === 'weak') list = withSrs.filter(({ s }) => cardTier(s) === 'weak')
    if (filter === 'difficult') list = withSrs.filter(({ s }) => cardTier(s) === 'difficult')
    if (filter === 'recent') list = withSrs.filter(({ s }) => isRecentlyLearned(s, today))
    // Order: new/unseen first, then soonest due, weakest (most lapses) first for weak filters.
    list.sort((a, b) => {
      const ta = tierOrder(a.s), tb = tierOrder(b.s)
      if (ta !== tb) return ta - tb
      return (a.s?.due ?? '0000-01-01').localeCompare(b.s?.due ?? '0000-01-01')
    })
    return list.slice(0, MAX_CARDS).map(({ f }) => f.id)
  }, [filter, srs, levelChapters])

  // Reset the deck position only when the filter changes — NOT when the deck
  // re-computes after each review (that would jump back to the first card).
  useEffect(() => {
    setIdx(0)
    setFlipped(false)
  }, [filter])

  const card = flashcards.find((f) => f.id === deck[idx])
  const chapterTitle = card ? curriculum.find((c) => c.id === card.chapterId)?.title : ''

  const counts = useMemo(() => {
    const today = todayStr()
    const all = flashcards.filter((f) => levelChapters.has(f.chapterId))
    const c = { due: 0, weak: 0, difficult: 0, recent: 0, all: all.length }
    for (const f of all) {
      const s = srs[f.id] ?? null
      if (isCardDue(s, today)) c.due += 1
      const t = cardTier(s)
      if (t === 'weak') c.weak += 1
      if (t === 'difficult') c.difficult += 1
      if (isRecentlyLearned(s, today)) c.recent += 1
    }
    return c
  }, [srs, levelChapters])

  const handle = async (grade: 0 | 1 | 2 | 3) => {
    if (!card) return
    await reviewFlashcard(card.id, grade)
    setFlipped(false)
    setIdx((i) => i + 1)
  }

  const restartDeck = () => { setIdx(0); setFlipped(false) }

  return (
    <div style={{ padding: '2px 4px 4px 2px' }}>
      {/* filter chips */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10 }}>
        {FILTERS.map((f) => (
          <Tappable
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{ flexShrink: 0, padding: '6px 12px', background: filter === f.id ? color.secondary : color.card, color: filter === f.id ? '#fff' : color.text, border: border.thin, borderRadius: 20, fontWeight: 800, fontSize: 12 }}
          >
            {f.label} · {counts[f.id]}
          </Tappable>
        ))}
      </div>

      {deck.length === 0 || !card ? (
        <div style={{ textAlign: 'center', padding: 30, color: color.muted }}>
          <div style={{ fontSize: 32 }}>🎉</div>
          <div style={{ fontWeight: 800, marginTop: 8, color: color.text }}>
            {filter === 'due' ? 'No cards due right now' : filter === 'weak' ? 'No weak cards — nice work!' : filter === 'difficult' ? 'No difficult cards' : filter === 'recent' ? 'Nothing learned recently' : 'No flashcards yet'}
          </div>
          <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>
            {filter === 'due' ? 'New cards count as due. Review a chapter\'s flashcards to build your schedule.' : 'Cards appear here automatically based on how you grade them.'}
          </div>
          {filter !== 'due' && (
            <Tappable onClick={() => setFilter('due')} style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, background: color.primary, color: color.primaryInk, border: border.thick, boxShadow: shadow.md, borderRadius: 10, padding: '10px 18px', fontWeight: 800 }}>
              <Play size={15} /> Review due cards
            </Tappable>
          )}
        </div>
      ) : (
        <>
          <div className="mono" style={{ textAlign: 'center', color: color.muted, fontSize: 13, fontWeight: 700, marginBottom: 10, fontFamily: font.mono }}>
            {idx + 1} / {deck.length} · {FILTERS.find((f) => f.id === filter)?.label.toUpperCase()}
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
          {flipped ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                <Tappable onClick={() => handle(0)} style={{ background: color.dangerTint, border: `3px solid ${color.danger}`, color: color.danger, borderRadius: 10, boxShadow: shadow.sm, padding: 13, fontWeight: 800 }}>Again</Tappable>
                <Tappable onClick={() => handle(1)} style={{ background: color.warningTint, border: `3px solid ${color.warning}`, color: color.warning, borderRadius: 10, boxShadow: shadow.sm, padding: 13, fontWeight: 800 }}>Hard</Tappable>
                <Tappable onClick={() => handle(2)} style={{ background: color.secondaryTint, border: `3px solid ${color.secondary}`, color: color.secondary, borderRadius: 10, boxShadow: shadow.sm, padding: 13, fontWeight: 800 }}>Good</Tappable>
                <Tappable onClick={() => handle(3)} style={{ background: color.successTint, border: `3px solid ${color.success}`, color: color.success, borderRadius: 10, boxShadow: shadow.sm, padding: 13, fontWeight: 800 }}>Easy</Tappable>
              </div>
              <div style={{ marginTop: 8, textAlign: 'center', color: color.muted, fontSize: 11, fontWeight: 600 }}>
                {idx + 1 < deck.length ? 'Card scheduled by your grade' : ''}
              </div>
            </>
          ) : (
            <Tappable onClick={() => setFlipped(true)} style={{ marginTop: 14, width: '100%', background: color.card, border: border.thin, boxShadow: shadow.sm, borderRadius: 10, padding: 13, fontWeight: 800, color: color.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Eye size={15} /> Show answer
            </Tappable>
          )}
          <Tappable onClick={restartDeck} style={{ marginTop: 10, textAlign: 'center', color: color.muted, fontSize: 12, fontWeight: 700, width: '100%', padding: 6 }}>Restart deck</Tappable>
        </>
      )}
    </div>
  )
}

function tierOrder(s: { interval?: number; reviews?: number; lapses?: number; ease?: number; streak?: number } | null): number {
  if (!s || (s.reviews ?? 0) === 0) return 0
  if (s.lapses && s.lapses >= 2) return 1
  if (s.ease && s.ease < 2.0) return 2
  if (s.reviews && s.reviews >= 3 && (s.streak ?? 0) <= 1) return 3
  return 4
}
