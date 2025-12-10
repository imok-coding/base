import "./SignIn.css";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebaseConfig";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function SignIn() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Already signed in? Go home.
  if (user) {
    navigate("/");
  }

  async function googleSignIn() {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);

      // Redirect after sign in
      navigate("/");
    } catch (err) {
      console.error(err);
      alert("Google Sign-In failed.");
    }
  }

  return (
    <div className="signin-page">
      <div className="signin-card">
        <h2 className="signin-title">Welcome Back</h2>
        <p className="signin-sub">Sign in to access your dashboard & collections.</p>

        <button className="google-btn" onClick={googleSignIn}>
          <img
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt=""
            className="google-icon"
          />
          Continue with Google
        </button>

        <button className="signin-cancel" onClick={() => navigate("/")}>
          {"<"} Back to Home
        </button>
      </div>
    </div>
  );
}
