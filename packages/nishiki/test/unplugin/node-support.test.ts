import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const ESCAPE = Object.getOwnPropertyDescriptor(RegExp, "escape")!;

afterEach(() => {
  Object.defineProperty(RegExp, "escape", ESCAPE);
  vi.resetModules();
});

describe("the compiler on a Node.js older than 24", () => {
  it("fails to load with the Node.js it requires", async () => {
    Reflect.deleteProperty(RegExp, "escape");
    vi.resetModules();
    await expect(import("../../src/unplugin/index.ts")).rejects.toThrow(
      /^\[nishiki\] The compiler requires Node\.js 24 or later/,
    );
  });
});
