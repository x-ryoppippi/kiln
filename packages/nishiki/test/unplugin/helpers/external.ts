/** nishiki's entries, which test builds keep out of the bundle; not packages named alike, such as `@nishikijs/reactive`. */
export const NISHIKI_ENTRY: RegExp = /^@nishikijs\/react(?:\/|$)/;
/** nishiki's entries and React's. */
export const EXTERNAL: RegExp = /^(?:@nishikijs\/react|react)(?:\/|$)/;
