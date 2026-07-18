// UUIDv7 ids (00 §6): client-generated, collision-free offline, time-ordered.
import { uuidv7 } from "uuidv7";

/** Single id source for the platform (18 §4) — direct uuidv7 imports are banned elsewhere. */
export const newId = (): string => uuidv7();
