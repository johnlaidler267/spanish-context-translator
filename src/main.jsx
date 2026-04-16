import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { AuthProvider } from '@/contexts/auth-context'
import { SubscriptionProvider } from '@/contexts/subscription-context'
import { AuthModal } from '@/components/auth-modal'
import App from '@/App'
import UpgradePage from '@/pages/upgrade'
import TermsPage from '@/pages/terms'
import PrivacyPage from '@/pages/privacy'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SubscriptionProvider>
          <div className="app-viewport">
            {/* Faded letter fragment — light / dark PNG swap; all viewports */}
            <div
              className="global-corner-letter pointer-events-none fixed top-0 left-0 z-0 block w-[min(60vw,20.5rem)] select-none md:left-[72px]"
              aria-hidden
            >
              <img
                src="/mobile-corner-letter.png"
                alt=""
                className="block h-auto w-full object-contain object-left-top opacity-[0.2] dark:hidden"
              />
              <img
                src="/mobile-corner-letter-dark.png"
                alt=""
                className="hidden h-auto w-full object-contain object-left-top dark:block opacity-[0.17]"
              />
            </div>

            <Routes>
              <Route path="/upgrade" element={<UpgradePage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              {/* App owns / + /settings so reading state survives settings */}
              <Route path="*" element={<App />} />
            </Routes>

            {/* Global auth modal — triggered via useAuth().openAuthModal() */}
            <AuthModal />
          </div>
        </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
