import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useStore } from './store'
import { setStatusBarColor, isNative } from './lib/capacitor'
import { checkForUpdate, APP_VERSION } from './lib/updateChecker'
import { UpdatePopup } from './components/UpdatePopup'
import { Home } from './screens/Home'
import { Chapters } from './screens/Chapters'
import { ChapterDetail } from './screens/ChapterDetail'
import { Practice } from './screens/Practice'
import { Profile } from './screens/Profile'
import { Revision } from './screens/Revision'
import { MockHistory } from './screens/MockHistory'
import { Onboarding } from './screens/Onboarding'
import { BottomNav } from './components/BottomNav'
import { Toast } from './components/Toast'
import { LevelUpOverlay, BadgeUnlockOverlay, MilestoneUnlockOverlay } from './components/Overlay'
import { PdfViewer } from './screens/PdfViewer'
import { LoaderScreen } from './components/Loader'
import { ErrorBoundary } from './components/ErrorBoundary'
import { color } from './theme'
import { OfflineBanner } from './components/OfflineBanner'

function AppContent() {
  const { ready, onboardingComplete, init, levelUp, badgeUnlock, milestoneUnlock, toast, clearToast, uiMode } = useStore()
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string; webBuildUrl?: string | null; notes: string; ota: boolean } | null>(null)

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    if (!ready) return
    // Keep the Android status bar in sync with the active theme.
    if (isNative) setStatusBarColor(uiMode)
    // Weekly backup reminder (native only)
    if (isNative) {
      import('./lib/backupReminder').then((m) => m.maybePromptBackup())
    }
    const t = setTimeout(async () => {
      const info = await checkForUpdate(APP_VERSION)
      if (info) {
        setUpdateInfo({
          version: info.latestVersion,
          url: info.downloadUrl,
          webBuildUrl: info.webBuildUrl,
          notes: info.releaseNotes,
          ota: isNative,
        })
      }
    }, 5000)
    return () => clearTimeout(t)
  }, [ready, uiMode])

  if (!ready) {
    return <LoaderScreen />
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: color.surface, overflow: 'hidden' }}>
      <OfflineBanner />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chapters" element={<Chapters />} />
            <Route path="/chapter/:id" element={<ChapterDetail />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/revision" element={<Revision />} />
            <Route path="/mocks" element={<MockHistory />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/pdf" element={<PdfViewer />} />
          </Routes>
        </AnimatePresence>
      </div>

      {onboardingComplete && <BottomNav />}

      <AnimatePresence>
        {!onboardingComplete && <Onboarding key="onboarding" />}
      </AnimatePresence>

      <Toast message={toast} onClose={clearToast} />
      <LevelUpOverlay data={levelUp} />
      <BadgeUnlockOverlay data={badgeUnlock} />
      <MilestoneUnlockOverlay data={milestoneUnlock} />
      <UpdatePopup
        open={!!updateInfo}
        latestVersion={updateInfo?.version || ''}
        downloadUrl={updateInfo?.url || ''}
        webBuildUrl={updateInfo?.webBuildUrl || null}
        releaseNotes={updateInfo?.notes || ''}
        onLater={() => setUpdateInfo(null)}
      />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}
