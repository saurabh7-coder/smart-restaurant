import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';

import Home from './pages/Home.jsx';
import Menu from './pages/Menu.jsx';
import MealPlanner from './pages/MealPlanner.jsx';
import { FoodAssistant } from './components/FoodAssistant.jsx';
import Sentiment from './pages/admin/Sentiment.jsx';
import FoodDetails from './pages/FoodDetails.jsx';
import Reservation from './pages/Reservation.jsx';
import About from './pages/About.jsx';
import Contact from './pages/Contact.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Profile from './pages/Profile.jsx';
import MyBookings from './pages/MyBookings.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import MyOrders from './pages/MyOrders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import NotFound from './pages/NotFound.jsx';

import StaffBoard from './pages/staff/StaffBoard.jsx';
import KitchenBoard from './pages/staff/KitchenBoard.jsx';

import AdminLayout from './pages/admin/AdminLayout.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import MenuManage from './pages/admin/MenuManage.jsx';
import TableManage from './pages/admin/TableManage.jsx';
import ReservationManage from './pages/admin/ReservationManage.jsx';
import OrderManage from './pages/admin/OrderManage.jsx';
import CustomerManage from './pages/admin/CustomerManage.jsx';
import ReviewManage from './pages/admin/ReviewManage.jsx';
import OfferManage from './pages/admin/OfferManage.jsx';
import Reports from './pages/admin/Reports.jsx';
import Settings from './pages/admin/Settings.jsx';

export default function App() {
  return (
    <>
      <Routes>
      <Route element={<Layout />}>
        {/* public */}
        <Route path="/" element={<Home />} />
        <Route path="/meal-planner" element={<MealPlanner />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/menu/:id" element={<FoodDetails />} />
        <Route path="/reservation" element={<Reservation />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {/* The cart is browsable while logged out; checkout requires an account. */}
        <Route path="/cart" element={<Cart />} />

        {/* customer */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-bookings"
          element={
            <ProtectedRoute>
              <MyBookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/checkout"
          element={
            <ProtectedRoute>
              <Checkout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-orders"
          element={
            <ProtectedRoute>
              <MyOrders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <ProtectedRoute>
              <OrderDetail />
            </ProtectedRoute>
          }
        />

        {/* staff */}
        <Route
          path="/staff"
          element={
            <ProtectedRoute roles={['staff', 'admin']}>
              <StaffBoard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kitchen"
          element={
            <ProtectedRoute roles={['staff', 'admin']}>
              <KitchenBoard />
            </ProtectedRoute>
          }
        />

        {/* admin */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="menu" element={<MenuManage />} />
          <Route path="tables" element={<TableManage />} />
          <Route path="sentiment" element={<Sentiment />} />
          <Route path="reservations" element={<ReservationManage />} />
          <Route path="orders" element={<OrderManage />} />
          <Route path="customers" element={<CustomerManage />} />
          <Route path="reviews" element={<ReviewManage />} />
          <Route path="offers" element={<OfferManage />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
      </Routes>

      {/* Sits above every page — a guest may want to ask a question from
          anywhere, not only while looking at the menu. */}
      <FoodAssistant />
    </>
  );
}
