import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.PORT || 8080);
  const apiTarget = env.VITE_DEV_API_TARGET || "http://127.0.0.1:4000";
  const chatTarget = env.VITE_DEV_CHAT_TARGET || "http://127.0.0.1:8002";
  const voiceTarget = env.VITE_DEV_VOICE_TARGET || "http://127.0.0.1:8003";

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/chat": {
          target: chatTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/chat/, ""),
        },
        "/voice-api": {
          target: voiceTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/voice-api/, ""),
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port,
      strictPort: true,
    },
  };
});
