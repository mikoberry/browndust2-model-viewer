import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'

// No StrictMode: its dev-only double mount would create/dispose/recreate a
// WebGL context on the same canvas, which leaves the Spine shaders in a
// half-disposed state. The runtime here is already fully effect-cleanup based.
createRoot(document.getElementById('root')).render(<App />)
