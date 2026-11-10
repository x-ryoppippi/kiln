// Loads a build in headless Chromium and clicks through its links, over the Chrome DevTools Protocol.
// Node's built-in WebSocket is the whole client, so the benchmark needs no browser download or install script.
import { spawn, type ChildProcess, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

import { KILN_SELECTOR, summarise, unusedOf, type Rule, type Unused, type UnusedSummary } from "./css.ts";
import type { Server } from "./serve.ts";

export type Step = {
  // "first load", or the href of the link clicked.
  label: string;
  // Gzip bytes of the CSS files the step fetched, as served, and how many.
  cssGzip: number;
  cssRequests: number;
  // From navigation start or the click to the frame after the step's last DOM change.
  renderedMs: number;
  // Main-thread style recalculation and layout during the step, from Chromium's Performance.getMetrics counters.
  styleMs: number;
  layoutMs: number;
  // Kiln rules the step added to the document's stylesheets, against the classes on the elements it renders.
  unused: Unused;
};
export type Run = { steps: Step[]; visitAll: Unused };
export type BrowserResult = {
  // The median of each field over the runs, step by step.
  steps: Step[];
  unused: UnusedSummary;
  runs: Run[];
};

const NAMES = ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome", "chrome"];
const INSTALLS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  win32: [
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  ],
};

export function findChrome(): string | undefined {
  const configured = process.env.CHROME_PATH;
  if (configured) {
    if (!existsSync(configured)) throw new Error(`CHROME_PATH is ${configured}, which does not exist`);
    return configured;
  }
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const name of NAMES) if (dir && existsSync(path.join(dir, name))) return path.join(dir, name);
  }
  return INSTALLS[process.platform]?.find((file) => existsSync(file));
}

type Session = {
  send: <T>(method: string, params?: object) => Promise<T>;
};
export type Browser = {
  // Loads the build the server serves in a fresh browser context, then clicks through its links.
  run: (server: Server) => Promise<Run>;
  close: () => Promise<void>;
};

export async function launch(executable: string): Promise<Browser> {
  const profile = await mkdtemp(path.join(tmpdir(), "kiln-bench-"));
  let child: ChildProcessByStdio<null, null, Readable> | undefined;
  try {
    child = spawn(
      executable,
      [
        "--headless",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1280,800",
        // Chromium refuses to sandbox itself as root, which is how containers usually run.
        ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    const socket = await connect(executable, child);
    return control(child, socket, profile);
  } catch (error) {
    if (child) {
      const exited = exitOf(child);
      child.kill("SIGKILL");
      await exited;
    }
    await rm(profile, { recursive: true, force: true });
    throw error;
  }
}

// Resolves once the process has exited, or at once if it already has or never started.
function exitOf(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", () => resolve()));
}

async function connect(executable: string, child: ChildProcessByStdio<null, null, Readable>): Promise<WebSocket> {
  const endpoint = await new Promise<string>((resolve, reject) => {
    let output = "";
    const fail = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error(`${executable} did not start:\n${output}`)), 30_000);
    child.on("error", (error) => fail(new Error(`${executable} could not be started: ${error.message}`)));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
      const url = /DevTools listening on (ws:\/\/\S+)/.exec(output)?.[1];
      if (url) {
        clearTimeout(timer);
        resolve(url);
      }
    });
    child.on("exit", () => fail(new Error(`${executable} exited:\n${output}`)));
  });
  const socket = new WebSocket(endpoint);
  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error(`could not connect to ${endpoint}`)), { once: true });
    });
  } catch (error) {
    socket.close();
    throw error;
  }
  return socket;
}

function control(child: ChildProcess, socket: WebSocket, profile: string): Browser {
  let nextId = 0;
  const pending = new Map<number, (message: ReturnType<typeof JSON.parse>) => void>();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    // Messages without an id are events, which nothing here listens to.
    if (message.id === undefined) return;
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  // A crashed browser sends no replies, so settle what is waiting instead of hanging the benchmark.
  const lost = { error: { message: "the DevTools connection closed" } };
  socket.addEventListener("close", () => {
    for (const settle of pending.values()) settle(lost);
    pending.clear();
  });
  const sessionOf = (sessionId?: string): Session => ({
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        const settle = (message: ReturnType<typeof JSON.parse>) =>
          message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result);
        if (socket.readyState !== WebSocket.OPEN) return settle(lost);
        pending.set(id, settle);
        socket.send(JSON.stringify({ id, method, params, sessionId }));
      }),
  });
  const browser = sessionOf();

  const run = async (server: Server): Promise<Run> => {
    const url = server.url;
    // A browser context of its own starts every run with an empty cache.
    const { browserContextId } = await browser.send<{ browserContextId: string }>("Target.createBrowserContext");
    const { targetId } = await browser.send<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
      browserContextId,
    });
    const { sessionId } = await browser.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const page = sessionOf(sessionId);
    const evaluate = async <T>(expression: string) => {
      const { result, exceptionDetails } = await page.send<{
        result: { value: T };
        exceptionDetails?: { exception?: { description?: string }; text: string };
      }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    };
    const metrics = async () => {
      const { metrics } = await page.send<{ metrics: { name: string; value: number }[] }>("Performance.getMetrics");
      const value = (name: string) => (metrics.find((metric) => metric.name === name)?.value ?? 0) * 1000;
      return { style: value("RecalcStyleDuration"), layout: value("LayoutDuration") };
    };
    // Rendered once nothing is in flight and the DOM has not changed for QUIET_MS after the frame that followed its
    // last change, so a route that shows a fallback while it loads is timed to its final content.
    // React reveals content that suspended up to 300 ms after showing its fallback, which QUIET_MS must outlast.
    const settle = async (since: number) => {
      const deadline = Date.now() + 15_000;
      for (;;) {
        // Until the navigation commits, the page is still about:blank, which has no instrumentation.
        const [rendered, now] = await evaluate<[number, number]>(
          "[globalThis.__kilnBench?.rendered ?? 0, performance.now()]",
        );
        if (rendered > since && server.inFlight() === 0 && now - rendered >= QUIET_MS) return rendered;
        if (Date.now() > deadline) throw new Error(`${url} did not settle`);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };

    const steps: Step[] = [];
    const used = new Set<string>();
    const loaded: Rule[] = [];
    const record = async (label: string, start: number, before: { style: number; layout: number }) => {
      const rendered = await settle(start);
      const after = await metrics();
      const { cssGzip, cssRequests } = server.take();
      const classes = new Set(await evaluate<string[]>("__kilnBench.classes()"));
      const added = await evaluate<Rule[]>("__kilnBench.addedRules()");
      for (const name of classes) used.add(name);
      loaded.push(...added);
      steps.push({
        label,
        cssGzip,
        cssRequests,
        renderedMs: rendered - start,
        styleMs: after.style - before.style,
        layoutMs: after.layout - before.layout,
        unused: unusedOf(added, classes),
      });
    };

    await page.send("Page.enable");
    await page.send("Performance.enable");
    await page.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(${instrument.toString()})(${KILN_SELECTOR.toString()})`,
    });
    server.take();
    await page.send("Page.navigate", { url });
    // Counted from zero: leaving about:blank for another site can move the page to a new renderer process, whose
    // counters start again, and about:blank does next to no style work.
    await record("first load", 0, { style: 0, layout: 0 });
    for (const href of await evaluate<string[]>("__kilnBench.links()")) {
      const before = await metrics();
      const start = await evaluate<number | null>(`__kilnBench.click(${JSON.stringify(href)})`);
      if (start === null) throw new Error(`${url}: no link to ${href} after the previous navigation`);
      await record(href, start, before);
    }
    await browser.send("Target.disposeBrowserContext", { browserContextId });
    return { steps, visitAll: unusedOf(loaded, used) };
  };

  return {
    run,
    close: async () => {
      const exited = exitOf(child);
      await browser.send("Browser.close").catch(() => child.kill());
      await exited;
      socket.close();
      await rm(profile, { recursive: true, force: true });
    },
  };
}

const QUIET_MS = 500;

export function summariseRuns(name: string, runs: Run[]): BrowserResult {
  const labels = runs[0]!.steps.map((step) => step.label);
  for (const result of runs.slice(1)) {
    const other = result.steps.map((step) => step.label);
    if (other.join("\n") !== labels.join("\n")) throw new Error(`${name}: runs clicked different links`);
  }
  const steps = labels.map((label, index) =>
    medianStep(
      label,
      runs.map((result) => result.steps[index]!),
    ),
  );
  return {
    steps,
    unused: summarise(
      "browser",
      steps[0]!.unused,
      steps.slice(1).map((step) => step.unused),
      medianUnused(runs.map((result) => result.visitAll)),
    ),
    runs,
  };
}

export function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function medianUnused(values: Unused[]): Unused {
  const of = (key: keyof Unused) => median(values.map((value) => value[key]));
  return { rules: of("rules"), unusedRules: of("unusedRules"), bytes: of("bytes"), unusedBytes: of("unusedBytes") };
}

function medianStep(label: string, steps: Step[]): Step {
  const of = (key: Exclude<keyof Step, "label" | "unused">) => median(steps.map((step) => step[key]));
  return {
    label,
    cssGzip: of("cssGzip"),
    cssRequests: of("cssRequests"),
    renderedMs: of("renderedMs"),
    styleMs: of("styleMs"),
    layoutMs: of("layoutMs"),
    unused: medianUnused(steps.map((step) => step.unused)),
  };
}

// Runs in the page before any of its scripts.
function instrument(kilnSelector: RegExp) {
  let rendered = 0;
  new MutationObserver(() => {
    requestAnimationFrame(() =>
      setTimeout(() => {
        rendered = performance.now();
      }),
    );
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });

  // Counts of each rule already reported, keyed by sheet and text, so a step reports only the rules it added,
  // whether a stylesheet brought them or the runtime inserted them.
  let reported = new Map<string, number>();
  const sheetIds = new WeakMap<CSSStyleSheet, number>();
  let nextSheet = 0;
  const encoder = new TextEncoder();
  const rulesIn = (rules: CSSRuleList, sheet: number, out: [string, string, number][]) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const name = kilnSelector.exec(rule.selectorText)?.[1];
        // The rule's own text, without the rules nested in it, which this walk visits on their own.
        const text = `${rule.selectorText}{${rule.style.cssText}}`;
        if (name) out.push([`${sheet} ${text}`, name, encoder.encode(text).byteLength]);
      }
      if (rule instanceof CSSGroupingRule || rule instanceof CSSStyleRule) rulesIn(rule.cssRules, sheet, out);
    }
  };
  const normalise = (href: string) => href.replace(/#$/, "");

  Object.assign(globalThis, {
    __kilnBench: {
      get rendered() {
        return rendered;
      },
      // Only elements the page renders: a closed <dialog> or anything under display: none uses none of its rules.
      classes: () => [
        ...new Set(
          [...document.querySelectorAll("[class]")]
            .filter((element) => element.checkVisibility())
            .flatMap((element) => (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)),
        ),
      ],
      addedRules: () => {
        const counts = new Map<string, number>();
        const added: { name: string; bytes: number }[] = [];
        for (const sheet of document.styleSheets) {
          if (!sheetIds.has(sheet)) sheetIds.set(sheet, nextSheet++);
          const rules: [string, string, number][] = [];
          rulesIn(sheet.cssRules, sheetIds.get(sheet)!, rules);
          for (const [key, name, bytes] of rules) {
            const count = (counts.get(key) ?? 0) + 1;
            counts.set(key, count);
            if (count > (reported.get(key) ?? 0)) added.push({ name, bytes });
          }
        }
        reported = counts;
        return added;
      },
      // Same-origin links that lead away from the first page, once each, in document order.
      links: () => [
        ...new Set(
          [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
            .filter((link) => link.origin === location.origin && normalise(link.href) !== normalise(location.href))
            .map((link) => link.getAttribute("href")!),
        ),
      ],
      click: (href: string) => {
        const link = [...document.querySelectorAll("a[href]")].find((link) => link.getAttribute("href") === href);
        if (!(link instanceof HTMLElement)) return null;
        const start = performance.now();
        link.click();
        return start;
      },
    },
  });
}
