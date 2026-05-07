"use client";

/**
 * Серая плашка, которая объясняет, почему кнопки покупки заблокированы.
 * Рендерится null если impersonation не активен — можно безопасно бросать
 * куда угодно.
 *
 *   <ImpersonationDisclaimer />              // standalone block
 *   <ImpersonationDisclaimer compact />      // inline-вариант для модалок
 */

import { useImpersonationStatus } from "../hooks/useImpersonationStatus";

type Props = {
  /** Когда true — компактный вариант для модалок и небольших мест. */
  compact?: boolean;
  className?: string;
};

export default function ImpersonationDisclaimer({ compact = false, className }: Props) {
  const status = useImpersonationStatus();
  if (!status?.active) return null;

  const target = status.targetName || status.targetEmail || "пользователем";

  if (compact) {
    return (
      <div
        className={`flex items-start gap-2 rounded-lg border border-[#EED99B] bg-[#FDF8EC] px-3 py-2 text-xs text-[#8B6F2A] ${className ?? ""}`}
        role="note"
      >
        <span className="font-semibold whitespace-nowrap">Impersonation:</span>
        <span>покупки заблокированы под {target}.</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-[#EED99B] bg-[#FDF8EC] p-4 text-[#8B6F2A] ${className ?? ""}`}
      role="note"
    >
      <p className="text-sm font-semibold mb-1">Stripe-операции отключены</p>
      <p className="text-xs leading-relaxed">
        Вы сейчас работаете в режиме impersonation под{" "}
        <span className="font-medium">{target}</span>. Покупки, оформление и смена
        тарифа недоступны. Чтобы вернуться в админку — нажмите «Вернуться» в баннере сверху.
      </p>
    </div>
  );
}
