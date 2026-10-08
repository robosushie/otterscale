"use client";

import { useEffect, useState } from "react";
import type { UserCapabilities } from "@/types/roles";

export function useCapabilitiesFetch() {
  const [data, setData] = useState<UserCapabilities | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me/capabilities")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
