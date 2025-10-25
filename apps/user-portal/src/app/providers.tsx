"use client";

import { TRPCReactProvider } from "@/trpc/client";
import { Toaster } from "@imaginecalendar/ui/toaster";
import type { ReactNode } from "react";

type ProviderProps = {
  children: ReactNode;
};

export function Providers({ children }: ProviderProps) {
  return (
    <TRPCReactProvider>
      {children}
      <Toaster />
    </TRPCReactProvider>
  );
}