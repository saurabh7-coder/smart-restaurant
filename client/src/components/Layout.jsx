import { useEffect, useState } from 'react';
import { formatClock } from '../utils/format.js';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useRestaurant } from '../context/RestaurantContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { Logo } from './Logo.jsx';

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('sr_theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sr_theme', theme);
  }, [theme]);

  return [theme, () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))];
}

function Navbar() {
  const { user, logout, isStaff, isAdmin } = useAuth();
  const { restaurant } = useRestaurant();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const location = useLocation();

  // Close the mobile menu whenever the route changes.
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="site-header">
      <div className="container">
        <Link to="/" className="brand" aria-label="Delicious Adda — home">
          <Logo size="md" />
        </Link>

        <button
          type="button"
          className="nav-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          ☰
        </button>

        <nav className="nav" data-open={open} aria-label="Main">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/meal-planner">Plan a meal</NavLink>
        <NavLink to="/menu">Menu</NavLink>
          <NavLink to="/reservation">Reserve</NavLink>
          <NavLink to="/about">About</NavLink>
          <NavLink to="/contact">Contact</NavLink>

          {user && <NavLink to="/my-bookings">My bookings</NavLink>}
          {user && <NavLink to="/my-orders">My orders</NavLink>}
          {isStaff && <NavLink to="/kitchen">Kitchen</NavLink>}
          {isStaff && !isAdmin && <NavLink to="/staff">Staff</NavLink>}
          {isAdmin && <NavLink to="/admin">Admin</NavLink>}

          <NavLink to="/cart" className="cart-link" aria-label={`Cart, ${count} items`}>
            🛒
            {count > 0 && <span className="cart-badge">{count > 99 ? '99+' : count}</span>}
          </NavLink>

          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title="Toggle theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>

          {user ? (
            <>
              <NavLink to="/profile">{user.name.split(' ')[0]}</NavLink>
              <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Login</NavLink>
              <Link to="/reservation" className="btn btn-sm">
                Reserve a table
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const { restaurant } = useRestaurant();

  return (
    <footer className="site-footer">
      <div className="container grid-3">
        <div>
          <Logo size="sm" className="footer-logo" />
          <p style={{ marginTop: '0.75rem' }}>{restaurant?.tagline}</p>
          <p className="faint">
            A student project demonstrating a digital menu and online table reservations.
          </p>
        </div>
        <div>
          <h4>Visit us</h4>
          <p>{restaurant?.address || '—'}</p>
          <p>
            Open daily {formatClock(restaurant?.openTime)} – {formatClock(restaurant?.closeTime)}
          </p>
        </div>
        <div>
          <h4>Contact</h4>
          <p>{restaurant?.phone}</p>
          <p>{restaurant?.email}</p>
          <div className="chip-row">
            <Link to="/menu" className="badge">
              Menu
            </Link>
            <Link to="/reservation" className="badge">
              Reservations
            </Link>
          </div>
        </div>
      </div>
      <div className="container center faint" style={{ marginTop: '1.5rem' }}>
        © {new Date().getFullYear()} {restaurant?.name || 'Delicious Adda'}. Demo data is fictional.
      </div>
    </footer>
  );
}

export function Layout() {
  return (
    <>
      <Navbar />
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
