"use client";

import { useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { ArrowDown, CircleCheck, FileSpreadsheet, FileText, Library, Pause, Play, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { AnimatedBar, easeOut, spring } from "@/components/motion";
import { AiAvatar } from "@/components/ui";

// Step length in seconds. The tour plays once and stops (UI_RULES 8: no endless loops).
const DURATION = 4.5;

const appear = (delay: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { ...easeOut, delay },
});

function CreateVisual() {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">Exam name</span>
      <div className="flex h-11 items-center rounded-lg border px-3">
        {"CGI".split("").map((c, i) => (
          <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.25 }}>
            {c}
          </motion.span>
        ))}
        <motion.span className="ml-0.5 h-5 w-0.5 bg-primary" animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: 3, repeatType: "reverse" }} />
      </div>
      <motion.div
        className="rounded-lg bg-primary py-2.5 text-center text-sm font-medium text-white"
        animate={{ scale: [1, 0.95, 1] }}
        transition={{ delay: 1.3, duration: 0.3 }}
      >
        Create exam
      </motion.div>
      <motion.p {...appear(1.8)} className="flex items-center gap-2 rounded-lg bg-primary-soft p-2.5 text-sm font-medium text-primary">
        <CircleCheck aria-hidden="true" className="size-4" /> CGI is ready. Shared with everyone studying it.
      </motion.p>
    </div>
  );
}

function AddVisual() {
  const sources = [
    { icon: FileSpreadsheet, label: "CSV with answers", cls: "bg-primary-soft text-primary" },
    { icon: FileText, label: "PDF without answers", cls: "bg-accent-soft text-accent-foreground" },
    { icon: Sparkles, label: "Ask the AI", cls: "bg-ai-soft text-ai" },
  ];
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        {sources.map(({ icon: Icon, label, cls }, i) => (
          <motion.span key={label} {...appear(0.2 + i * 0.25)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${cls}`}>
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
          </motion.span>
        ))}
      </div>
      <motion.span initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: [0, 4, 0] }} transition={{ delay: 1, duration: 0.6 }}>
        <ArrowDown aria-hidden="true" className="size-5 text-muted-foreground" />
      </motion.span>
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring, delay: 1.3 }}
        className="flex w-full items-center gap-3 rounded-xl border bg-muted/60 p-3"
      >
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary text-white">
          <Library aria-hidden="true" className="size-5" />
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-semibold">Question bank</span>
          <span className="text-sm text-muted-foreground">
            <CountUp to={60} delay={1.4} /> questions, no duplicates
          </span>
        </span>
      </motion.div>
    </div>
  );
}

function VerifyVisual() {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border p-3 text-sm">
        <p className="font-medium">Which port does HTTPS use by default?</p>
        <p className="mt-1 text-muted-foreground">Key from the bank: B. 443</p>
      </div>
      {["Model 1", "Model 2"].map((m, i) => (
        <motion.div key={m} {...appear(0.4 + i * 0.6)} className="flex items-center gap-3 rounded-lg bg-ai-soft p-2.5 text-sm">
          <AiAvatar size="sm" />
          <span className="flex-1">
            {m} answers <span className="font-semibold">B</span> without seeing the key
          </span>
          <CircleCheck aria-hidden="true" className="size-4 text-success" />
        </motion.div>
      ))}
      <motion.span
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring, delay: 1.8 }}
        className="inline-flex items-center gap-1.5 self-start rounded-full bg-success/10 px-3 py-1.5 text-sm font-semibold text-success"
      >
        <ShieldCheck aria-hidden="true" className="size-4" /> Verified, ready for practice
      </motion.span>
    </div>
  );
}

function PracticeVisual() {
  const options = ["80", "443", "21", "25"];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Which port does HTTPS use by default?</p>
      {options.map((o, i) => (
        <div key={o} className="relative flex items-center gap-2 overflow-hidden rounded-lg border px-3 py-2 text-sm">
          {i === 1 && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 border-l-4 border-success bg-success/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.25 }}
            />
          )}
          <span className="relative inline-flex size-6 items-center justify-center rounded-md bg-muted text-xs font-semibold">{"ABCD"[i]}</span>
          <span className="relative">{o}</span>
        </div>
      ))}
      <motion.p {...appear(1.4)} className="flex items-center gap-2 rounded-lg bg-success/10 p-2.5 text-sm font-semibold text-success">
        <CircleCheck aria-hidden="true" className="size-4" /> Correct. HTTPS uses port 443.
      </motion.p>
    </div>
  );
}

function ReviewVisual() {
  const topics = [
    { name: "Security", pct: 90, cls: "bg-primary" },
    { name: "Cloud basics", pct: 75, cls: "bg-primary" },
    { name: "Networking", pct: 45, cls: "bg-accent" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <span className="text-sm text-muted-foreground">Practice score</span>
        <span className="text-4xl font-bold tabular-nums text-primary">
          <CountUp to={82} delay={0.2} />
        </span>
      </div>
      {topics.map((t) => (
        <div key={t.name} className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span>{t.name}</span>
            <span className="tabular-nums text-muted-foreground">{t.pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <AnimatedBar value={t.pct} className={t.cls} />
          </div>
        </div>
      ))}
      <motion.p {...appear(1.3)} className="rounded-lg bg-accent-soft p-2.5 text-sm text-accent-foreground">
        <span className="font-semibold">Weak topic:</span> Networking. Practice it next.
      </motion.p>
    </div>
  );
}

function CountUp({ to, delay = 0 }: { to: number; delay?: number }) {
  const value = useMotionValue(0);
  const rounded = useTransform(value, (v) => Math.round(v));
  useEffect(() => {
    const controls = animate(value, to, { duration: 1.1, delay, ease: "easeOut" });
    return () => controls.stop();
  }, [value, to, delay]);
  return <motion.span>{rounded}</motion.span>;
}

const STEPS = [
  { title: "Create an exam", text: "Type the certification you are studying for. The same name always opens the same shared question bank.", Visual: CreateVisual },
  { title: "Add questions", text: "Upload a CSV, drop in a PDF without answers, or ask the AI. Duplicates are skipped automatically.", Visual: AddVisual },
  { title: "AI checks every answer key", text: "Two different AI models answer each question without seeing the key. Only questions they agree on are used.", Visual: VerifyVisual },
  { title: "Practice like the real exam", text: "Pick how many questions and whether you want feedback after each answer or only at the end.", Visual: PracticeVisual },
  { title: "Review and improve", text: "Every run is saved. See your score per topic and which topics to practice next.", Visual: ReviewVisual },
];

export function HowItWorks() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  // On phones the tour sits below the form; only advance while it is actually on screen.
  const inView = useInView(ref, { amount: 0.4 });
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const auto = playing && !reduce && inView;
  const last = step === STEPS.length - 1;
  const { title, text, Visual } = STEPS[step];

  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => (last ? setPlaying(false) : setStep((s) => s + 1)), DURATION * 1000);
    return () => clearTimeout(t);
  }, [auto, last, step]);

  const control = playing && !last
    ? { label: "Pause tour", icon: Pause, run: () => setPlaying(false) }
    : last && !reduce
      ? {
          label: "Replay tour",
          icon: RotateCcw,
          run: () => {
            setStep(0);
            setPlaying(true);
          },
        }
      : { label: "Play tour", icon: Play, run: () => setPlaying(true) };

  return (
    <section ref={ref} aria-labelledby="tour-title" className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tour-title" className="text-xl font-semibold">
          How Goukaku works
        </h2>
        {!reduce && (
          <button
            type="button"
            onClick={control.run}
            aria-label={control.label}
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/15 transition-colors duration-150 hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            <control.icon aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>

      <ol className="grid grid-cols-5 gap-2">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => {
                setStep(i);
                setPlaying(false);
              }}
              aria-current={i === step ? "step" : undefined}
              aria-label={`Step ${i + 1}: ${s.title}`}
              className="flex min-h-11 w-full cursor-pointer flex-col items-center gap-1.5 rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span
                className={`inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-200 ${
                  i === step ? "bg-white text-primary" : i < step ? "bg-white/40 text-white" : "bg-white/15 text-white"
                }`}
              >
                {i + 1}
              </span>
              <span className="h-1 w-full overflow-hidden rounded-full bg-white/20">
                {i < step && <span className="block h-full w-full bg-white" />}
                {i === step && (
                  <motion.span
                    key={`${step}-${auto}`}
                    className="block h-full origin-left bg-white"
                    initial={{ scaleX: auto ? 0 : 1 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: auto ? DURATION : 0, ease: "linear" }}
                  />
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: easeOut }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
          className="flex flex-col gap-4"
        >
          <div>
            <p className="text-sm font-medium text-white/80">
              Step {step + 1} of {STEPS.length}
            </p>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-1 text-white/90">{text}</p>
          </div>
          {/* Fixed height = tallest step, so the page does not jump between steps. */}
          <div aria-hidden="true" className="h-80 overflow-hidden rounded-2xl bg-card p-5 text-foreground shadow-sm">
            <Visual />
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
