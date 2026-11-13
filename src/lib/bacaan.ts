import "server-only";
import b101 from "@/content/bacaan/101.json";
import b402 from "@/content/bacaan/402.json";
import glossary from "@/content/bacaan/glosarium.json";

// HTML in these files is pre-sanitized at build time: only bare <p>, <em>, <strong>, <ul>, <ol>, <li>.
export type Book = { id: string; examSlug: string; title: string; chapters: { title: string; sections: { title: string; html: string }[] }[] };

export const BOOKS: Book[] = [b101, b402];
export const GLOSSARY: { term: string; category: string; definition: string }[] = glossary;

export const getBook = (id: string) => BOOKS.find((b) => b.id === id);
export const bookForExam = (slug: string) => BOOKS.find((b) => b.examSlug === slug);

/** Every subject per certification level, so the library shows what exists and what is still missing. */
export const LEVELS: { level: string; name: string; subjects: { code: string; title: string }[] }[] = [
  {
    level: "CGI",
    name: "Certificate in General Insurance",
    subjects: [
      { code: "001", title: "Prinsip Asuransi" },
      { code: "002", title: "Hukum Asuransi" },
    ],
  },
  {
    level: "AAAIK",
    name: "Ajun Ahli Asuransi Indonesia Kerugian",
    subjects: [
      { code: "101", title: "Prinsip Asuransi" },
      { code: "102", title: "Hukum Asuransi" },
      { code: "103", title: "Bisnis Asuransi & Keuangan" },
      { code: "104", title: "Asuransi Kendaraan Bermotor" },
      { code: "105", title: "Asuransi Harta Benda" },
      { code: "106", title: "Asuransi Marine Cargo" },
      { code: "107", title: "Underwriting" },
      { code: "108", title: "Asuransi Liability & Claim" },
    ],
  },
  {
    level: "AAIK",
    name: "Ahli Asuransi Indonesia Kerugian",
    subjects: [
      { code: "401", title: "Manajemen Asuransi" },
      { code: "402", title: "Manajemen Underwriting" },
      { code: "403", title: "Reasuransi" },
    ],
  },
];
