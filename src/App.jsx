import { BrowserRouter } from 'react-router-dom';
import { useEffect } from 'react';
import { BranchProvider } from './context/BranchContext';
import { BranchMenuProvider } from './context/BranchMenuContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SeoManager } from './components/seo/SeoManager';
import { InstallAppPrompt } from './components/pwa/InstallAppPrompt';
import { SiteAlertOverlay } from './components/layout/SiteAlertOverlay';
import { AppRoutes } from './routes/AppRoutes';
import { ensurePwaInstallListeners } from './utils/pwaInstallBridge';

function PwaInstallBootstrap() {
  useEffect(() => {
    ensurePwaInstallListeners();
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <BranchProvider>
        <AuthProvider>
          <CartProvider>
            <BranchMenuProvider>
              <PwaInstallBootstrap />
              <SeoManager />
              <AppRoutes />
              <SiteAlertOverlay />
              <InstallAppPrompt />
            </BranchMenuProvider>
          </CartProvider>
        </AuthProvider>
      </BranchProvider>
    </BrowserRouter>
  );
}
