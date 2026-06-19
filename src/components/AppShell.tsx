"use client";

import { usePathname } from "next/navigation";

const NO_SHELL_PATHS = ["/login", "/pricing"];

interface AppShellProps {
  children: React.ReactNode;
  sidebar:  React.ReactNode;
  banner:   React.ReactNode;
}

export function AppShell({ children, sidebar, banner }: AppShellProps) {
  const pathname = usePathname();
  const isPublic = NO_SHELL_PATHS.some(p => pathname.startsWith(p));

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {sidebar}
      <div className="flex-1 min-w-0 flex flex-col">
        {banner}
        {children}
      </div>
    </div>
  );
}
