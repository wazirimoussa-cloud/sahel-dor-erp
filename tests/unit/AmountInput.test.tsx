import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AmountInput } from "@/components/ui/AmountInput";

function getInput() {
  return screen.getByRole("textbox") as HTMLInputElement;
}

describe("AmountInput", () => {
  it("groupe les milliers en tapant une valeur complète (collage)", () => {
    const onChange = vi.fn();
    render(<AmountInput value={undefined} onChange={onChange} />);
    const input = getInput();

    fireEvent.change(input, { target: { value: "1234567" } });

    expect(input.value).toBe("1 234 567");
    expect(onChange).toHaveBeenLastCalledWith(1234567);
  });

  it("repositionne le curseur après le même nombre de chiffres qu'avant reformatage", () => {
    const onChange = vi.fn();
    render(<AmountInput value={undefined} onChange={onChange} />);
    const input = getInput();

    // Frappe incrémentale, chiffre par chiffre, en simulant la position du curseur que le
    // navigateur maintiendrait réellement (toujours en fin de saisie ici). `target` porte
    // à la fois la nouvelle valeur ET la position du curseur voulue -- testing-library les
    // applique dans l'ordre, value puis selectionStart/End, donc ces derniers l'emportent.
    for (const digit of "1234567") {
      const raw = input.value.replace(/\s/g, "") + digit;
      fireEvent.change(input, { target: { value: raw, selectionStart: raw.length, selectionEnd: raw.length } });
    }

    expect(input.value).toBe("1 234 567");
    expect(input.selectionStart).toBe(input.value.length);
    expect(onChange).toHaveBeenLastCalledWith(1234567);
  });

  it("frappe séquentielle fidèle (insertion au curseur réel dans la valeur déjà formatée), y compris une virgule décimale en toute fin -- régression trouvée en vérification live", () => {
    const onChange = vi.fn();
    render(<AmountInput value={undefined} onChange={onChange} allowDecimals />);
    const input = getInput();

    // Contrairement au test précédent (qui reconstruit un flux de chiffres propre), celui-ci
    // insère chaque caractère directement DANS la valeur déjà reformatée par le composant
    // (espaces de groupement compris), exactement comme un navigateur réel le ferait --
    // c'est ce qui avait révélé le bug : la virgule décimale tapée en dernière position
    // plaçait le curseur juste AVANT elle plutôt qu'après, corrompant les chiffres suivants.
    for (const ch of "12500.5") {
      const cur = input.value;
      const pos = input.selectionStart ?? cur.length;
      const next = cur.slice(0, pos) + ch + cur.slice(pos);
      fireEvent.change(input, { target: { value: next, selectionStart: pos + 1, selectionEnd: pos + 1 } });
    }

    expect(input.value).toBe("12 500,5");
    expect(onChange).toHaveBeenLastCalledWith(12500.5);
  });

  it("supprime correctement à travers un espace de groupement (backspace)", () => {
    const onChange = vi.fn();
    render(<AmountInput value={1234} onChange={onChange} />);
    const input = getInput();
    expect(input.value).toBe("1 234"); // état initial

    // Backspace juste après l'espace de groupement ("1 |234" -> supprime l'espace).
    fireEvent.change(input, { target: { value: "1234", selectionStart: 1, selectionEnd: 1 } });

    expect(input.value).toBe("1 234");
    expect(input.selectionStart).toBe(1); // reste juste après le "1"
    expect(onChange).toHaveBeenLastCalledWith(1234);
  });

  it("accepte une partie décimale quand allowDecimals est vrai, toujours affichée avec une virgule", () => {
    const onChange = vi.fn();
    render(<AmountInput value={undefined} onChange={onChange} allowDecimals />);
    const input = getInput();

    fireEvent.change(input, { target: { value: "1234.5" } });
    expect(input.value).toBe("1 234,5");
    expect(onChange).toHaveBeenLastCalledWith(1234.5);

    fireEvent.change(input, { target: { value: "1234,56" } });
    expect(input.value).toBe("1 234,56");
    expect(onChange).toHaveBeenLastCalledWith(1234.56);
  });

  it("ignore tout séparateur décimal quand allowDecimals est faux", () => {
    const onChange = vi.fn();
    render(<AmountInput value={undefined} onChange={onChange} />);
    const input = getInput();

    // La virgule elle-même est rejetée (pas de séparateur décimal autorisé), mais les
    // chiffres de part et d'autre restent tous valides et sont concaténés.
    fireEvent.change(input, { target: { value: "1234,56" } });
    expect(input.value).toBe("123 456");
    expect(onChange).toHaveBeenLastCalledWith(123456);
  });

  it("un champ vidé remonte undefined, jamais 0", () => {
    const onChange = vi.fn();
    render(<AmountInput value={1234} onChange={onChange} />);
    const input = getInput();

    fireEvent.change(input, { target: { value: "" } });

    expect(input.value).toBe("");
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("ignore le signe '-' par défaut (allowNegative absent)", () => {
    const onChange = vi.fn();
    render(<AmountInput value={undefined} onChange={onChange} />);
    const input = getInput();

    fireEvent.change(input, { target: { value: "-1234" } });
    expect(input.value).toBe("1 234");
    expect(onChange).toHaveBeenLastCalledWith(1234);
  });

  it("accepte un nombre négatif quand allowNegative est vrai (ajustement de stock signé)", () => {
    const onChange = vi.fn();
    render(<AmountInput value={undefined} onChange={onChange} allowNegative />);
    const input = getInput();

    fireEvent.change(input, { target: { value: "-1234" } });
    expect(input.value).toBe("-1 234");
    expect(onChange).toHaveBeenLastCalledWith(-1234);
  });

  it("garde le signe affiché pendant la frappe avant le premier chiffre", () => {
    const onChange = vi.fn();
    render(<AmountInput value={undefined} onChange={onChange} allowNegative />);
    const input = getInput();

    fireEvent.change(input, { target: { value: "-", selectionStart: 1, selectionEnd: 1 } });
    expect(input.value).toBe("-");
    expect(input.selectionStart).toBe(1);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("clampe à `min` au blur si la valeur saisie est inférieure", () => {
    const onChange = vi.fn();
    render(<AmountInput value={undefined} onChange={onChange} min={100} />);
    const input = getInput();

    fireEvent.change(input, { target: { value: "50" } });
    expect(onChange).toHaveBeenLastCalledWith(50);

    fireEvent.blur(input);
    expect(input.value).toBe("100");
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("affiche correctement une valeur initiale fournie par le parent", () => {
    render(<AmountInput value={1250000} onChange={vi.fn()} />);
    expect(getInput().value).toBe("1 250 000");
  });
});
