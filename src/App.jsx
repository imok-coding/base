import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar.jsx';
import Home from './pages/Home.jsx';
import Manga from './pages/Manga.jsx';
import Anime from './pages/Anime.jsx';
import TCG from './pages/TCG.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Music from './pages/Music.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import SignIn from "./pages/SignIn";
import Steam from "./pages/Steam.jsx";
import Blog from "./pages/Blog.jsx";

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
        <Route path="/music" element={<Music />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/steam" element={<Steam />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AuthProvider>
  );
}
