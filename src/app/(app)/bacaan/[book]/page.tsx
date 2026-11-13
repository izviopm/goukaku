import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, ListTree, Play } from "lucide-react";
import { Card, Hero, LinkButton, ProgressBar } from "@/components/ui";
import { getBook } from "@/lib/bacaan";

export default async function BookPage({ params, searchParams }: { params: Promise<{ book: string }>; searchParams: Promise<{ bab?: string; sub?: string }> }) {
  const [{ book: id }, sp] = await Promise.all([params, searchParams]);
  const book = getBook(id);
  if (!book) notFound();

  const flat = book.chapters.flatMap((c, ci) => c.sections.map((s, si) => ({ ci, si, chapter: c.title, ...s })));
  const ci = Number(sp.bab ?? 0);
  const si = Number(sp.sub ?? 0);
  const at = Math.max(0, flat.findIndex((x) => x.ci === ci && x.si === si));
  const cur = flat[at];
  const href = (i: number) => `/bacaan/${book.id}?bab=${flat[i].ci}&sub=${flat[i].si}`;

  return (
    <>
      <Hero
        eyebrow={`${book.examSlug.replace("-", " ").toUpperCase()}`}
        title={book.title}
        actions={
          <LinkButton href={`/ujian/${book.examSlug}`} variant="accent">
            <Play aria-hidden="true" className="size-4" /> Practice this module
          </LinkButton>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card className="h-fit p-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <details open className="group">
            <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-medium lg:pointer-events-none">
              <ListTree aria-hidden="true" className="size-4 text-primary" /> Contents
            </summary>
            <nav aria-label="Contents" className="flex flex-col gap-1 border-t p-2 text-sm">
              {book.chapters.map((c, i) => (
                <details key={c.title} open={i === cur.ci}>
                  <summary className="cursor-pointer rounded-lg px-2 py-2 font-medium hover:bg-muted">{c.title}</summary>
                  <ul className="mb-2 flex flex-col">
                    {c.sections.map((s, j) => {
                      const active = i === cur.ci && j === cur.si;
                      return (
                        <li key={j}>
                          <Link
                            href={`/bacaan/${book.id}?bab=${i}&sub=${j}`}
                            aria-current={active ? "page" : undefined}
                            className={`block rounded-lg py-1.5 pl-5 pr-2 ${active ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                          >
                            {s.title}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ))}
            </nav>
          </details>
        </Card>

        <Card className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {cur.chapter} · {at + 1} of {flat.length}
            </p>
            <ProgressBar value={(100 * (at + 1)) / flat.length} />
            <h2 className="text-xl font-bold">{cur.title}</h2>
          </div>
          <article
            className="max-w-prose leading-relaxed [&_li]:mb-1 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_strong]:font-semibold [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6"
            // Pre-sanitized at build time (see src/lib/bacaan.ts).
            dangerouslySetInnerHTML={{ __html: cur.html }}
          />
          <nav aria-label="Section" className="flex flex-wrap justify-between gap-2 border-t pt-4">
            {at > 0 ? (
              <LinkButton href={href(at - 1)} variant="outline">
                <ChevronLeft aria-hidden="true" className="size-4" /> Previous
              </LinkButton>
            ) : (
              <span />
            )}
            {at < flat.length - 1 && (
              <LinkButton href={href(at + 1)} variant="primary">
                Next <ChevronRight aria-hidden="true" className="size-4" />
              </LinkButton>
            )}
          </nav>
        </Card>
      </div>
    </>
  );
}
