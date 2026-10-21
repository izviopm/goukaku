"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { History, LayoutDashboard, ShieldCheck } from "lucide-react";
import { spring } from "@/components/motion";

const base =
  "relative inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, active: path === "/" || path.startsWith("/ujian") || path.startsWith("/simulasi") },
    { href: "/riwayat", label: "History", icon: History, active: path.startsWith("/riwayat") },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck, active: path.startsWith("/admin") }] : []),
  ];
  return (
    <>
      {links.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={`${base} ${active ? "text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          {/* One pill shared across links, so it slides to the active item. */}
          {active && <motion.span layoutId="nav-pill" transition={spring} className="absolute inset-0 rounded-lg bg-primary-soft" />}
          <Icon aria-hidden="true" className="relative size-4" />
          <span className="relative">{label}</span>
        </Link>
      ))}
    </>
  );
}
