import { Capacitor } from '@capacitor/core'
import { APP_VERSION } from './updateChecker'
import { getActiveOtaVersion } from './otaUpdater'

export interface VersionInfo {
  apk_version: string
  ota_version: string | null
  running_version: 'apk' | 'ota'
  app_build: string
}

export async function getVersionInfo(): Promise<VersionInfo> {
  const apkVersion = APP_VERSION
  let runningVersion: 'apk' | 'ota' = 'apk'
  let otaVersion: string | null = null

  if (Capacitor.isNativePlatform()) {
    // The native OtaUpdater plugin owns the active-version state (SharedPreferences);
    // localStorage was never written by it, so query the plugin directly.
    otaVersion = await getActiveOtaVersion()
    runningVersion = otaVersion ? 'ota' : 'apk'
  }

  return {
    apk_version: apkVersion,
    ota_version: otaVersion,
    running_version: runningVersion,
    app_build: `${apkVersion}${otaVersion ? ` (OTA: ${otaVersion})` : ''}`,
  }
}
