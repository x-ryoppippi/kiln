import { transform, type TransformOptions } from "./transform.ts";

interface LoaderContext {
  resourcePath: string;
  getOptions(): TransformOptions;
  callback(error: Error | null, code?: string, map?: unknown): void;
}

/**
 * A webpack-compatible loader for bundlers unplugin cannot drive, such as Turbopack.
 * Loaders cannot add virtual modules, so rules are always inserted at runtime.
 */
export default function kilnLoader(this: LoaderContext, code: string, map?: unknown): void {
  const result = transform(code, this.resourcePath, { ...this.getOptions(), extract: false });
  if (result) this.callback(null, result.code, result.map);
  else this.callback(null, code, map);
}
