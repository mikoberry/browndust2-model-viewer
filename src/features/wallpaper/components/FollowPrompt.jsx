// One-shot "follow / like / save" nudge. Presentational only: the parent
// decides WHEN it appears (first settings-drawer close, once ever) and what
// dismissal means; this component just renders the card, starts the 5s
// auto-dismiss timer on mount and forwards the × click. It unmounts entirely
// once dismissed, so the timer's cleanup runs on both exit paths.
import { useEffect } from 'react'
import { t } from '../../../lib/i18n.js'

const AUTO_DISMISS_MS = 5000

export default function FollowPrompt({ onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="wallpaper-follow" role="status">
      <span className="wallpaper-follow-text">{t('page.followPrompt')}</span>
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
