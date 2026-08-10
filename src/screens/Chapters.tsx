import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Lock, Check, Play, TrendingDown } from 'lucide-react'
import { useStore } from '../store'
import { chaptersForLevel, paperById, LEVEL_LABELS } from '../data/curriculum'
import { flashcards } from '../data/flashcards'
import { computeLevelMastery, todayStr, Status } from '../lib/mastery'
import { ProgressRing, Tappable } from '../components/ui'
import { SearchOverlay } from './SearchOverlay'
import { color, border, shadow, font } from '../theme'

const statusColor = (s: Status) =>
  s === 'strong' ? color.success : s === 'weak' ? color.danger : s === 'revision' ? color.warning : color.muted
const statusTint = (s: Status) =>
  s === 'strong' ? color.successTint : s === 'weak' ? color.dangerTint : s === 'revision' ? color.warningTint : color.card
const statusEmoji = (s: Status) =>
  s === 'strong' ? '🟢' : s === 'weak' ? '🔴' : s === 'revision' ? '🟡' : '⚪'

export function Chapters() {
  const nav = useNavigate()
  const { progress, isUnlocked, level, qp, srs } = useStore()
  const [filter, setFilter] = useState<number | 'all'>('all')
  const [sort, setSort] = useState<'id' | 'weakest'>('id')
  const [searchOpen, setSearchOpen] = useState(false)

  // Phase 2 — single-pass mastery computation for the whole level.
  const mastery = useMemo(
    () => computeLevelMastery(level, chaptersForLevel(level), progress, new Map(Object.entries(qp)), new Map(Object.entries(srs)), flashcards, todayStr()),
    [level, progress, qp, srs],
  )

  const selectedPaper = filter === 'all' ? null : mastery.papers.find((p) => p.paperId === filter) ?? null

  const list = useMemo(() => {
    const rows = chaptersForLevel(level).filter((c) => filter === 'all' || c.paperId === filter)
    if (sort === 'weakest') {
      return [...rows].sort((a, b) => {
        // "Weakest first" = started chapters with the lowest mastery first;
        // untouched (new) chapters always sort last.
        const rank = (id: number) => {
          const st = mastery.chapterById.get(id)
          if (!st || st.status === 'new') return 1
          return st.overall ?? 0.5
        }
        return rank(a.id) - rank(b.id)
      })
    }
    return rows.sort((a, b) => a.id - b.id)
  }, [filter, level, sort, mastery])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: color.surface }}>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 900, fontSize: 27 }}>Chapters</div>
        <div style={{ color: color.muted, fontSize: 13, fontWeight: 600, marginBottom: 12, marginTop: 2 }}>ICMAI {LEVEL_LABELS[level]} · Syllabus 2022</div>
        <Tappable onClick={() => setSearchOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: color.card, border: border.thin, borderRadius: 10, boxShadow: shadow.sm, padding: '12px 16px', width: '100%', color: color.muted }}>
          <Search size={18} /><span style={{ fontSize: 15, fontWeight: 600 }}>Search chapters…</span>
        </Tappable>

        {/* ===== Paper mastery cards (tap to filter) ===== */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingTop: 12, paddingBottom: 4 }}>
          {mastery.papers.map((p) => {
            const active = filter === p.paperId
            return (
              <Tappable key={p.paperId} onClick={() => setFilter(active ? 'all' : p.paperId)}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
                  background: active ? color.secondaryTint : color.card,
                  border: active ? border.thick : border.thin, borderRadius: 10,
                  boxShadow: shadow.sm, padding: '8px 10px', minWidth: 130,
                }}>
                <ProgressRing
                  value={p.overall ?? 0} size={34} stroke={4}
                  color={statusColor(p.status)}
                  label={p.overall === null ? '–' : `${Math.round(p.overall * 100)}`}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{p.code}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: color.muted, whiteSpace: 'nowrap' }}>
                    {p.chaptersStrong + p.chaptersRevision + p.chaptersWeak > 0
                      ? `${p.chaptersStrong}🟢 ${p.chaptersRevision}🟡 ${p.chaptersWeak}🔴`
                      : 'Not started'}
                  </div>
                </div>
              </Tappable>
            )
          })}
        </div>

        {/* ===== Summary strip: level or selected paper ===== */}
        {(selectedPaper || mastery.chaptersStrong + mastery.chaptersRevision + mastery.chaptersWeak > 0) && (
          <div style={{ display: 'flex', gap: 8, paddingTop: 10, overflowX: 'auto' }}>
            <StatBox label="Mastery" value={selectedPaper ? selectedPaper.overall : mastery.overall} tint={statusTint(selectedPaper ? selectedPaper.status : mastery.status)} />
            <StatBox label="Accuracy" value={selectedPaper ? selectedPaper.accuracy : mastery.accuracy} />
            <StatBox label="Cards" value={selectedPaper ? selectedPaper.flashcardMastery : mastery.flashcardMastery} />
            <StatBox label="Strong" value={selectedPaper ? selectedPaper.chaptersStrong : mastery.chaptersStrong} suffix="ch" plain />
            <StatBox label="Revise" value={selectedPaper ? selectedPaper.chaptersRevision : mastery.chaptersRevision} suffix="ch" plain />
            <StatBox label="Weak" value={selectedPaper ? selectedPaper.chaptersWeak : mastery.chaptersWeak} suffix="ch" plain />
          </div>
        )}

        {/* ===== Sort control ===== */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10 }}>
          <TrendingDown size={14} color={color.muted} />
          <span style={{ fontSize: 12, fontWeight: 700, color: color.muted }}>Sort:</span>
          <Tappable onClick={() => setSort('id')} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, background: sort === 'id' ? color.secondary : color.card, color: sort === 'id' ? '#fff' : color.text, border: border.thin }}>By number</Tappable>
          <Tappable onClick={() => setSort('weakest')} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, background: sort === 'weakest' ? color.secondary : color.card, color: sort === 'weakest' ? '#fff' : color.text, border: border.thin }}>Weakest first</Tappable>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px 16px' }} className="safe-bottom">
        {list.map((c) => {
          const unlocked = isUnlocked(c.id)
          const p = progress[c.id]
          const st = mastery.chapterById.get(c.id)
          return (
            <Tappable key={c.id} onClick={() => unlocked && nav(`/chapter/${c.id}`)} disabled={!unlocked as any}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: p?.completed ? color.successTint : color.card,
                border: border.thin, borderRadius: 10,
                boxShadow: unlocked ? shadow.sm : 'none',
                padding: 14, marginBottom: 12, minHeight: 64,
                opacity: unlocked ? 1 : 0.55, width: '100%', textAlign: 'left',
              }}>
              <div className="mono" style={{ width: 38, height: 38, borderRadius: 8, border: border.thin, background: p?.completed ? color.success : color.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: p?.completed ? '#fff' : color.text, flexShrink: 0, fontFamily: font.mono }}>{c.id}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: color.text }}>{c.title}</div>
                <div style={{ color: color.muted, fontSize: 12, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontWeight: 600 }}>
                  <span style={{ background: color.secondaryTint, color: color.secondary, border: '1px solid #000', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>{paperById(c.paperId)?.code}</span>
                  <span>{c.section}</span>
                  {st && st.status !== 'new' && (
                    <span style={{ background: statusTint(st.status), color: statusColor(st.status), border: border.thin, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>
                      {statusEmoji(st.status)} {st.overall !== null ? Math.round(st.overall * 100) + '%' : '—'}
                    </span>
                  )}
                </div>
              </div>
              {!unlocked ? (
                <Lock size={20} color={color.muted} />
              ) : p?.completed ? (
                <Check size={22} color={color.success} strokeWidth={3} />
              ) : st && st.status !== 'new' ? (
                <ProgressRing value={st.overall ?? 0} size={30} stroke={4} color={statusColor(st.status)} />
              ) : p?.video_watched ? (
                <ProgressRing value={p.quiz_passed ? 1 : 0.5} size={28} stroke={4} />
              ) : (
                <Play size={20} color={color.secondary} />
              )}
            </Tappable>
          )
        })}
      </div>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </div>
  )
}

function StatBox({ label, value, suffix = '%', tint, plain }: { label: string; value: number | null; suffix?: string; tint?: string; plain?: boolean }) {
  return (
    <div style={{ flexShrink: 0, background: tint ?? color.card, border: border.thin, borderRadius: 8, padding: '6px 12px', textAlign: 'center', minWidth: 62 }}>
      <div className="mono" style={{ fontWeight: 800, fontSize: 15 }}>
        {plain ? value : value === null ? '—' : `${Math.round(value * 100)}${suffix}`}
      </div>
      <div style={{ color: color.muted, fontSize: 10, fontWeight: 700, marginTop: 1 }}>{label}</div>
    </div>
  )
}
