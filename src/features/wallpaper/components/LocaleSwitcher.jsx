// Language switcher shown at the top of the wallpaper settings drawer.
// Cycles through zh / en / ja / ko, or expands a small popover of all four.
// Plain buttons only — no <select> (Wallpaper Engine's CEF host cannot open
// the OS dropdown, the same popup trap the rest of the drawer avoids).

import { LOCALES, useLocale, t } from '../../../lib/i18n.js'

export default function LocaleSwitcher() {
  const { locale, setLocale } = useLocale()

  return (
    <div className="ws-locale" role="group" aria-label={t('lang.label')}>
      {LOCALES.map((item) => {
        const active = item.code === locale
        return (
          <button
            key={item.code}
            type="button"
            className={`ws-locale-btn${active ? ' is-active' : ''}`}
            aria-pressed={active}
            title={item.native}
            onClick={() => setLocale(item.code)}
          >
            <span className="ws-locale-flag">{item.flag}</span>
            <span className="ws-locale-label">{item.short}</span>
          </button>
        )
      })}
    </div>
  )
}
