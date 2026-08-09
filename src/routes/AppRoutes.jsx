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
import { AdminUsers } from '../pages/admin/AdminUsers';
import { AdminWhatsApp } from '../pages/admin/AdminWhatsApp';
import { PollonBotLayout } from '../pages/admin/pollon-bot/PollonBotLayout';
import { BotDashboard } from '../pages/admin/pollon-bot/BotDashboard';
import { BotInbox } from '../pages/admin/pollon-bot/BotInbox';
import { BotMemoria } from '../pages/admin/pollon-bot/BotMemoria';
import { BotUnanswered } from '../pages/admin/pollon-bot/BotUnanswered';
import { BotDocuments } from '../pages/admin/pollon-bot/BotDocuments';
import { BotSynonyms } from '../pages/admin/pollon-bot/BotSynonyms';
import { BotIntents } from '../pages/admin/pollon-bot/BotIntents';
import { BotConfig } from '../pages/admin/pollon-bot/BotConfig';
import { BotEvents } from '../pages/admin/pollon-bot/BotEvents';
import { BotLogs } from '../pages/admin/pollon-bot/BotLogs';
import { BotSimulate } from '../pages/admin/pollon-bot/BotSimulate';
import { AdminConfig } from '../pages/admin/AdminConfig';
import { AdminCustomers } from '../pages/admin/AdminCustomers';
import { AdminCampaigns } from '../pages/admin/AdminCampaigns';
import { KitchenScreen } from '../pages/admin/KitchenScreen';
import { AdminDrivers } from '../pages/admin/AdminDrivers';
import { AdminDriverConfig } from '../pages/admin/AdminDriverConfig';
import { AdminDriverRates } from '../pages/admin/AdminDriverRates';
import { AdminDispatch } from '../pages/admin/AdminDispatch';
import { AdminLiveMap } from '../pages/admin/AdminLiveMap';
import { AdminDriverReports } from '../pages/admin/AdminDriverReports';
import { ProtectedRoute, AdminHome } from '../components/admin/ProtectedRoute';
import { CustomerRoute } from '../components/auth/CustomerRoute';
import { DriverRoute } from '../components/delivery/DriverRoute';
import { DriverLayout } from '../components/delivery/DriverLayout';
import { DriverErrorBoundary } from '../components/delivery/DriverErrorBoundary';
import { DriverHome } from '../pages/driver/DriverHome';
import { DriverMapPage } from '../pages/driver/DriverMapPage';
import { DriverHistory } from '../pages/driver/DriverHistory';
import { DriverEarnings } from '../pages/driver/DriverEarnings';
import { DriverProfile } from '../pages/driver/DriverProfile';
import { AccountLayout } from '../pages/account/AccountLayout';
import { AccountProfile } from '../pages/account/AccountProfile';
import { AccountOrders } from '../pages/account/AccountOrders';
import { AccountAddresses } from '../pages/account/AccountAddresses';
import { OrderTracking } from '../pages/account/OrderTracking';
import { TermsConditions } from '../pages/TermsConditions';
import { ComplaintsBook } from '../pages/ComplaintsBook';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/tienda" element={<Store />} />
      <Route path="/sucursal" element={<BranchSelector />} />
      <Route path="/terminos" element={<TermsConditions />} />
      <Route path="/libro-reclamaciones" element={<ComplaintsBook />} />
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

      {/* App repartidor (PWA mobile-first) */}
      <Route
        path="/repartidor"
        element={(
          <DriverRoute>
            <DriverErrorBoundary>
              <DriverLayout />
            </DriverErrorBoundary>
          </DriverRoute>
        )}
      >
        <Route index element={<DriverHome />} />
        <Route path="mapa" element={<DriverMapPage />} />
        <Route path="historial" element={<DriverHistory />} />
        <Route path="ingresos" element={<DriverEarnings />} />
        <Route path="perfil" element={<DriverProfile />} />
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
        <Route path="usuarios" element={<ProtectedRoute perm="users"><AdminUsers /></ProtectedRoute>} />
        <Route path="whatsapp" element={<ProtectedRoute perm="whatsapp_ai"><PollonBotLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<BotDashboard />} />
          <Route path="inbox" element={<BotInbox />} />
          <Route path="memoria" element={<BotMemoria />} />
          <Route path="sin-respuesta" element={<BotUnanswered />} />
          <Route path="documentos" element={<BotDocuments />} />
          <Route path="sinonimos" element={<BotSynonyms />} />
          <Route path="intenciones" element={<BotIntents />} />
          <Route path="config" element={<BotConfig />} />
          <Route path="eventos" element={<BotEvents />} />
          <Route path="logs" element={<BotLogs />} />
          <Route path="probar" element={<BotSimulate />} />
          <Route path="conexion" element={<AdminWhatsApp />} />
        </Route>
        <Route path="config" element={<ProtectedRoute perm="settings"><AdminConfig /></ProtectedRoute>} />

        {/* Módulo delivery GPS — aditivo */}
        <Route path="repartidores" element={<ProtectedRoute perm="drivers"><AdminDrivers /></ProtectedRoute>} />
        <Route path="repartidores/config" element={<ProtectedRoute perm="driver_config"><AdminDriverConfig /></ProtectedRoute>} />
        <Route path="repartidores/tarifas" element={<ProtectedRoute perm="driver_rates"><AdminDriverRates /></ProtectedRoute>} />
        <Route path="repartidores/despacho" element={<ProtectedRoute perm="dispatch"><AdminDispatch /></ProtectedRoute>} />
        <Route path="repartidores/en-vivo" element={<ProtectedRoute perm="live_map"><AdminLiveMap /></ProtectedRoute>} />
        <Route path="repartidores/reportes" element={<ProtectedRoute perm="driver_reports"><AdminDriverReports /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
