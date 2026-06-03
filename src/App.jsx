import { BrowserRouter } from 'react-router-dom';
import { BranchProvider } from './context/BranchContext';
import { BranchMenuProvider } from './context/BranchMenuContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SeoManager } from './components/seo/SeoManager';
import { PollitoBotGate } from './components/chat/PollitoBotGate';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <BranchProvider>
        <AuthProvider>
          <CartProvider>
            <BranchMenuProvider>
              <SeoManager />
              <AppRoutes />
              <PollitoBotGate />
            </BranchMenuProvider>
          </CartProvider>
        </AuthProvider>
      </BranchProvider>
    </BrowserRouter>
  );
}
