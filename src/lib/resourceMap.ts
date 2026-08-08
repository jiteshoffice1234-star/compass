// Maps glossary/formula categories to the papers they belong to. Used by the
// Chapter Study Guide to show the formulas and key terms relevant to a paper,
// and by scripts/generate-banks.cjs to distribute generated questions.
import { glossary, GlossaryTerm } from '../data/glossary'
import { formulas, Formula } from '../data/formulas'

export const GLOSSARY_CATEGORY_PAPERS: Record<string, number[]> = {
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

export const FORMULA_CATEGORY_PAPERS: Record<string, number[]> = {
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

export function glossaryTermsForPaper(paperId: number, limit = 10): GlossaryTerm[] {
  const out: GlossaryTerm[] = []
  const seen = new Set<string>()
  for (const g of glossary) {
    const papers = GLOSSARY_CATEGORY_PAPERS[g.category]
    if (papers && papers.includes(paperId) && !seen.has(g.term)) {
      seen.add(g.term)
      out.push(g)
      if (out.length >= limit) break
    }
  }
  return out
}

export function formulasForPaper(paperId: number, limit = 8): Formula[] {
  const out: Formula[] = []
  const seen = new Set<string>()
  for (const f of formulas) {
    const papers = FORMULA_CATEGORY_PAPERS[f.category]
    if (papers && papers.includes(paperId) && !seen.has(f.name)) {
      seen.add(f.name)
      out.push(f)
      if (out.length >= limit) break
    }
  }
  return out
}
