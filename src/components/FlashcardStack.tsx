import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { flashcards } from '../data/flashcards'
import { useStore } from '../store'
import { Tappable } from '../components/ui'
import { cardTier, isCardDue, todayStr, SrsGrade } from '../lib/mastery'
import type { Flashcard } from '../data/flashcards'
import { color, border, shadow, font } from '../theme'

const GRADES = [
  { q: 0, label: 'Again', bg: 'dangerTint', fg: 'danger' },
  { q: 1, label: 'Hard', bg: 'warningTint', fg: 'warning' },
  { q: 2, label: 'Good', bg: 'secondaryTint', fg: 'secondary' },
  { q: 3, label: 'Easy', bg: 'successTint', fg: 'success' },
] as const

export function FlashcardStack({ chapterId, cards: cardsProp, onReview }: { chapterId: number; cards?: Flashcard[]; onReview?: (id: string, grade: SrsGrade) => void }) {
  const deck = useMemo(() => cardsProp ?? flashcards.filter((f) => f.chapterId === chapterId), [cardsProp, chapterId])
  const reviewFlashcard = useStore((s) => s.reviewFlashcard)
  const srs = useStore((s) => s.srs)
  const [order, setOrder] = useState(() => deck.map((_, i) => i))
  const [flipped, setFlipped] = useState(false)
  const total = deck.length
  const reviewed = total - order.length

  const current = deck[order[0]]
  const currentSrs = current ? srs[current.id] ?? null : null

  const review = (grade: SrsGrade) => {
    if (!current) return
    reviewFlashcard(current.id, grade)
    onReview?.(current.id, grade)
    setOrder((o) => (grade <= 1 ? [...o.slice(1), o[0]] : o.slice(1)))
    setFlipped(false)
  }

  const restart = () => {
    setOrder(deck.map((_, i) => i))
    setFlipped(false)
  }

  if (!current) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: color.muted }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: color.text }}>All caught up</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>You have reviewed every flashcard in this chapter.</div>
        <Tappable onClick={restart} style={{ marginTop: 16, background: color.primary, color: color.primaryInk, border: border.thick, boxShadow: shadow.md, borderRadius: 10, padding: '12px 22px', fontWeight: 800 }}>Review again</Tappable>
      </div>
    )
  }

  const tier = cardTier(currentSrs)
  const due = isCardDue(currentSrs, todayStr())

  return (
    <div>
      <div className="mono" style={{ color: color.muted, fontSize: 12, fontWeight: 700, marginBottom: 8, fontFamily: font.mono }}>
        {order.length} LEFT · {reviewed} DONE
      </div>
      <div style={{ height: 8, background: color.card, border: border.thin, borderRadius: 5, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${total ? (reviewed / total) * 100 : 0}%`, background: color.secondary, transition: 'width 0.25s' }} />
      </div>
      {/* card status chip */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, padding: '3px 8px', borderRadius: 6, border: border.thin, background: tier === 'mastered' ? color.successTint : tier === 'difficult' || tier === 'weak' ? color.warningTint : color.secondaryTint, color: tier === 'mastered' ? color.success : tier === 'difficult' || tier === 'weak' ? color.warning : color.secondary }}>
          {tier.toUpperCase()}
        </span>
        {!due && currentSrs && (
          <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: color.muted, fontFamily: font.mono }}>due {currentSrs.due}</span>
        )}
      </div>
      <Tappable onClick={() => setFlipped((f) => !f)} style={{ width: '100%' }}>
        <motion.div
          key={current.id + (flipped ? '-b' : '-f')}
          initial={{ rotateY: -8, opacity: 0.6 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ duration: 0.2 }}
          style={{
            background: flipped ? color.primaryTint : color.card,
            border: border.thick,
            borderRadius: 14,
            boxShadow: shadow.lg,
            padding: 24,
            minHeight: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: color.text, background: flipped ? color.primary : color.secondaryTint, border: border.thin, borderRadius: 6, padding: '3px 10px', marginBottom: 12 }}>
              {flipped ? 'DEFINITION' : 'TERM'}
            </div>
            <div style={{ fontSize: flipped ? 15 : 21, fontWeight: 800, lineHeight: 1.4, color: color.text }}>
              {flipped ? current.back : current.front}
            </div>
            <div style={{ fontSize: 12, color: color.muted, marginTop: 16, fontWeight: 600 }}>Tap to {flipped ? 'see term' : 'flip'}</div>
          </div>
        </motion.div>
      </Tappable>

      {flipped && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
          {GRADES.map((g) => (
            <Tappable
              key={g.q}
              onClick={() => review(g.q)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: color[g.bg], color: color[g.fg], border: `3px solid ${color[g.fg]}`, borderRadius: 10, boxShadow: shadow.sm, padding: 14, fontWeight: 800, fontSize: 14 }}
            >
              {g.label}
            </Tappable>
          ))}
        </div>
      )}
      {flipped && (
        <div style={{ marginTop: 8, textAlign: 'center', color: color.muted, fontSize: 11, fontWeight: 600 }}>
          Again/Hard → shown again soon · Good/Easy → scheduled further out
        </div>
      )}
    </div>
  )
}
