import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Logo } from '../../components/Logo.jsx';

const LINKS = [
  ['', '📊', 'Dashboard'],
  ['menu', '🍔', 'Menu'],
  ['tables', '🪑', 'Tables'],
  ['reservations', '📅', 'Reservations'],
  ['orders', '🧾', 'Orders'],
  ['customers', '👥', 'Customers'],
  ['reviews', '⭐', 'Reviews'],
  ['sentiment', '📊', 'Sentiment'],
  ['offers', '🎁', 'Offers'],
  ['reports', '📈', 'Reports'],
  ['settings', '⚙️', 'Settings'],
];

export default function AdminLayout() {
  const { user } = useAuth();

  return (
    <div className="container admin-shell">
      <nav className="admin-nav" aria-label="Admin sections">
        <div className="admin-brand">
          <Logo size="sm" />
          <span className="badge badge-brand">Admin</span>
        </div>
        <p className="faint" style={{ padding: '0.25rem 0.7rem', margin: 0 }}>
          Signed in as {user.name}
        </p>
        {LINKS.map(([path, icon, label]) => (
          <NavLink key={path} to={path} end={path === ''}>
            <span aria-hidden="true">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div>
        <Outlet />
      </div>
    </div>
  );
}
