import { forwardRef, useLayoutEffect, useRef, type ChangeEvent, type FocusEvent } from "react";
import clsx from "clsx";

// Champ numérique avec séparateur de milliers affiché PENDANT la saisie (espace, même
// convention que formatNumber() -- src/lib/format.ts) : <input type="number"> refuse
// nativement tout caractère non numérique, impossible d'y afficher un espace en tapant.
// Ce composant reste donc en type="text" (inputMode adapté pour le clavier numérique
// mobile) et gère lui-même le formatage + la position du curseur.
//
// Volontairement NON contrôlé côté React (pas de prop `value` sur le <input> JSX) : la
// frappe est reformatée en écrivant directement dans le DOM (input.value +
// setSelectionRange) à l'intérieur du handler onChange, avant que React ne re-rende --
// c'est ce qui évite le classique "curseur qui saute en fin de champ" des champs
// formatés en live. La prop `value` (nombre) n'est utilisée que pour synchroniser le DOM
// quand elle change de l'EXTÉRIEUR (reset de formulaire, etc.) -- jamais en réaction à la
// propre frappe de l'utilisateur (voir lastEmitted).
//
// Utilisable directement (état simple) ou via <Controller> de react-hook-form -- register()
// seul ne permet pas d'intercepter la frappe pour la reformater.

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function parseRaw(raw: string, allowDecimals: boolean, allowNegative: boolean) {
  let intDigits = "";
  let decDigits = "";
  let hasSeparator = false;
  let seenSeparator = false;
  // Signe : uniquement s'il ouvre la saisie ("-" en tout premier caractère tapé) --
  // un "-" ailleurs dans la chaîne est ignoré (pas une soustraction, pas de sens ici).
  const isNegative = allowNegative && raw.trimStart().startsWith("-");
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      if (seenSeparator) decDigits += ch;
      else intDigits += ch;
    } else if (allowDecimals && (ch === "." || ch === ",") && !seenSeparator) {
      seenSeparator = true;
      hasSeparator = true;
    }
  }
  intDigits = intDigits.replace(/^0+(?=\d)/, "");
  return { intDigits, decDigits, hasSeparator, isNegative };
}

function buildDisplay(intDigits: string, decDigits: string, hasSeparator: boolean, isNegative: boolean): string {
  const groupedInt = intDigits.length > 0 ? groupThousands(intDigits) : "";
  // Le signe reste affiché même sans chiffre encore tapé derrière ("-" seul est un état
  // de saisie intermédiaire valide, pas juste le résultat -0).
  const sign = isNegative ? "-" : "";
  if (!hasSeparator) return sign + groupedInt;
  return `${sign}${groupedInt},${decDigits}`;
}

function toNumber(intDigits: string, decDigits: string, isNegative: boolean): number | undefined {
  if (intDigits.length === 0 && decDigits.length === 0) return undefined;
  const n = Number(`${isNegative ? "-" : ""}${intDigits || "0"}.${decDigits || "0"}`);
  return Number.isNaN(n) ? undefined : n;
}

function formatFromNumber(n: number, allowDecimals: boolean): string {
  const [intPart, decPart = ""] = String(Math.abs(n)).split(".");
  const grouped = groupThousands(intPart);
  const sign = n < 0 ? "-" : "";
  if (!allowDecimals || decPart === "") return sign + grouped;
  return `${sign}${grouped},${decPart}`;
}

function countDigitsBefore(str: string, pos: number): number {
  let count = 0;
  for (let i = 0; i < pos && i < str.length; i++) {
    if (str[i] >= "0" && str[i] <= "9") count++;
  }
  return count;
}

function cursorPositionForDigitCount(str: string, digitCount: number): number {
  // Avant le 1er chiffre : juste après un signe éventuel ("-|123"), sinon tout au début.
  if (digitCount <= 0) return str.startsWith("-") ? 1 : 0;
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] >= "0" && str[i] <= "9") {
      count++;
      if (count === digitCount) {
        const pos = i + 1;
        // Si plus aucun chiffre ne suit (on est sur le dernier chiffre tapé), le curseur
        // va en toute fin de chaîne -- après une virgule décimale tout juste tapée, par
        // exemple -- plutôt que juste avant elle. Sinon la frappe suivante s'insère au
        // mauvais endroit (bug réel trouvé en vérification live : "12500." tapé au
        // clavier finissait par corrompre les décimales suivantes). Ne s'applique QUE
        // quand il n'y a plus de chiffre après -- une édition en milieu de nombre
        // (ex. backspace à travers un espace de groupement) garde la position précise.
        return /\d/.test(str.slice(pos)) ? pos : str.length;
      }
    }
  }
  return str.length;
}

export interface AmountInputProps {
  value: number | null | undefined;
  onChange: (value: number | undefined) => void;
  onBlur?: () => void;
  /** Autorise une partie décimale (quantités au poids, ex. kg) -- par défaut false. */
  allowDecimals?: boolean;
  /** Autorise un "-" en tête de saisie (ex. ajustement de stock signé) -- par défaut false. */
  allowNegative?: boolean;
  /** Clampé au blur si la valeur saisie est inférieure -- confort, pas une validation
   * (les schémas zod de chaque formulaire restent la seule source de vérité). */
  min?: number;
  id?: string;
  name?: string;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
  disabled?: boolean;
  required?: boolean;
}

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { value, onChange, onBlur, allowDecimals = false, allowNegative = false, min, className, ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const lastEmitted = useRef<number | undefined>(undefined);

  function setRefs(node: HTMLInputElement | null) {
    innerRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }

  // Ne synchronise le DOM que si `value` a changé depuis l'EXTÉRIEUR (comparé à la
  // dernière valeur qu'on a nous-même émise) -- sinon on écraserait le curseur pendant
  // que l'utilisateur tape (le onChange ci-dessous a déjà mis input.value à jour lui-même).
  useLayoutEffect(() => {
    const normalized = value === null ? undefined : value;
    if (normalized === lastEmitted.current) return;
    lastEmitted.current = normalized;
    if (innerRef.current) {
      innerRef.current.value =
        normalized === undefined || Number.isNaN(normalized) ? "" : formatFromNumber(normalized, allowDecimals);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const raw = input.value;
    const cursorPos = input.selectionStart ?? raw.length;
    const digitsBefore = countDigitsBefore(raw, cursorPos);

    const { intDigits, decDigits, hasSeparator, isNegative } = parseRaw(raw, allowDecimals, allowNegative);
    const display = buildDisplay(intDigits, decDigits, hasSeparator, isNegative);

    input.value = display;
    const newCursor = cursorPositionForDigitCount(display, digitsBefore);
    input.setSelectionRange(newCursor, newCursor);

    const numeric = toNumber(intDigits, decDigits, isNegative);
    lastEmitted.current = numeric;
    onChange(numeric);
  }

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    if (min !== undefined && lastEmitted.current !== undefined && lastEmitted.current < min) {
      lastEmitted.current = min;
      e.currentTarget.value = formatFromNumber(min, allowDecimals);
      onChange(min);
    }
    onBlur?.();
  }

  return (
    <input
      ref={setRefs}
      type="text"
      inputMode={allowDecimals ? "decimal" : "numeric"}
      defaultValue={
        value === null || value === undefined || Number.isNaN(value) ? "" : formatFromNumber(value, allowDecimals)
      }
      onChange={handleChange}
      onBlur={handleBlur}
      className={clsx(
        "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm",
        "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        className,
      )}
      {...rest}
    />
  );
});
