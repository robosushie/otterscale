"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UserCapabilities } from "@/types/roles";

const CapabilitiesContext = createContext<UserCapabilities | null>(null);

export function CapabilitiesProvider({
  value,
  children,
}: {
  value: UserCapabilities;
  children: ReactNode;
}) {
  return (
    <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>
  );
}

export function useCapabilities(): UserCapabilities {
  const ctx = useContext(CapabilitiesContext);
  if (!ctx) throw new Error("useCapabilities must be used within CapabilitiesProvider");
  return ctx;
}
