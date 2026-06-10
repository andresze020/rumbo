'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'

const HIDE_KEY = 'af_hide_install_hint'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Lightweight, dismissible "Add to Home Screen" hint for first-time mobile
 * visitors. Shows an install button on Android/Chrome (using the
 * beforeinstallprompt event) or simple instructions on iOS Safari, where no
 * install prompt API is available.
 */
type HintState =
  | { kind: 'hidden' }
  | { kind: 'ios' }
  | { kind: 'android'; installEvent: BeforeInstallPromptEvent }

export function InstallAppHint() {
  const { t } = useLanguage()
  const [state, setState] = useState<HintState>({ kind: 'hidden' })

  useEffect(() => {
    if (localStorage.getItem(HIDE_KEY) === '1') return

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true

    if (isStandalone) return

    const isMobile = window.matchMedia('(max-width: 768px)').matches
    if (!isMobile) return

    const iosDevice = /iPad|iPhone|iPod/.test(window.navigator.userAgent)

    if (iosDevice) {
      setState({ kind: 'ios' })
      return
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setState({ kind: 'android', installEvent: event as BeforeInstallPromptEvent })
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  if (state.kind === 'hidden') return null

  const isIos = state.kind === 'ios'

  function dismiss() {
    localStorage.setItem(HIDE_KEY, '1')
    setState({ kind: 'hidden' })
  }

  async function handleInstall() {
    if (state.kind !== 'android') return
    await state.installEvent.prompt()
    await state.installEvent.userChoice
    dismiss()
  }

  return (
    <div
      role="status"
      className={cn(
        'mx-4 mt-4 flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-foreground sm:mx-6'
      )}
    >
      <Download className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex-1 space-y-1">
        <p className="font-medium">{t('installPrompt.title')}</p>
        <p className="text-muted-foreground">
          {isIos ? t('installPrompt.iosDescription') : t('installPrompt.androidDescription')}
        </p>
        {!isIos && (
          <div className="pt-1">
            <Button type="button" size="sm" onClick={handleInstall}>
              {t('installPrompt.install')}
            </Button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('installPrompt.dismiss')}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
