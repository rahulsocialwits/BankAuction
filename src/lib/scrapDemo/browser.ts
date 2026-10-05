import { existsSync } from "node:fs";
import { UA } from "@/data-sources/feeds/webScan";

/*
 * AI Python Scrap — DEMO: browser rendering for PUBLIC pages whose HTML is only a JavaScript shell.
 * It behaves like an ordinary visitor's browser: honest bot user-agent, no stealth, no proxy, no cookie reuse, no
 * CAPTCHA/WAF/login handling. A refusal (HTTP 401/403/429, anti-bot challenge, login wall) ends that page as REFUSED.
 * robots.txt is checked for the page AND for every data request (XHR/fetch) the page makes; other domains' data
 * requests are not made at all.
 *
 * The browser library is loaded lazily and optionally, so the rest of the demo (and the build) works when it is absent.
 */

export interface RenderGate {
  sameFamily(url: string): boolean;
  robotsFor(url: string): Promise<"allowed" | "disallowed" | "unreachable">;
  consume(): void;
}

export type RenderResult =
  | { ok: true; html: string; finalUrl: string; status: number | null; ms: number; blocked: string[]; apiRefused: string[] }
  | { ok: false; kind: "UNAVAILABLE" | "REFUSED" | "FAILED"; reason: string };

const CHALLENGE = /(just a moment|attention required|cf-chl|cf-browser-verification|captcha|are you a human|verify you are human|access denied|request blocked|enable javascript and cookies)/i;

const dyn = (m: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ m);

const LOCAL_BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export class BrowserRenderer {
  used = 0;
  private browser: any = null;
  private ctx: any = null;
  private launchError: string | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  how = "not started";

  /** Starts the browser once. Returns an explanation when it cannot run here. */
  private async launch(): Promise<string | null> {
    if (this.ctx) return null;
    if (this.launchError) return this.launchError;
    try {
      const pw = await dyn("playwright-core").catch(() => null);
      if (!pw) throw new Error("the browser library (playwright-core) is not installed in this environment");
      const chromium = pw.chromium ?? pw.default?.chromium;
      let executablePath: string | undefined = process.env.SCRAP_DEMO_CHROME_PATH || undefined;
      let args: string[] = [];
      if (!executablePath) {
        const sp = await dyn("@sparticuz/chromium").catch(() => null);
        if (sp && process.platform === "linux") {
          const c = sp.default ?? sp;
          executablePath = await c.executablePath();
          args = (c.args as string[]).filter((a) => !/web-security/i.test(a));
          this.how = "serverless Chromium";
        }
      }
      if (!executablePath) {
        executablePath = LOCAL_BROWSERS.find((p) => existsSync(p));
        if (executablePath) this.how = `installed browser (${executablePath.split(/[\\/]/).pop()})`;
      }
      if (!executablePath) throw new Error("no Chromium/Chrome/Edge executable was found to run");
      this.browser = await chromium.launch({ executablePath, headless: true, args });
      this.ctx = await this.browser.newContext({ userAgent: UA, locale: "en-IN", viewport: { width: 1280, height: 900 }, serviceWorkers: "block", acceptDownloads: false });
      return null;
    } catch (e) {
      this.launchError = e instanceof Error ? e.message : String(e);
      return this.launchError;
    }
  }

  async status(): Promise<{ ok: boolean; reason: string }> {
    const err = await this.launch();
    return err ? { ok: false, reason: err } : { ok: true, reason: `ready via ${this.how}` };
  }

  /** One page at a time. */
  render(url: string, gate: RenderGate): Promise<RenderResult> {
    const run = () => this.renderNow(url, gate);
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async renderNow(url: string, gate: RenderGate): Promise<RenderResult> {
    const err = await this.launch();
    if (err) return { ok: false, kind: "UNAVAILABLE", reason: `Browser renderer unavailable: ${err}.` };
    try {
      gate.consume();
    } catch (e) {
      return { ok: false, kind: "FAILED", reason: e instanceof Error ? e.message : String(e) };
    }
    const t0 = Date.now();
    const blocked: string[] = [];
    const apiRefused: string[] = [];
    const page = await this.ctx.newPage();
    try {
      await page.route("**/*", async (route: any) => {
        const req = route.request();
        const type = req.resourceType();
        const u: string = req.url();
        if (type === "image" || type === "media" || type === "font") return route.abort();
        if (type === "xhr" || type === "fetch" || type === "websocket" || type === "eventsource") {
          if (!gate.sameFamily(u)) { blocked.push(`other domain: ${new URL(u).host}`); return route.abort(); }
          if ((await gate.robotsFor(u)) !== "allowed") { blocked.push(`robots.txt: ${new URL(u).pathname}`); return route.abort(); }
        }
        if (type === "document" && !gate.sameFamily(u)) { blocked.push(`other domain: ${new URL(u).host}`); return route.abort(); }
        return route.continue();
      });
      page.on("response", (r: any) => {
        const type = r.request().resourceType();
        if ((type === "xhr" || type === "fetch") && [401, 403, 429].includes(r.status())) apiRefused.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
      });

      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
      const status: number | null = resp ? resp.status() : null;
      const h = resp ? resp.headers() : {};
      if (status === 401 || status === 403 || h["cf-mitigated"] === "challenge") {
        return { ok: false, kind: "REFUSED", reason: `protected access: the browser got HTTP ${status ?? "?"}${h["cf-mitigated"] === "challenge" ? " with an anti-bot challenge" : ""}` };
      }
      if (status === 429) return { ok: false, kind: "REFUSED", reason: "HTTP 429: the site is rate-limiting automated requests" };

      // Wait until the page has produced its content (network quiet, text length stable), but not forever.
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
      let last = -1;
      let stable = 0;
      const until = Date.now() + 7_000;
      while (Date.now() < until) {
        const n: number = await page.evaluate(() => (document.body ? document.body.innerText.length : 0)).catch(() => 0);
        if (n > 200 && n === last) { stable++; if (stable >= 2) break; } else stable = 0;
        last = n;
        await page.waitForTimeout(500);
      }

      const html: string = await page.content();
      const finalUrl: string = page.url();
      const bodyText: string = await page.evaluate(() => (document.body ? document.body.innerText : "")).catch(() => "");
      if (bodyText.length < 4000 && CHALLENGE.test(bodyText.slice(0, 3000))) return { ok: false, kind: "REFUSED", reason: "protected access: the rendered page is an anti-bot challenge or access-denied screen" };
      const hasPassword = (await page.$("input[type=password]").catch(() => null)) !== null;
      if ((hasPassword && bodyText.length < 3000) || /\/(login|signin|sign-in)\b/i.test(new URL(finalUrl).pathname)) return { ok: false, kind: "REFUSED", reason: "protected access: the page is a login wall" };

      return { ok: true, html, finalUrl, status, ms: Date.now() - t0, blocked: [...new Set(blocked)].slice(0, 8), apiRefused: [...new Set(apiRefused)].slice(0, 8) };
    } catch (e) {
      const timeout = e instanceof Error && /timeout/i.test(e.message);
      return { ok: false, kind: "FAILED", reason: timeout ? "timeout while rendering the page in the browser" : `browser error: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async close() {
    try { await this.ctx?.close(); } catch { /* ignore */ }
    try { await this.browser?.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.browser = null;
  }
}
