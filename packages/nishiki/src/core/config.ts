import type { ConditionOptions } from "./conditions.ts";

// The number of single-condition ranks under the default conditions, so that the layer statement needs no ranking.
// A test in conditions.ts keeps it equal to `createTable().size`.
export const DEFAULT_SIZE = 71;

let options: ConditionOptions = {};
let size = DEFAULT_SIZE;
let order: string | undefined;

/** The conditions the runtime ranks with. */
export const conditionOptions = (): ConditionOptions => options;

/**
 * Set the conditions the runtime ranks with, and the number of single-condition ranks they make. Emitted by the build
 * plugin, which ranks them at build time; not meant to be written by hand.
 */
export function setConditions(next: ConditionOptions, nextSize: number): void {
  options = next;
  size = nextSize;
  order = undefined;
}

/**
 * The one top-level cascade layer that holds every rule, so that a page orders nishiki against its own layers by this
 * name alone, as in `@layer reset, nishiki;`.
 */
export const LAYER = "nishiki";

/**
 * The layer of a rank, inside nishiki's top-level layer. A property `depth` layers below a longhand nests that many
 * layers inside it.
 */
export const layerName = (rank: number, depth = 0): string => "n" + rank.toString(36) + ".a".repeat(depth);

/** The statement declaring layers inside nishiki's top-level layer, in the order given. */
export const layerStatement = (names: readonly string[]): string => `@layer ${LAYER}{@layer ${names.join(",")};}`;

/** The statement declaring the order of every layer the runtime can emit, which has to precede their rules. */
export function layerOrder(): string {
  return (order ??= layerStatement(Array.from({ length: 2 * size + 1 }, (_, rank) => layerName(rank))));
}
