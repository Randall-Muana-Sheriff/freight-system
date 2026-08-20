import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initBrowserReporting } from './utils/sentry'

// Before the first render, so an error thrown while mounting the tree is
// still caught. A no-op unless VITE_SENTRY_DSN is set at build time.
initBrowserReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
