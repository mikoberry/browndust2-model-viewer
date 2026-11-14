import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { wallkitWE } from 'wallkit/we/vite'
import { modelLibraryPlugin } from './scripts/model-library-plugin.mjs'
import { embedBuildPlugin } from './scripts/embed-build-plugin.mjs'

// `BD2_EMBED=1` (set by `npm run build:we`) produces a bundle that requests
// nothing at runtime, because Wallpaper Engine 2.8.797+ (CEF 156) blocks every
// cross-origin request from a file:// page: ES modules, `crossorigin`
// stylesheets, XHR for .skel/.atlas and <img> for atlas pages all fail, which
// shows up as a black wallpaper. See docs/we-file-access.md.
//
// The embed build therefore switches the entry to a CLASSIC script (IIFE) and
// funnels every model asset through `scripts/embed-build-plugin.mjs`.
// `npm run dev` and a plain `npm run build` keep the normal ESM output.
const embed = process.env.BD2_EMBED === '1'

// base './' keeps a built dist/ openable from any path (including file://),
// which is handy when the viewer is used as a local model inspector.
export default defineConfig({
  // wallkitWE() injects the Wallpaper Engine listener bridges as classic
  // scripts at the top of <head>, ahead of the module entry. Registering them
  // from React would miss the first audio frames (see wallkit's
  // docs/we-integration.md). Outside WE the bridges are inert.
  plugins: [
    modelLibraryPlugin(),
    react(),
    wallkitWE(),
    ...(embed ? [embedBuildPlugin()] : []),
  ],
  base: './',
  // wallkit ships raw JSX + CSS (git dependency, no build step), so it has to
  // go through Vite's own transform pipeline instead of esbuild pre-bundling.
  optimizeDeps: {
    exclude: ['wallkit'],
  },
  server: {
    host: '127.0.0.1',
  },
  build: {
    target: 'es2020',
    // Atlas pages are large PNGs; keep them as files rather than inlining.
    assetsInlineLimit: 0,
    // A classic script cannot use <link rel="modulepreload">; the polyfill the
    // ESM build injects would be dead weight (and a needless CORS surface).
    modulePreload: embed ? false : undefined,
    rollupOptions: embed
      ? {
          output: {
            // IIFE + a single chunk is what makes `<script defer src>` legal
            // without any ESM semantics on the page.
            format: 'iife',
            inlineDynamicImports: true,
            entryFileNames: 'assets/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash][extname]',
          },
        }
      : undefined,
  },
})
