import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { wallkitWE } from 'wallkit/we/vite'

// base must stay relative: Wallpaper Engine loads the built index.html from a
// local file path, so absolute asset URLs would break.
export default defineConfig({
  plugins: [
    react(),
    // media is off: no control in this wallpaper consumes media info.
    wallkitWE({ audio: true, media: false, pause: true }),
  ],
  base: './',
})
