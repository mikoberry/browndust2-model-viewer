// Minimal two-route navigation, intentionally without a router library.
//
// The app has exactly two pages and the build uses Vite's `base: './'`, which
// keeps dist/ openable from file:// (Wallpaper Engine loads local HTML files)
// and from arbitrary sub-paths. Matching the LAST path segment instead of an
// exact '/spine-viewer' is what makes sub-path hosting work; every other path
// — including file:///.../dist/index.html — falls through to the wallpaper.

import { useCallback, useEffect, useState } from 'react'

const VIEWER_SEGMENT = 'spine-viewer'

function readLocation() {
  const { pathname, search, hash } = window.location
  const segments = pathname.split('/').filter(Boolean)
  const last = (segments[segments.length - 1] ?? '').toLowerCase()
  return {
    pathname,
    isViewer:
      last === VIEWER_SEGMENT ||
      hash.toLowerCase() === `#${VIEWER_SEGMENT}` ||
      new URLSearchParams(search).has('viewer'),
  }
}

export function useRoute() {
  const [route, setRoute] = useState(readLocation)

  useEffect(() => {
    const onChange = () => setRoute(readLocation())
    window.addEventListener('popstate', onChange)
    window.addEventListener('hashchange', onChange)
    return () => {
      window.removeEventListener('popstate', onChange)
      window.removeEventListener('hashchange', onChange)
    }
  }, [])

  // `href` is resolved relative to the current URL, so './' returns to the
  // wallpaper even when the app is hosted under a sub-path.
  const navigate = useCallback((href) => {
    const url = new URL(href, window.location.href)
    // file:// has no SPA fallback: './' would open a directory listing, so
    // keep the actual index.html filename when navigating back.
    if (window.location.protocol === 'file:' && url.pathname.endsWith('/')) {
      url.pathname += 'index.html'
    }
    try {
      window.history.pushState({}, '', url.pathname + url.search + url.hash)
    } catch {
      // Some file:// contexts forbid pushState; a real navigation still works.
      window.location.assign(url.href)
      return
    }
    setRoute(readLocation())
  }, [])

  return { ...route, navigate }
}
