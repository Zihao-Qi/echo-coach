import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { PUBLIC_DEMO_BUILD } from "../infrastructure/config/public-demo";

export function PracticeHeader({
  page,
  disabled,
  onNavigate,
  children,
}: {
  page: "home" | "practice" | "mock";
  disabled?: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
  children?: ReactNode;
}) {
  const links = [
    ["home", "/", "Home"],
    ["practice", "/practice", "Practice"],
    ...(!PUBLIC_DEMO_BUILD
      ? [
          ["mock", "/mock-interview", "Mock interview"],
          ...(page !== "mock"
            ? [["legacy", "/legacy", "Original voice demo"]]
            : []),
        ]
      : []),
  ];
  const guard = {
    "aria-disabled": disabled,
    tabIndex: disabled ? -1 : undefined,
    onClick: onNavigate,
  };
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 border-b border-line pb-3">
      <div className="flex items-center gap-3">
        <Link
          className="inline-flex items-center font-display text-2xl font-extrabold tracking-tight"
          href="/"
          {...guard}
        >
          echocoach
        </Link>
        {PUBLIC_DEMO_BUILD && (
          <span className="rounded-md bg-pebble px-2 py-1 text-xs font-semibold text-muted">
            Public demo
          </span>
        )}
      </div>
      <nav aria-label="Main navigation" className="flex flex-wrap items-center">
        {links
          .filter(([id]) => id !== page)
          .map(([id, href, label]) => (
            <Link key={id} className="nav-link" href={href} {...guard}>
              {label}
            </Link>
          ))}
        {children}
      </nav>
    </header>
  );
}
