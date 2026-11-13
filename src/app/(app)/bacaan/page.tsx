import Link from "next/link";
import { BookOpen, BookText, ChevronRight, Hourglass } from "lucide-react";
import { Badge, Card, Hero, IconTile, SectionTitle } from "@/components/ui";
import { getBook, GLOSSARY, LEVELS } from "@/lib/bacaan";
import { createAdminClient } from "@/lib/supabase/server";

const cardLink = "group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function ReadingPage() {
  // Which subjects already have a question bank, so a subject without a book can still link to practice.
  const { data } = await createAdminClient().from("exam_catalog").select("slug");
  const exams = new Set((data ?? []).map((c) => c.slug as string));

  return (
    <>
      <Hero eyebrow="Reading" title="Study modules">
        Pick your level and subject, read the material chapter by chapter, then practice it on the matching exam.
      </Hero>

      {LEVELS.map((l) => (
        <section key={l.level} aria-labelledby={`level-${l.level}`} className="flex flex-col">
          <SectionTitle icon={BookOpen} aside={<span className="text-sm text-muted-foreground">{l.subjects.filter((s) => getBook(s.code)).length} of {l.subjects.length} with reading</span>}>
            <span id={`level-${l.level}`}>
              {l.level} <span className="font-normal text-muted-foreground">· {l.name}</span>
            </span>
          </SectionTitle>
          <ul className="grid gap-4 sm:grid-cols-2">
            {l.subjects.map((s) => {
              const book = getBook(s.code);
              const slug = `${l.level.toLowerCase()}-${s.code}`;
              const href = book ? `/bacaan/${book.id}` : exams.has(slug) ? `/ujian/${slug}` : null;
              const card = (
                <Card className={`flex h-full items-center gap-4 ${href ? "transition-colors group-hover:border-primary/40" : "opacity-60"}`}>
                  <IconTile icon={book ? BookOpen : Hourglass} tone={book ? "primary" : "accent"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted-foreground">
                      {l.level} {s.code}
                    </p>
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {book
                        ? `${book.chapters.length} chapters · ${book.chapters.reduce((n, c) => n + c.sections.length, 0)} sections`
                        : href
                          ? "No reading yet · practice questions available"
                          : "Not available yet"}
                    </p>
                  </div>
                  {book ? <Badge>Read</Badge> : href ? <Badge tone="accent">Practice</Badge> : null}
                  {href && <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />}
                </Card>
              );
              return (
                <li key={s.code}>
                  {href ? (
                    <Link href={href} className={cardLink}>
                      {card}
                    </Link>
                  ) : (
                    card
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section aria-labelledby="reference-title" className="flex flex-col">
        <SectionTitle icon={BookText}>
          <span id="reference-title">Reference</span>
        </SectionTitle>
        <Link href="/bacaan/glosarium" className={`${cardLink} sm:max-w-md`}>
          <Card className="flex h-full items-center gap-4 transition-colors group-hover:border-primary/40">
            <IconTile icon={BookText} tone="accent" />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">Glossary</h3>
              <p className="text-sm text-muted-foreground">{GLOSSARY.length} insurance terms</p>
            </div>
            <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
          </Card>
        </Link>
      </section>
    </>
  );
}
