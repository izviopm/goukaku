import Link from "next/link";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const tile = size === "lg" ? "size-14 text-2xl" : "size-10 text-lg";
  return (
    <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <span lang="ja" aria-hidden="true" className={`inline-flex items-center justify-center rounded-xl bg-primary font-bold text-white shadow-sm ${tile}`}>
        合
      </span>
      <span className="flex flex-col leading-tight">
        <span className={`font-bold ${size === "lg" ? "text-2xl" : "text-base"}`}>Goukaku</span>
        <span lang="ja" className="text-xs font-medium text-muted-foreground">
          合格
        </span>
      </span>
    </Link>
  );
}
