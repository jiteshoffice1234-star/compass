import { useState } from 'react'
import { BookOpen, Calculator, Tags, CreditCard, Target, GraduationCap, ChevronDown } from 'lucide-react'
import { Chapter, LEVEL_LABELS, paperById } from '../data/curriculum'
import { flashcards } from '../data/flashcards'
import { CHAPTER_INTROS } from '../data/chapterIntros'
import { glossaryTermsForPaper, formulasForPaper } from '../lib/resourceMap'
import { color, border } from '../theme'

function SectionTitle({ icon, label }: { icon: any; label: string }) {
  const Icon = icon
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 15, margin: '26px 0 10px' }}>
      <div style={{ width: 30, height: 30, borderRadius: 7, border: border.thin, background: color.primaryTint, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.secondary }}>
        <Icon size={15} />
      </div>
      {label}
    </div>
  )
}

export function ChapterStudyGuide({ chapter }: { chapter: Chapter }) {
  const intros = CHAPTER_INTROS[chapter.id]
  const terms = glossaryTermsForPaper(chapter.paperId, 10)
  const formulas = formulasForPaper(chapter.paperId, 8)
  const cards = flashcards.filter((f) => f.chapterId === chapter.id).slice(0, 8)
  const paper = paperById(chapter.paperId)

  // Composed intro for chapters without a hand-written passage.
  const composedIntro =
    !intros || intros.length === 0
      ? [
          `${chapter.title} is a core topic in ${LEVEL_LABELS[chapter.level]} — Paper ${paper?.code ?? chapter.paperId} (${paper?.name ?? 'Study Material'}). This guide walks you through the chapter section by section, the way a full textbook chapter would, so you can revise completely offline.`,
        ]
      : null

  return (
    <div>
      {/* Author's intro — the "whole chapter read" */}
      <SectionTitle icon={GraduationCap} label="Chapter at a glance" />
      {(intros || composedIntro).map((p, i) => (
        <p key={i} style={{ fontSize: 14, lineHeight: 1.65, color: color.text, fontWeight: 500, margin: '0 0 10px' }}>
          {p}
        </p>
      ))}

      {/* Key concepts */}
      <SectionTitle icon={Target} label="Key concepts" />
      {chapter.keyPoints.map((kp, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, border: border.thin, background: color.card, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: color.secondary, flexShrink: 0, marginTop: 1 }}>
            {i + 1}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: color.text, fontWeight: 500 }}>{kp}</div>
        </div>
      ))}

      {/* Formulas for this paper */}
      {formulas.length > 0 && (
        <>
          <SectionTitle icon={Calculator} label="Formulas to remember" />
          {formulas.map((f) => (
            <div key={f.id} style={{ background: color.card, border: border.thin, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{f.name}</div>
              <div className="mono" style={{ color: color.secondary, fontSize: 13, fontWeight: 700, marginTop: 3, fontFamily: 'monospace' }}>{f.formula}</div>
              <div style={{ color: color.muted, fontSize: 12, fontWeight: 600, marginTop: 3 }}>{f.note}</div>
            </div>
          ))}
        </>
      )}

      {/* Key terms */}
      {terms.length > 0 && (
        <>
          <SectionTitle icon={Tags} label="Key terms" />
          {terms.map((t) => (
            <div key={t.term} style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 13.5, color: color.secondary }}>{t.term}</span>
              <span style={{ fontSize: 13.5, color: color.text, fontWeight: 500 }}> — {t.definition}</span>
            </div>
          ))}
        </>
      )}

      {/* Flashcard preview */}
      {cards.length > 0 && (
        <>
          <SectionTitle icon={CreditCard} label="Quick revision cards" />
          {cards.map((c) => (
            <FlashcardRow key={c.id} front={c.front} back={c.back} />
          ))}
        </>
      )}

      <SectionTitle icon={BookOpen} label="How to study this chapter" />
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: color.text, fontWeight: 500 }}>
        <p style={{ margin: '0 0 8px' }}>1. Read the key concepts above, then watch the lecture video for this chapter.</p>
        <p style={{ margin: '0 0 8px' }}>2. Attempt the 15-question chapter quiz — you need 50% to pass.</p>
        <p style={{ margin: '0 0 8px' }}>3. Drill the flashcards until every term is automatic.</p>
        <p style={{ margin: 0 }}>4. Open the official ICMAI study material (bundled in the app — fully offline) and the generated chapter PDFs for deep practice.</p>
      </div>
    </div>
  )
}

function FlashcardRow({ front, back }: { front: string; back: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: border.thin, borderRadius: 8, marginBottom: 8, overflow: 'hidden', background: color.card }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', color: color.text, cursor: 'pointer', textAlign: 'left', fontWeight: 700, fontSize: 13.5 }}
      >
        <CreditCard size={14} color={color.secondary} />
        <span style={{ flex: 1 }}>{front}</span>
        <ChevronDown size={16} color={color.muted} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 12px 10px', color: color.text, fontSize: 13, lineHeight: 1.5, fontWeight: 500, background: color.primaryTint }}>
          {back}
        </div>
      )}
    </div>
  )
}
