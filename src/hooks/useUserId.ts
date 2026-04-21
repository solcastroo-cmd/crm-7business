"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function useUserId() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        localStorage.setItem("crm_userId", data.user.id);
        setUserId(data.user.id);
      } else {
        localStorage.removeItem("crm_userId");
        router.replace("/login");
      }
      setLoading(false);
    });
  }, [router]);

  return { userId, loading };
}
