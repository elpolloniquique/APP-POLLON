import { Routes, Route, Navigate } from 'react-router-dom';
import { Home } from '../pages/Home';
import { Store } from '../pages/Store';
import { BranchSelector } from '../pages/BranchSelector';
import { Checkout } from '../pages/Checkout';
import { OrderSuccess } from '../pages/OrderSuccess';
import { AdminLogin } from '../pages/AdminLogin';
import { AdminLayout } from '../components/admin/AdminLayout';
import { AdminOrders } from '../pages/admin/AdminOrders';
import { AdminMenu } from '../pages/admin/AdminMenu';
import { AdminBranches } from '../pages/admin/AdminBranches';
import { AdminCash } from '../pages/admin/AdminCash';
import { AdminInventory } from '../pages/admin/AdminInventory';
import { AdminReports } from '../pages/admin/AdminReports';
import { AdminConfig } from '../pages/admin/AdminConfig';
import { AdminCustomers } from '../pages/admin/AdminCustomers';
import { AdminCampaigns } from '../pages/admin/AdminCampaigns';
import { KitchenScreen } from '../pages/admin/KitchenScreen';
import { ProtectedRoute, AdminHome } from '../components/admin/ProtectedRoute';
import { CustomerRoute } from '../components/auth/CustomerRoute';
import { AccountLayout } from '../pages/account/AccountLayout';
import { AccountProfile } from '../pages/account/AccountProfile';
import { AccountOrders } from '../pages/account/AccountOrders';
import { AccountAddresses } from '../pages/account/AccountAddresses';
import { OrderTracking } from '../pages/account/OrderTracking';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/tienda" element={<Store />} />
      <Route path="/sucursal" element={<BranchSelector />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/pedido/:id" element={<OrderSuccess />} />

      <Route
        path="/cuenta"
        element={(
          <CustomerRoute>
            <AccountLayout />
          </CustomerRoute>
        )}
      >
        <Route index element={<AccountProfile />} />
        <Route path="pedidos" element={<AccountOrders />} />
        <Route path="direcciones" element={<AccountAddresses />} />
        <Route path="seguimiento/:orderId" element={<OrderTracking />} />
      </Route>

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={(
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        )}
      >
        <Route index element={<AdminHome />} />
        <Route path="pedidos" element={<ProtectedRoute perm="orders"><AdminOrders /></ProtectedRoute>} />
        <Route path="cocina" element={<ProtectedRoute perm="kitchen"><KitchenScreen /></ProtectedRoute>} />
        <Route path="menu" element={<ProtectedRoute perm="menu"><AdminMenu /></ProtectedRoute>} />
        <Route path="clientes" element={<ProtectedRoute perm="customers"><AdminCustomers /></ProtectedRoute>} />
        <Route path="campanas" element={<ProtectedRoute perm="campaigns"><AdminCampaigns /></ProtectedRoute>} />
        <Route path="sucursales" element={<ProtectedRoute perm="branches"><AdminBranches /></ProtectedRoute>} />
        <Route path="caja" element={<ProtectedRoute perm="cash"><AdminCash /></ProtectedRoute>} />
        <Route path="stock" element={<ProtectedRoute perm="inventory"><AdminInventory /></ProtectedRoute>} />
        <Route path="reportes" element={<ProtectedRoute perm="reports"><AdminReports /></ProtectedRoute>} />
        <Route path="config" element={<ProtectedRoute perm="settings"><AdminConfig /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
