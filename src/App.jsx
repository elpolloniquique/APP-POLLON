import { BrowserRouter } from 'react-router-dom';
import { BranchProvider } from './context/BranchContext';
import { BranchMenuProvider } from './context/BranchMenuContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <BranchProvider>
        <AuthProvider>
          <CartProvider>
            <BranchMenuProvider>
              <AppRoutes />
            </BranchMenuProvider>
          </CartProvider>
        </AuthProvider>
      </BranchProvider>
    </BrowserRouter>
  );
}
