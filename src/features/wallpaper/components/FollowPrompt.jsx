// One-shot "follow / like / save" nudge. Presentational only: the parent
// decides WHEN it appears (first settings-drawer close, once ever) and what
// dismissal means; this component just renders the card, starts the 5s
// auto-dismiss timer on mount and forwards the × click. It unmounts entirely
// once dismissed, so the timer's cleanup runs on both exit paths.
//
// The text renders in the current locale plus a smaller English line — unless
// the current locale IS English, in which case only one line is shown.
import { useEffect } from 'react'
import { MESSAGES, t, useLocale } from '../../../lib/i18n.js'

const AUTO_DISMISS_MS = 5000
const KEY = 'page.followPrompt'

export default function FollowPrompt({ onDismiss }) {
  const { locale } = useLocale()
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const entry = MESSAGES[KEY] ?? {}
  const primary = entry[locale] ?? entry.zh ?? KEY
  const secondary = locale === 'en' ? null : entry.en

  return (
    <div className="wallpaper-follow" role="status">
      <span className="wallpaper-follow-text">
        <span className="wallpaper-follow-primary">{primary}</span>
        {secondary && <span className="wallpaper-follow-secondary">{secondary}</span>}
      </span>
      <button
        type="button"
        className="wallpaper-follow-close"
        onClick={onDismiss}
        aria-label={t('page.followClose')}
        title={t('page.followClose')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {/* Countdown bar: shrinks linearly over exactly the auto-dismiss window
          (duration comes from the same constant, so they can never drift). */}
      <span className="wallpaper-follow-progress" aria-hidden="true">
        <span
          className="wallpaper-follow-progress-fill"
          style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
        />
      </span>
    </div>
  )
}
