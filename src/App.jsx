import { BrowserRouter } from 'react-router-dom';
import { BranchProvider } from './context/BranchContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <BranchProvider>
        <AuthProvider>
          <CartProvider>
            <AppRoutes />
          </CartProvider>
        </AuthProvider>
      </BranchProvider>
    </BrowserRouter>
  );
}
