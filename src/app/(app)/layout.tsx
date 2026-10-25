import { Suspense } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import { getUser } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";
import { WelcomeToast } from "./welcome-toast";

const navLink =
  "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <>
      <header className="relative overflow-hidden border-b bg-card">
        <div aria-hidden="true" className="pattern-seigaiha absolute inset-0 text-primary" />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Logo />
          <nav aria-label="Main" className="order-last flex w-full flex-wrap items-center gap-1 sm:order-none sm:w-auto sm:flex-1">
            <NavLinks isAdmin={user.isAdmin} />
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:ml-0">
            <Link href="/akun" className={`${navLink} pl-1.5`} aria-label="My profile">
              <span aria-hidden="true">
                <Avatar path={user.avatarPath} gender={user.gender} size="sm" />
              </span>
              <span className="hidden max-w-48 truncate md:inline">{user.name ?? user.email}</span>
            </Link>
            <SignOutButton className={navLink} />
          </div>
        </div>
      </header>
      <Suspense>
        <WelcomeToast name={user.name ?? user.email} />
      </Suspense>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">{children}</main>
    </>
  );
}
