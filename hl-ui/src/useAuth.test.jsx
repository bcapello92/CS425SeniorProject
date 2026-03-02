import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./useAuth.jsx";
import { buildLoginUrl } from "./auth.jsx";

vi.mock("./auth.jsx", () => ({
  API_BASE: "http://localhost:4000",
  buildLoginUrl: vi.fn(),
  buildLogoutUrl: vi.fn(() => "https://example-cognito/logout"),
  logoutServer: vi.fn().mockResolvedValue(undefined),
}));

function TestComponent() {
  const { login } = useAuth();

  return <button onClick={() => login("/provider")}>Log in</button>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    buildLoginUrl.mockResolvedValue("https://example-cognito/login");
  });

  it("stores the redirect target and sends the user to Cognito", async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(sessionStorage.getItem("post_login_redirect")).toBe("/provider");
      expect(buildLoginUrl).toHaveBeenCalledTimes(1);
    });
  });
});
