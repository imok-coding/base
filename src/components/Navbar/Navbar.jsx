import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import './Navbar.css';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { admin, user, login, logout } = useAuth();
  const location = useLocation();

  const handleLoginClick = async () => {
    const email = window.prompt('Admin email:');
    const password = window.prompt('Password:');
    if (!email || !password) return;
    try {
      await login(email.trim(), password.trim());
    } catch (err) {
      console.error(err);
      alert('Login failed: ' + (err.message || 'Unknown error'));
    }
  };

  const handleLogoutClick = async () => {
    try {
      await logout();
    } catch (err) {
      console.error(err);
    }
  };

  const closeMenu = () => setOpen(false);

  return (
    <>
      <button
        className={`menu-toggle${open ? ' active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <nav className={`menu-panel${open ? ' open' : ''}`}>
        <div className="menu-items">
          <Link to="/" className="menu-item" onClick={closeMenu} data-active={location.pathname === '/'}>
            Home
          </Link>
          <Link to="/manga" className="menu-item" onClick={closeMenu} data-active={location.pathname === '/manga'}>
            Manga
          </Link>
          <Link to="/anime" className="menu-item" onClick={closeMenu} data-active={location.pathname === '/anime'}>
            Anime
          </Link>
          <Link to="/tcg" className="menu-item" onClick={closeMenu} data-active={location.pathname === '/tcg'}>
            TCG
          </Link>
          {admin && (
            <Link
              to="/dashboard"
              className="menu-item"
              onClick={closeMenu}
              data-active={location.pathname === '/dashboard'}
            >
              Dashboard
            </Link>
          )}
        </div>

        <div className="auth-section">
          <p className="auth-section-status">
            {user ? `Signed in as ${user.email || user.uid}` : 'Not signed in'}
          </p>
          <div>
            {!user && (
              <button className="auth-btn" onClick={handleLoginClick}>
                Sign in
              </button>
            )}
            {user && (
              <button className="auth-btn secondary" onClick={handleLogoutClick}>
                Sign out
              </button>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
