"use client";

import { useId, useState } from "react";
import Icon from "../Icon";

type PasswordFieldProps = {
  value: string;
  onChange: (next: string) => void;
  /** Подсказка под полем (например, "8+ characters"). */
  hint?: string;
  /** autocomplete: current-password (логин) | new-password (signup/reset). */
  autoComplete?: "current-password" | "new-password";
  placeholder?: string;
  label?: string;
  /** Минимальная длина для нативной валидации. На signup/reset = 8. */
  minLength?: number;
  disabled?: boolean;
  required?: boolean;
  onSubmit?: () => void;
};

/**
 * Input для пароля с переключателем show/hide и caps-lock-хинтом.
 * Стилистика — такая же, как у других input'ов на /auth и AuthModal.
 */
export default function PasswordField({
  value,
  onChange,
  hint,
  autoComplete = "current-password",
  placeholder = "Password",
  label = "Password",
  minLength,
  disabled,
  required = true,
  onSubmit,
}: PasswordFieldProps) {
  const id = useId();
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-sm font-medium text-[#1F2A1F] mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Caps Lock detection — на десктопе. Игнорируем модификаторы.
            const caps = (e as unknown as KeyboardEvent).getModifierState?.("CapsLock");
            if (typeof caps === "boolean") setCapsLock(caps);
            if (e.key === "Enter" && onSubmit && !disabled && value) {
              onSubmit();
            }
          }}
          onBlur={() => setCapsLock(false)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          disabled={disabled}
          className="w-full h-11 rounded-xl border border-[#ECEEE4] bg-white pl-4 pr-12 text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#8F9E4F] transition-colors disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center text-[#A8B096] hover:bg-[#FAFAF7] hover:text-[#8F9E4F] transition-colors"
          tabIndex={-1}
        >
          <Icon name={show ? "eye-off" : "eye"} size={18} />
        </button>
      </div>
      {capsLock && (
        <p className="mt-1.5 text-xs text-[#C96A5B]">Caps Lock is on</p>
      )}
      {hint && !capsLock && (
        <p className="mt-1.5 text-xs text-[#A8B096]">{hint}</p>
      )}
    </div>
  );
}
