// Lightweight cn() — Tailwind v4 doesn't need a config file, so this is the
// only utility glue we need outside of CVA-style class composition.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}