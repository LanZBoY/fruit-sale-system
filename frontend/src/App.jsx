import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import MobileLayout from './components/MobileLayout';
import AdminLayout from './components/AdminLayout';

import Login from './pages/Login';
import NewOrder from './pages/sales/NewOrder';
import SalesProducts from './pages/sales/Products';
import MyOrders from './pages/sales/MyOrders';
import ShippingList from './pages/shipper/ShippingList';
import Dashboard from './pages/admin/Dashboard';
import AdminOrders from './pages/admin/Orders';
import AdminProducts from './pages/admin/Products';
import AdminCustomers from './pages/admin/Customers';
import Shipments from './pages/admin/Shipments';
import Users from './pages/admin/Users';

const SALES_TABS = [
  { to: '/sales/new-order', label: '建立訂單', icon: '🧾', end: true },
  { to: '/sales/products', label: '商品庫存', icon: '🍎' },
  { to: '/sales/orders', label: '我的訂單', icon: '📋' },
];

const SHIPPER_TABS = [{ to: '/shipper', label: '出貨作業', icon: '🚚', end: true }];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* 銷售組（手機） */}
      <Route element={<ProtectedRoute roles={['sales', 'admin']} />}>
        <Route element={<MobileLayout title="銷售組" tabs={SALES_TABS} />}>
          <Route path="/sales/new-order" element={<NewOrder />} />
          <Route path="/sales/products" element={<SalesProducts />} />
          <Route path="/sales/orders" element={<MyOrders />} />
        </Route>
      </Route>

      {/* 出貨組（手機） */}
      <Route element={<ProtectedRoute roles={['shipper', 'admin']} />}>
        <Route element={<MobileLayout title="出貨組" tabs={SHIPPER_TABS} />}>
          <Route path="/shipper" element={<ShippingList />} />
        </Route>
      </Route>

      {/* 管理後台（電腦） */}
      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/orders" element={<AdminOrders />} />
          <Route path="/admin/products" element={<AdminProducts />} />
          <Route path="/admin/customers" element={<AdminCustomers />} />
          <Route path="/admin/shipments" element={<Shipments />} />
          <Route path="/admin/users" element={<Users />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
