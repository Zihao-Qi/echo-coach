import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { PUBLIC_DEMO_BUILD } from "../infrastructure/config/public-demo";

export function PracticeHeader({
  page,
  disabled,
  onNavigate,
  children,
  keyMode = false,
}: {
  page: "home" | "practice" | "mock";
  disabled?: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
  children?: ReactNode;
  keyMode?: boolean;
}) {
  const links = [
    ["home", "/", "Home"],
    ["practice", "/practice", "Practice"],
    ["mock", "/mock-interview", "Mock interview"],
    ...(!PUBLIC_DEMO_BUILD && page !== "mock" ? [["legacy", "/legacy", "Original voice demo"]] : []),
  ];
  const guard = {
    "aria-disabled": disabled,
    tabIndex: disabled ? -1 : undefined,
    onClick: onNavigate,
  };
  return (
    <header className="flex flex-col items-start gap-x-3 rounded-2xl border border-line bg-card px-4 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
      <div className="flex items-center gap-3">
        <Link
          className={`inline-flex items-center font-display text-xl tracking-tight${keyMode ? " key-mode-brand" : ""}`}
          href="/"
          aria-label="echocoach"
          {...guard}
        >
          <strong className="font-extrabold">echo</strong>
          <span className="font-normal text-muted">coach</span>
        </Link>
        {PUBLIC_DEMO_BUILD && (
          <span className="rounded-md bg-pebble px-2 py-1 text-xs font-semibold text-muted">
            Public demo
          </span>
        )}
      </div>
      <nav
        aria-label="Main navigation"
        className={`flex flex-wrap items-center ${keyMode ? "gap-2" : "-ml-2 sm:ml-0"}`}
      >
        {links
          .filter(([id]) => id !== page)
          .map(([id, href, label]) => (
            <Link
              key={id}
              className="nav-link px-2 text-xs sm:px-3 sm:text-sm"
              href={href}
              {...guard}
            >
              {label}
            </Link>
          ))}
        {children}
      </nav>
    </header>
  );
}
