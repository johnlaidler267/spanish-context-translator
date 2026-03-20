import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { SubscriptionProvider } from './contexts/subscription-context.tsx'
import { ViewportSync } from './components/viewport-sync.tsx'
import App from './App.tsx'
import SettingsPage from './pages/settings.tsx'
import UpgradePage from './pages/upgrade.tsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SubscriptionProvider>
      <BrowserRouter>
        <ViewportSync />
        <div className="app-viewport">
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/upgrade" element={<UpgradePage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </SubscriptionProvider>
  </StrictMode>,
)
