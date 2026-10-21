"use client";

import type { ReactNode } from "react";
import { MotionConfig, motion, type Transition, type Variants } from "motion/react";

// Shared motion vocabulary. MotionConfig makes every animation honour prefers-reduced-motion.
export const spring: Transition = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 };
export const easeOut: Transition = { duration: 0.24, ease: [0.22, 1, 0.36, 1] };

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: easeOut },
};

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fades and lifts its children in on mount. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={fadeUp} transition={{ ...easeOut, delay }}>
      {children}
    </motion.div>
  );
}

/** Container whose StaggerItem children reveal one after another. */
export function Stagger({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" }) {
  const Comp = as === "ul" ? motion.ul : motion.div;
  return (
    <Comp className={className} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } }}>
      {children}
    </Comp>
  );
}

export function StaggerItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const Comp = as === "li" ? motion.li : motion.div;
  return (
    <Comp className={className} variants={fadeUp}>
      {children}
    </Comp>
  );
}

/** Progress fill animated with scaleX (transform only, no layout work). */
export function AnimatedBar({ value, className }: { value: number; className: string }) {
  const v = Math.max(0, Math.min(100, value)) / 100;
  return (
    <motion.div
      className={`h-full origin-left rounded-full ${className}`}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: v }}
      transition={{ ...spring, delay: 0.1 }}
    />
  );
}
