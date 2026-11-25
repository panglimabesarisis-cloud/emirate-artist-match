import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { HomeHeader } from "@/components/home/HomeHeader";
import { getCatalog } from "@/lib/public.functions";
import { useI18n } from "@/lib/i18n";
import "@/components/home/home.css";

export function SiteHeader() {
  const { pathname } = useLocation();
  const isWorkspace = ["/dashboard", "/client", "/admin", "/chat"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return isWorkspace ? <div className="shared-site-header-absent" aria-hidden="true" /> : <PublicSiteHeader />;
}

function PublicSiteHeader() {
  const { lang } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const { data: catalog } = useQuery({ queryKey: ["catalog"], queryFn: () => getCatalog(), staleTime: 60_000 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const updateHeight = () => document.documentElement.style.setProperty("--site-header-height", `${element.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--site-header-height"); };
  }, []);
  return <div ref={ref} className="dm-home shared-site-header" dir={lang === "ar" ? "rtl" : "ltr"}>
    <HomeHeader catalog={catalog ?? { categories: [], subcategories: [], emirates: [], areas: [], eventTypes: [] }} />
  </div>;
}
