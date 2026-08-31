import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { RestaurantProvider } from './context/RestaurantContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import './styles.css';

// Restore the saved theme before first paint so dark-mode users don't get a flash
// of the light palette.
document.documentElement.setAttribute('data-theme', localStorage.getItem('sr_theme') || 'light');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <RestaurantProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </RestaurantProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
