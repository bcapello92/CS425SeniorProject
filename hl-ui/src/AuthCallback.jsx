import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { exchangeCodeForTokens } from "./auth.jsx";

export default function AuthCallback() {
  const nav = useNavigate();
  const [msg, setMsg] = useState("Finishing sign-in…");

  useEffect(() => {
    // Prevent double-run (React 18 StrictMode dev, fast refresh, etc.)
    if (window.__auth_callback_ran) return;
    window.__auth_callback_ran = true;

    (async () => {
      try {
        const url = new URL(window.location.href);
        const params = url.searchParams;

        const code = params.get("code");
        const err = params.get("error");
        const errDesc = params.get("error_description");

        if (err) throw new Error(`${err}: ${errDesc || ""}`.trim());
        if (!code) throw new Error("Missing authorization code");

        // IMPORTANT: remove code from URL immediately so re-mounts don't re-exchange it
        params.delete("code");
        params.delete("error");
        params.delete("error_description");
        window.history.replaceState({}, document.title, url.pathname + (params.toString() ? `?${params}` : ""));

        await exchangeCodeForTokens(code);

        // Clean up PKCE verifier after success
        sessionStorage.removeItem("pkce_code_verifier");

        const next = sessionStorage.getItem("post_login_redirect") || "/provider";
        sessionStorage.removeItem("post_login_redirect");

        nav(next, { replace: true });
      } catch (e) {
        console.error("[AuthCallback] failed:", e);
        setMsg("Login failed: " + (e?.message || String(e)));
      }
    })();
  }, [nav]);

  return <div style={{ padding: 16 }}>{msg}</div>;
}
