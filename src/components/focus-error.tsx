"use client";

import { useEffect } from "react";

/** UI_RULES 7 Form: after a failed submit, move focus to the first invalid field. */
export function FocusFirstError({ trigger }: { trigger: unknown }) {
  useEffect(() => {
    if (trigger) document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [trigger]);
  return null;
}
