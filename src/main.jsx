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
