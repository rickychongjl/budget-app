// The eight palette slots of MASTER 3.4. A category stores the slot name, never a hex value, so one stored value is right
// in both themes. No red and no green: those are status colours.
export const SLOTS = ['blue', 'orange', 'violet', 'cyan', 'pink', 'teal', 'ochre', 'slate'] as const
export type Slot = (typeof SLOTS)[number]

// Whatever the API stored. Anything that is not a slot falls back to slate rather than rendering colourless.
export const toSlot = (colour: string): Slot => (SLOTS as readonly string[]).includes(colour) ? (colour as Slot) : 'slate'
