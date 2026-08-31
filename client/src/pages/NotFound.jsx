import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="container page">
      <EmptyState
        emoji="🍽️"
        title="Page not found"
        action={
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link to="/" className="btn">
              Go home
            </Link>
            <Link to="/menu" className="btn btn-ghost">
              Browse the menu
            </Link>
          </div>
        }
      >
        That page is not on the menu.
      </EmptyState>
    </div>
  );
}
