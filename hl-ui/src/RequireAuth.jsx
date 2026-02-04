import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function RequireAuth({ children }) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) return <div style={{ padding: 24 }}>Checking login…</div>;

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}
