// Validates the full question & flashcard banks: unique ids, valid chapterIds,
// 4 options, in-range correctIndex, and no duplicated option text.
import { questions } from '../src/data/questions.ts'
import { flashcards } from '../src/data/flashcards.ts'
import { curriculum } from '../src/data/curriculum.ts'

const chapterIds = new Set(curriculum.map((c) => c.id))
const byId: Record<string, number> = {}
let errors = 0

const err = (msg: string) => {
  errors++
  console.error('  ✗', msg)
}

for (const q of questions) {
  if (byId[q.id]) { err(`duplicate question id ${q.id}`); continue }
  byId[q.id] = 1
  if (!chapterIds.has(q.chapterId)) err(`q ${q.id}: invalid chapterId ${q.chapterId}`)
  if (q.options.length !== 4) err(`q ${q.id}: ${q.options.length} options`)
  if (q.correctIndex < 0 || q.correctIndex > 3) err(`q ${q.id}: correctIndex ${q.correctIndex}`)
  const lower = q.options.map((o) => o.toLowerCase())
  if (new Set(lower).size !== 4) err(`q ${q.id}: duplicate option text`)
  // the correct option must not be empty
  if (!q.options[q.correctIndex]?.trim()) err(`q ${q.id}: empty correct option`)
}

const fIds: Record<string, number> = {}
for (const f of flashcards) {
  if (fIds[f.id]) { err(`duplicate flashcard id ${f.id}`); continue }
  fIds[f.id] = 1
  if (!chapterIds.has(f.chapterId)) err(`fc ${f.id}: invalid chapterId ${f.chapterId}`)
  if (!f.front?.trim() || !f.back?.trim()) err(`fc ${f.id}: empty side`)
}

// per-chapter coverage
const perChapter: Record<number, number> = {}
for (const q of questions) perChapter[q.chapterId] = (perChapter[q.chapterId] || 0) + 1
const fcPer: Record<number, number> = {}
for (const f of flashcards) fcPer[f.chapterId] = (fcPer[f.chapterId] || 0) + 1
const noQs = [...chapterIds].filter((id) => !perChapter[id]).sort((a, b) => a - b)
const noFc = [...chapterIds].filter((id) => !fcPer[id]).sort((a, b) => a - b)

console.log(`questions: ${questions.length} | flashcards: ${flashcards.length}`)
console.log(`chapters with no questions: ${noQs.join(',') || 'none'}`)
console.log(`chapters with no flashcards: ${noFc.join(',') || 'none'}`)
const counts = Object.values(perChapter)
console.log(`per-chapter questions: min ${Math.min(...counts)} / max ${Math.max(...counts)} / avg ${(counts.reduce((s, v) => s + v, 0) / counts.length).toFixed(1)}`)

if (errors) {
  console.error(`\n${errors} problem(s) found — FAIL`)
  process.exit(1)
}
console.log('\nAll banks valid ✓')
