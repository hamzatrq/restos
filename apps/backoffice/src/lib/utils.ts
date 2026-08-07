import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui's class merge — later Tailwind utilities win over earlier ones of the same family. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
