import { useEffect } from "react";
import { buildLoginUrl } from "./auth.jsx";

export default function LoginRedirect() {
  useEffect(() => {
    (async () => {
      const url = await buildLoginUrl();
      window.location.assign(url);
    })();
  }, []);

  return <div style={{ padding: 16 }}>Redirecting to login…</div>;
}
