import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export function useLogPageVisit() {
  const location = useLocation();

  useEffect(() => {
    void supabase.rpc("log_page_visit", { module: location.pathname });
  }, [location.pathname]);
}
