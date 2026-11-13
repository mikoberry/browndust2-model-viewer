// Route entry. The root path is the actual product (a bare, full-screen
// wallpaper); /spine-viewer is only a development aid for inspecting assets.

import { useEffect } from 'react'
import { useRoute } from './router.js'
import ViewerPage from '../features/viewer/ViewerPage.jsx'
import WallpaperPage from '../features/wallpaper/WallpaperPage.jsx'

export default function App() {
  const { isViewer, navigate } = useRoute()

  useEffect(() => {
    document.title = isViewer ? 'Spine 模型查看器 · 调试' : 'BrownDust 2 · 壁纸'
  }, [isViewer])

  if (isViewer) return <ViewerPage onGoWallpaper={() => navigate('./')} />
  return <WallpaperPage />
}
