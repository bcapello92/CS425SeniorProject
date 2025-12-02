import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "react-oidc-context";

const cognitoAuthConfig = {
  // Issuer (NOT the hosted UI domain)
  authority: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_JrKoksHnH",
  client_id: "21hhbicb04v7vus5dmlpged4bo",
  redirect_uri: "http://localhost:5173/staff/callback",
  response_type: "code",       // code flow
  scope: "openid",             // keep it simple for now
};

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
