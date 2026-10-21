import Link from "next/link";
import { LogOut } from "lucide-react";
import { getUser } from "@/lib/auth";
import { signOut } from "./actions";

const navLink =
  "rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-baseline gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="text-xl font-bold text-primary" lang="ja">
              合格
            </span>
            <span className="font-bold">Goukaku</span>
          </Link>
          <nav aria-label="Navigasi utama" className="flex flex-1 flex-wrap items-center gap-1">
            <Link href="/" className={navLink}>
              Dashboard
            </Link>
            <Link href="/riwayat" className={navLink}>
              Riwayat
            </Link>
            {user.isAdmin && (
              <Link href="/admin" className={navLink}>
                Admin
              </Link>
            )}
          </nav>
          <Link href="/akun" className={`${navLink} hidden sm:inline`}>
            {user.email}
          </Link>
          <Link href="/akun" className={`${navLink} sm:hidden`}>
            Akun
          </Link>
          <form action={signOut}>
            <button type="submit" className={`${navLink} inline-flex min-h-11 items-center gap-1 cursor-pointer`}>
              <LogOut aria-hidden="true" className="size-4" />
              Keluar
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">{children}</main>
    </>
  );
}
