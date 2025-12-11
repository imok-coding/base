import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar.jsx';
import Home from './pages/Home.jsx';
import Manga from './pages/Manga.jsx';
import Anime from './pages/Anime.jsx';
import TCG from './pages/TCG.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import SignIn from "./pages/SignIn";

export default function App() {
  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />
        <Route path="/manga" element={<Manga />} />
        <Route path="/anime" element={<Anime />} />
        <Route path="/tcg" element={<TCG />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AuthProvider>
  );
}
