"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({
  onClose,
  children,
  title,
  size = "md",
}: {
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  size?: "md" | "lg";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="frost-backdrop animate-fade-in fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className={`frost animate-pop w-full overflow-hidden rounded-[28px] ${
          size === "lg" ? "max-w-2xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-muted transition hover:bg-black/5 hover:text-ink focus-ring dark:hover:bg-white/10"
            aria-label="Lukk"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-5 pb-5 pt-2">{children}</div>
      </div>
    </div>
  );
}
