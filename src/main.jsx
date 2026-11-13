import { createRoot } from 'react-dom/client'
import App from './app/App.jsx'
import { installUiScale } from './lib/uiScale.js'
import './styles/global.css'

// Scales every chrome length to the screen (1920x1080 = 1), so the drawer looks the
// same on a 2K / 4K panel as on 1080p. Runs before the first paint of the app.
installUiScale()

// No StrictMode: its dev-only double mount would create/dispose/recreate a
// WebGL context on the same canvas, which leaves the Spine shaders in a
// half-disposed state. The runtime here is already fully effect-cleanup based.
createRoot(document.getElementById('root')).render(<App />)
