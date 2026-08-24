/**
 * `00 §5.6` / `14-F38` — every word this pad puts on glass, in one place.
 *
 * The rail (`pnpm strings:check`) fails only modules that have ADOPTED `14-F38` in their own doc,
 * and doc 04 has not, so this module is COUNTED rather than failed. The catalogue exists anyway,
 * because the rail's own register is how the next adopter finds out there is anything to adopt —
 * and because the four banned classes (FR ids, env keys, repo paths, spec refs) are exactly what a
 * session writing a help line reaches for, since every comment around it does so correctly.
 *
 * English-only on the glass (commandment 7). **User content is a different thing and is never
 * translated or folded** — a table called `چھت ٣` renders as the operator typed it.
 */
export const STRINGS = {
  // Identify (`01-F61`'s grid, then the pad).
  whoAreYou: "Who are you?",
  unlock: "Unlock",
  notYou: "Not you?",
  wrongPin: "That PIN was not right. Try again.",
  lockedOut: "Too many wrong PINs. Wait five minutes, or use the counter.",
  notRecognised: "This device does not know you. Ask the manager.",
  tillNotPaired: "This till is not set up to take orders yet.",

  // The floor.
  tables: "Tables",
  order: "Order",
  newTable: "Table number",
  openTable: "Open this table",
  clear: "Clear",
  nothingToSend: "Nothing new to send",
  // `01-F19` — two orders stand on one table and nothing here picks between them.
  contested: "(two orders)",

  // Capture (`04-F6`) and `04-F24`'s honesty.
  send: "Send to kitchen",
  notSent: "— not sent",
  onTheTill: "Already sent",

  // `00 §5.7` — the honesty strip. The pad's availability IS the till's (`04-F21`).
  till: "Till",
  padOffline: "Cannot reach the till — orders can be typed but not sent",
  cannotReachTill: "Cannot reach the till.",
} as const;
