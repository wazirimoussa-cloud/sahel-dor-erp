import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "@/auth/LoginPage";
import { AuthContext } from "@/auth/AuthContext";

const signInWithPassword = vi.fn().mockResolvedValue({ error: { message: "Invalid credentials" } });
const rpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signInWithPassword: (...args: unknown[]) => signInWithPassword(...args) },
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: vi.fn() },
  },
}));

function renderLoginPage() {
  return render(
    <AuthContext.Provider
      value={{
        session: null,
        profile: null,
        loading: false,
        deactivatedMessage: null,
        clearDeactivatedMessage: vi.fn(),
        signOut: vi.fn(),
        hasAttribution: () => false,
        hasModuleAccess: () => false,
      }}
    >
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("LoginPage", () => {
  afterEach(() => {
    signInWithPassword.mockClear();
    rpc.mockClear();
  });

  it("affiche une erreur de validation si l'identifiant est vide", async () => {
    renderLoginPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Mot de passe"), "secret");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => expect(screen.getByText(/identifiant ou email requis/i)).toBeInTheDocument());
  });

  it("chemin admin (email) : erreur serveur si les identifiants sont refusés", async () => {
    renderLoginPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Identifiant ou email"), "admin@saheldor.demo");
    await user.type(screen.getByLabelText("Mot de passe"), "mauvais-mot-de-passe");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => expect(screen.getByText(/identifiants incorrects/i)).toBeInTheDocument());
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "admin@saheldor.demo", password: "mauvais-mot-de-passe" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("chemin identifiant (login) : résout l'email synthétique puis tente la connexion", async () => {
    rpc.mockResolvedValueOnce({ data: "gerant@login.saheldor.internal", error: null });
    renderLoginPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Identifiant ou email"), "gerant");
    await user.type(screen.getByLabelText("Mot de passe"), "mauvais-mot-de-passe");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => expect(screen.getByText(/identifiants incorrects/i)).toBeInTheDocument());
    expect(rpc).toHaveBeenCalledWith("resolve_login_email", { p_login: "gerant" });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "gerant@login.saheldor.internal",
      password: "mauvais-mot-de-passe",
    });
  });

  it("chemin identifiant (login) : identifiant inconnu -- erreur générique sans jamais tenter la connexion", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    renderLoginPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Identifiant ou email"), "inconnu");
    await user.type(screen.getByLabelText("Mot de passe"), "peu-importe");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => expect(screen.getByText(/identifiants incorrects/i)).toBeInTheDocument());
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
