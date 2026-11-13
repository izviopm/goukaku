import Link from "next/link";
import { BookOpen, BookText, ChevronRight } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { Card, Hero, IconTile } from "@/components/ui";
import { BOOKS, GLOSSARY } from "@/lib/bacaan";

export default function ReadingPage() {
  return (
    <>
      <Hero eyebrow="Reading" title="Study modules">
        Read the material chapter by chapter, then practice it on the matching exam.
      </Hero>
      <Stagger as="ul" className="grid gap-4 sm:grid-cols-2">
        {BOOKS.map((b) => (
          <StaggerItem as="li" key={b.id}>
            <Link href={`/bacaan/${b.id}`} className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="flex h-full items-center gap-4 transition-colors group-hover:border-primary/40">
                <IconTile icon={BookOpen} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground">Module {b.id}</p>
                  <h2 className="font-semibold">{b.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {b.chapters.length} chapters · {b.chapters.reduce((n, c) => n + c.sections.length, 0)} sections
                  </p>
                </div>
                <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
              </Card>
            </Link>
          </StaggerItem>
        ))}
        <StaggerItem as="li">
          <Link href="/bacaan/glosarium" className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="flex h-full items-center gap-4 transition-colors group-hover:border-primary/40">
              <IconTile icon={BookText} tone="accent" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">Reference</p>
                <h2 className="font-semibold">Glossary</h2>
                <p className="text-sm text-muted-foreground">{GLOSSARY.length} insurance terms</p>
              </div>
              <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
            </Card>
          </Link>
        </StaggerItem>
      </Stagger>
    </>
  );
}
