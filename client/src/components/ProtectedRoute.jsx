import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner } from './ui.jsx';

/**
 * Client-side route guard. This is a UX convenience only — every protected API
 * endpoint enforces the same rules server-side, because anything decided in the
 * browser can be bypassed.
 */
export function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;

  if (!user) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="container page">
        <div className="alert alert-error">
          You do not have permission to view this page. It requires: {roles.join(' or ')}.
        </div>
      </div>
    );
  }

  return children;
}
