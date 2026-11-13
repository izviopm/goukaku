import { Card, Hero } from "@/components/ui";
import { GLOSSARY } from "@/lib/bacaan";

export default function GlossaryPage() {
  return (
    <>
      <Hero eyebrow="Reading" title="Glossary">
        {GLOSSARY.length} insurance terms, A to Z. Use your browser&apos;s find (Ctrl+F) to jump to a term.
      </Hero>
      <Card>
        <dl className="flex flex-col divide-y">
          {GLOSSARY.map((t) => (
            <div key={t.term} className="flex flex-col gap-1 py-3">
              <dt className="flex flex-wrap items-baseline gap-2 font-semibold">
                {t.term} <span className="text-xs font-normal text-muted-foreground">{t.category}</span>
              </dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{t.definition}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
