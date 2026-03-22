import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { SubscriptionProvider } from './contexts/subscription-context.tsx'
import App from './App.tsx'
import UpgradePage from './pages/upgrade.tsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SubscriptionProvider>
      <BrowserRouter>
        <div className="app-viewport">
          {/* Mobile: faded letter fragment behind all routes (fixed, no hit-target) */}
          <div
            className="pointer-events-none fixed top-0 left-0 z-0 hidden max-md:block w-[min(60vw,20.5rem)] select-none"
            aria-hidden
          >
            <img
              src="/mobile-corner-letter.png"
              alt=""
              className="block h-auto w-full object-contain object-left-top opacity-[0.2] dark:opacity-[0.05]"
            />
          </div>
          <Routes>
            <Route path="/upgrade" element={<UpgradePage />} />
            {/* App owns / + /settings so reading state survives settings */}
            <Route path="*" element={<App />} />
          </Routes>
        </div>
      </BrowserRouter>
    </SubscriptionProvider>
  </StrictMode>,
)
