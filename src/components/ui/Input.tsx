import { forwardRef, type InputHTMLAttributes } from "react";
import clsx from "clsx";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm",
        "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
