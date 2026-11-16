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

/** The top-level layer of a rank. A property `depth` layers below a longhand nests that many layers inside it. */
export const layerName = (rank: number, depth = 0): string => "k" + rank.toString(36) + ".a".repeat(depth);

/** The statement declaring the order of every layer the runtime can emit, which has to precede their rules. */
export function layerOrder(): string {
  return (order ??= "@layer " + Array.from({ length: 2 * size + 1 }, (_, rank) => layerName(rank)).join(",") + ";");
}
