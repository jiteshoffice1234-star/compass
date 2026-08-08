/**
 * Expands the CMA Compass question & flashcard banks.
 *
 * Every question generated here is *correct by construction* — the correct
 * answer is always taken from the app's own verified data (glossary terms,
 * formulas, flashcards, chapter keyPoints) and the distractors are drawn from
 * the same data pools, so the answer can never be wrong.
 *
 * Run:  node scripts/generate-banks.js   (wraps esbuild to import the TS data)
 */
const fs = require('fs')
const path = require('path')
const esbuild = require('esbuild')

// ---------------------------------------------------------------------------
// Deterministic shuffle (seeded so regenerating gives identical output)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function shuffleSeeded(arr, rand) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------------------------------------------------------------------------
// Load the real app data by bundling the TS files
// ---------------------------------------------------------------------------
async function loadData() {
  const entry = path.join(__dirname, '_load-data.ts')
  fs.writeFileSync(
    entry,
    `import { curriculum } from '../src/data/curriculum'
import { glossary } from '../src/data/glossary'
import { formulas } from '../src/data/formulas'
import { flashcards } from '../src/data/flashcards'
import { questions } from '../src/data/questions'
;(globalThis as any).__DATA__ = { curriculum, glossary, formulas, flashcards, questions }
`,
  )
  const out = path.join(__dirname, '_load-data.cjs')
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: out,
    logLevel: 'silent',
    loader: { '.ts': 'ts' },
  })
  require(out)
  const D = globalThis.__DATA__
  fs.unlinkSync(entry)
  fs.unlinkSync(out)
  return D
}

// ---------------------------------------------------------------------------
// Category → papers mapping (used to route glossary/formula content to chapters)
// ---------------------------------------------------------------------------
const GLOSSARY_CATEGORY_PAPERS = {
  Fundamentals: [2, 6, 12],
  Recording: [2, 6],
  'Financial Statements': [2, 6],
  Concepts: [2, 6],
  Assets: [2, 6],
  Inventory: [2, 6],
  Receivables: [2, 6],
  Payables: [2, 6],
  Ratios: [2, 6, 12],
  Costing: [8, 12, 16],
  Company: [6, 10, 13, 18],
  Partnership: [6],
  Group: [6, 10, 18],
  Leases: [10, 18],
  Instruments: [10, 18],
  Reporting: [10, 18],
  Tax: [7, 15, 19],
  Audit: [10, 17],
}

const FORMULA_CATEGORY_PAPERS = {
  Core: [2, 6],
  'Income Statement': [2, 6],
  'Balance Sheet': [2, 6],
  Depreciation: [6, 2],
  Inventory: [6, 2],
  Ratios: [2, 6, 12],
  'Cash Flow': [6, 12],
  Costing: [8, 12, 16],
  Company: [10, 13],
  Partnership: [6],
  Consolidation: [10, 18],
  Leases: [10, 18],
  'Tax (India)': [7, 15],
  'GST (India)': [7, 19],
}

function trimForOption(s, max = 150) {
  let out = s.replace(/\s+/g, ' ').trim()
  const ex = out.indexOf('Example:')
  if (ex > 40) out = out.slice(0, ex).trim()
  if (out.length > max) out = out.slice(0, max - 1).trimEnd() + '…'
  return out
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------
async function main() {
  const { curriculum, glossary, formulas, flashcards, questions } = await loadData()
  const rand = mulberry32(20260808)
  const outQuestions = []
  const outFlashcards = []
  let genId = 0

  const chaptersByPaper = {}
  for (const c of curriculum) {
    ;(chaptersByPaper[c.paperId] = chaptersByPaper[c.paperId] || []).push(c)
  }

  // === Glossary-derived questions, routed by category → papers → chapters ===
  const termsByPaper = {}
  for (const g of glossary) {
    const papers = GLOSSARY_CATEGORY_PAPERS[g.category]
    if (!papers) continue
    for (const p of papers) {
      ;(termsByPaper[p] = termsByPaper[p] || []).push(g)
    }
  }

  const formulasByPaper = {}
  for (const f of formulas) {
    const papers = FORMULA_CATEGORY_PAPERS[f.category]
    if (!papers) continue
    for (const p of papers) {
      ;(formulasByPaper[p] = formulasByPaper[p] || []).push(f)
    }
  }

  // Only the ORIGINAL hand-authored flashcards feed the generator — exclude
  // previously generated (gf*) and handwritten-expansion (hf*) cards so the
  // script is idempotent and never compounds its own output.
  const flashByChapter = {}
  for (const f of flashcards) {
    if (f.id.startsWith('gf') || f.id.startsWith('hf')) continue
    ;(flashByChapter[f.chapterId] = flashByChapter[f.chapterId] || []).push(f)
  }

  for (const chapter of curriculum) {
    const cid = chapter.id
    const pool = []
    const fpool = flashByChapter[cid] || []

    // ---- glossary terms for this paper (round-robin subset so each chapter
    // gets a fair, non-duplicated share) ----
    const gpool = (termsByPaper[chapter.paperId] || [])
    const sliceCount = Math.max(4, Math.min(12, Math.ceil(gpool.length / (chaptersByPaper[chapter.paperId]?.length || 1))))
    const gsub = gpool.filter((_, i) => i % (chaptersByPaper[chapter.paperId]?.length || 1) === ((chapter.id + (chaptersByPaper[chapter.paperId]?.length || 1)) % (chaptersByPaper[chapter.paperId]?.length || 1)))

    const localTerms = shuffleSeeded(gsub.length ? gsub : gpool.slice(0, 8), rand).slice(0, sliceCount)

    // T1: "What does X mean?" — options are definitions
    for (const t of localTerms) {
      const others = shuffleSeeded(glossary.filter((o) => o !== t && o.category === t.category), rand).slice(0, 3)
      const distractors = others.length === 3 ? others : shuffleSeeded(glossary.filter((o) => o !== t), rand).slice(0, 3 - others.length)
      const options = [t.definition, ...distractors.map((o) => o.definition)]
      if (new Set(options.map((o) => o.toLowerCase())).size !== 4) continue
      pool.push({ id: `g${cid}-${++genId}`, question: `What is the meaning of “${t.term}”?`, options, correctIndex: 0 })
    }

    // T2: "Which term matches this definition?" — options are terms
    for (const t of localTerms) {
      const others = shuffleSeeded(glossary.filter((o) => o !== t && o.category === t.category), rand).slice(0, 3)
      const distractors = others.length === 3 ? others : shuffleSeeded(glossary.filter((o) => o !== t), rand).slice(0, 3 - others.length)
      const options = [t.term, ...distractors.map((o) => o.term)]
      if (new Set(options.map((o) => o.toLowerCase())).size !== 4) continue
      pool.push({ id: `g${cid}-${++genId}`, question: `Which term is best defined as: “${trimForOption(t.definition, 160)}”?`, options, correctIndex: 0 })
    }

    // T3: "Which concept is this example of?" — options are terms
    for (const t of localTerms) {
      if (!t.example || t.example.length < 25) continue
      if (t.example.toLowerCase().includes(t.term.toLowerCase())) continue
      const others = shuffleSeeded(glossary.filter((o) => o !== t), rand).slice(0, 3)
      const options = [t.term, ...others.map((o) => o.term)]
      if (new Set(options.map((o) => o.toLowerCase())).size !== 4) continue
      pool.push({ id: `g${cid}-${++genId}`, question: `“${trimForOption(t.example, 170)}” — which concept is this an example of?`, options, correctIndex: 0 })
    }

    // ---- formulas for this paper ----
    const fg = (formulasByPaper[chapter.paperId] || [])
    const fSlice = Math.max(3, Math.min(6, Math.ceil(fg.length / (chaptersByPaper[chapter.paperId]?.length || 1))))
    const fLocal = shuffleSeeded(fg, rand).slice(0, fSlice)

    // T4: "What is the formula for X?" — options are formula strings
    for (const fm of fLocal) {
      const others = shuffleSeeded(formulas.filter((o) => o !== fm && o.category === fm.category), rand).slice(0, 3)
      const distractors = others.length === 3 ? others : shuffleSeeded(formulas.filter((o) => o !== fm), rand).slice(0, 3 - others.length)
      const options = [fm.formula, ...distractors.map((o) => o.formula)]
      if (new Set(options.map((o) => o.toLowerCase())).size !== 4) continue
      pool.push({ id: `g${cid}-${++genId}`, question: `What is the formula for ${fm.name}?`, options, correctIndex: 0 })
    }

    // ---- flashcard-derived questions for this chapter ----
    // T6: "What is X?" — options are trimmed backs
    for (const fc of fpool) {
      const others = shuffleSeeded(fpool.filter((o) => o !== fc), rand).slice(0, 3)
      if (others.length < 3) continue
      const options = [trimForOption(fc.back), ...others.map((o) => trimForOption(o.back))]
      if (new Set(options.map((o) => o.toLowerCase())).size !== 4) continue
      pool.push({ id: `g${cid}-${++genId}`, question: `What is “${fc.front}”?`, options, correctIndex: 0 })
    }

    // T7: "Which term is described as..." — options are fronts
    for (const fc of fpool) {
      const others = shuffleSeeded(fpool.filter((o) => o !== fc), rand).slice(0, 3)
      if (others.length < 3) continue
      const options = [fc.front, ...others.map((o) => o.front)]
      if (new Set(options.map((o) => o.toLowerCase())).size !== 4) continue
      pool.push({ id: `g${cid}-${++genId}`, question: `Which term is described as: “${trimForOption(fc.back, 150)}”?`, options, correctIndex: 0 })
    }

    // T8: "Which statement is NOT part of this chapter?" — correct answer is a
    // keyPoint borrowed from another chapter on the same paper.
    const kps = chapter.keyPoints || []
    if (kps.length >= 3) {
      const siblings = (chaptersByPaper[chapter.paperId] || []).filter((o) => o.id !== cid && (o.keyPoints || []).length)
      if (siblings.length) {
        const donor = shuffleSeeded(siblings, rand)[0]
        const foreign = shuffleSeeded(donor.keyPoints, rand)[0]
        const options = [foreign, ...shuffleSeeded(kps, rand).slice(0, 3)]
        // Unique text check guarantees the foreign statement differs from the
        // three chapter keyPoints (the old extra check compared options[0]
        // against itself — always false — so this template never emitted).
        if (new Set(options.map((o) => o.toLowerCase())).size === 4) {
          pool.push({ id: `g${cid}-${++genId}`, question: `Which of these statements does NOT belong to the topic “${chapter.title}”?`, options, correctIndex: 0 })
        }
      }
    }

    // ---- keep pool ordered by source, then record ----
    const shuffledPool = shuffleSeeded(pool, rand)
    for (const q of shuffledPool) {
      // shuffle options & fix correctIndex
      const optIdxs = shuffleSeeded(q.options.map((_, i) => i), rand)
      outQuestions.push({
        id: q.id,
        chapterId: cid,
        question: q.question,
        options: optIdxs.map((i) => q.options[i]),
        correctIndex: optIdxs.indexOf(q.correctIndex),
      })
    }

    // ---- flashcards from glossary terms (term → definition+example) ----
    for (const t of localTerms.slice(0, 4)) {
      if (fpool.length >= 10) break
      outFlashcards.push({
        id: `gf${cid}-${t.term.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
        chapterId: cid,
        front: t.term,
        back: `${t.definition}${t.example ? ` Example: ${t.example}` : ''}`,
      })
    }
  }

  // -------------------------------------------------------------------------
  // Emit TS files
  // -------------------------------------------------------------------------
  const qPath = path.join(__dirname, '..', 'src', 'data', 'questions_generated.ts')
  const fPath = path.join(__dirname, '..', 'src', 'data', 'flashcards_generated.ts')

  let qLines = outQuestions.map((q) => {
    const opts = q.options.map((o) => JSON.stringify(o)).join(', ')
    return `  { id: '${q.id}', chapterId: ${q.chapterId}, question: ${JSON.stringify(q.question)}, options: [${opts}], correctIndex: ${q.correctIndex} },`
  })
  fs.writeFileSync(
    qPath,
    `// AUTO-GENERATED by scripts/generate-banks.js — DO NOT EDIT BY HAND.\n// Correct answers are derived from the app's verified glossary/formulas/flashcards data.\nimport type { Question } from './questions'\n\nexport const GENERATED_QUESTIONS: Question[] = [\n${qLines.join('\n')}\n]\n`,
  )

  const fLines = outFlashcards.map((f) => {
    return `  { id: '${f.id}', chapterId: ${f.chapterId}, front: ${JSON.stringify(f.front)}, back: ${JSON.stringify(f.back)} },`
  })
  fs.writeFileSync(
    fPath,
    `// AUTO-GENERATED by scripts/generate-banks.js — DO NOT EDIT BY HAND.\nimport type { Flashcard } from './flashcards'\n\nexport const GENERATED_FLASHCARDS: Flashcard[] = [\n${fLines.join('\n')}\n]\n`,
  )

  console.log('Generated questions:', outQuestions.length)
  console.log('Generated flashcards:', outFlashcards.length)
  // per-chapter summary
  const perChapter = {}
  for (const q of outQuestions) perChapter[q.chapterId] = (perChapter[q.chapterId] || 0) + 1
  const sorted = Object.entries(perChapter).sort((a, b) => a[0] - b[0])
  console.log('Per-chapter generated question counts:')
  console.log(sorted.map(([k, v]) => `ch${k}:${v}`).join(' '))
  // Base bank = original questions only (exclude previously generated/handwritten)
  const base = questions.filter((q) => !q.id.startsWith('g') && !q.id.startsWith('h'))
  const combined = {}
  for (const q of [...base, ...outQuestions]) combined[q.chapterId] = (combined[q.chapterId] || 0) + 1
  const min = Math.min(...Object.values(combined))
  const max = Math.max(...Object.values(combined))
  const total = Object.values(combined).reduce((s, v) => s + v, 0)
  console.log(`\nGenerated+original: ${total} questions | per-chapter min ${min} / max ${max} / avg ${(total / Object.keys(combined).length).toFixed(1)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
