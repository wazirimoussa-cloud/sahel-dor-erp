import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "@/auth/LoginPage";
import { AuthContext } from "@/auth/AuthContext";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: { message: "Invalid credentials" } }),
    },
  },
}));

function renderLoginPage() {
  return render(
    <AuthContext.Provider value={{ session: null, profile: null, loading: false, signOut: vi.fn() }}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("LoginPage", () => {
  it("affiche une erreur de validation si l'email est invalide", async () => {
    renderLoginPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "pas-un-email");
    await user.type(screen.getByLabelText("Mot de passe"), "secret");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => expect(screen.getByText(/adresse email invalide/i)).toBeInTheDocument());
  });

  it("affiche une erreur serveur si les identifiants sont refusés", async () => {
    renderLoginPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "admin@saheldor.demo");
    await user.type(screen.getByLabelText("Mot de passe"), "mauvais-mot-de-passe");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() =>
      expect(screen.getByText(/identifiants incorrects/i)).toBeInTheDocument(),
    );
  });
});
