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
