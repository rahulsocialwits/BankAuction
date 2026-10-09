/* eslint-disable @typescript-eslint/no-explicit-any -- demo-only Puppeteer helper, untyped page objects */
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
  | { ok: true; html: string; text: string; finalUrl: string; status: number | null; ms: number; blocked: string[]; apiRefused: string[] }
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
      // Plain string imports (not a variable): the build can then see them and copy these packages AND their own dependencies
      // (for example tar-fs of @sparticuz/chromium) into the serverless function. Both are listed in serverExternalPackages, so
      // they are loaded from node_modules at run time and never bundled or sent to the browser.
      let pwError = "";
      const pw: any = await import("playwright-core").catch((e: unknown) => { pwError = e instanceof Error ? e.message.split("\n")[0] : String(e); return null; });
      if (!pw) throw new Error(`the browser library (playwright-core) could not be loaded: ${pwError || "not installed"}`);
      const chromium = pw.chromium ?? pw.default?.chromium;
      let executablePath: string | undefined = process.env.SCRAP_DEMO_CHROME_PATH || undefined;
      let args: string[] = [];
      if (!executablePath) {
        if (process.platform === "linux") {
          let spError = "";
          const sp: any = await import("@sparticuz/chromium").catch((e: unknown) => { spError = e instanceof Error ? e.message.split("\n")[0] : String(e); return null; });
          if (!sp) throw new Error(`the serverless Chromium package (@sparticuz/chromium) could not be loaded on this server: ${spError || "unknown"}`);
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
    const page = await this.guardedPage(gate, blocked, apiRefused);
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
      const status: number | null = resp ? resp.status() : null;
      const h = resp ? resp.headers() : {};
      if (status === 401 || status === 403 || h["cf-mitigated"] === "challenge") {
        return { ok: false, kind: "REFUSED", reason: `protected access: the browser got HTTP ${status ?? "?"}${h["cf-mitigated"] === "challenge" ? " with an anti-bot challenge" : ""}` };
      }
      if (status === 429) return { ok: false, kind: "REFUSED", reason: "HTTP 429: the site is rate-limiting automated requests" };

      await this.settle(page);

      const html: string = await page.content();
      const finalUrl: string = page.url();
      const bodyText: string = await page.evaluate(() => (document.body ? document.body.innerText : "")).catch(() => "");
      if (bodyText.length < 4000 && CHALLENGE.test(bodyText.slice(0, 3000))) return { ok: false, kind: "REFUSED", reason: "protected access: the rendered page is an anti-bot challenge or access-denied screen" };
      const hasPassword = (await page.$("input[type=password]").catch(() => null)) !== null;
      if ((hasPassword && bodyText.length < 3000) || /\/(login|signin|sign-in)\b/i.test(new URL(finalUrl).pathname)) return { ok: false, kind: "REFUSED", reason: "protected access: the page is a login wall" };

      return { ok: true, html, text: bodyText, finalUrl, status, ms: Date.now() - t0, blocked: [...new Set(blocked)].slice(0, 8), apiRefused: [...new Set(apiRefused)].slice(0, 8) };
    } catch (e) {
      const timeout = e instanceof Error && /timeout/i.test(e.message);
      return { ok: false, kind: "FAILED", reason: timeout ? "timeout while rendering the page in the browser" : `browser error: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` };
    } finally {
      await page.close().catch(() => undefined);
    }
  }


  /** A page whose requests are checked: images / fonts are skipped, data requests stay on the site and obey robots.txt. */
  private async guardedPage(gate: RenderGate, blocked: string[], apiRefused: string[]) {
    const page = await this.ctx.newPage();
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
    return page;
  }

  /** Waits until the page has produced its content (network quiet, text length stable), but not forever. */
  private async settle(page: any, minChars = 200) {
    // Short on purpose: on a small server every second counts (a scan has a hard 300 s limit). The text length must stop changing
    // for two checks in a row; a page that is still growing after 4 s is read as it is.
    await page.waitForLoadState("networkidle", { timeout: 2_500 }).catch(() => undefined);
    let last = -1;
    let stable = 0;
    const until = Date.now() + 4_000;
    while (Date.now() < until) {
      const n: number = await page.evaluate(() => (document.body ? document.body.innerText.length : 0)).catch(() => 0);
      if (n > minChars && n === last) { stable++; if (stable >= 2) break; } else stable = 0;
      last = n;
      await page.waitForTimeout(350);
    }
  }

  // The list page that stays open between linked renders (a single-page app keeps its cards, so each detail page is one click away).
  private listPage: any = null;
  private listPageUrl = "";

  /**
   * A single-page app may show an empty screen when its detail address is typed in directly, and build the real address
   * (with a token) when a visitor CLICKS the card on the list page. This does exactly that: open the list page, click the
   * link to `targetUrl`, wait for the app to show the property, return its DOM. It is the visitor's own navigation of a public page,
   * with the same robots / refusal checks as render(); a login wall, 401 / 403 or CAPTCHA ends it as REFUSED.
   */
  renderLinked(listUrl: string, targetUrl: string, gate: RenderGate): Promise<RenderResult> {
    const run = () => this.renderLinkedNow(listUrl, targetUrl, gate);
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async renderLinkedNow(listUrl: string, targetUrl: string, gate: RenderGate): Promise<RenderResult> {
    const err = await this.launch();
    if (err) return { ok: false, kind: "UNAVAILABLE", reason: `Browser renderer unavailable: ${err}.` };
    try { gate.consume(); } catch (e) { return { ok: false, kind: "FAILED", reason: e instanceof Error ? e.message : String(e) }; }
    const t0 = Date.now();
    const blocked: string[] = [];
    const apiRefused: string[] = [];
    const target = new URL(targetUrl);
    try {
      if (!this.listPage || this.listPageUrl !== listUrl) {
        await this.listPage?.close().catch(() => undefined);
        this.listPage = await this.guardedPage(gate, blocked, apiRefused);
        this.listPageUrl = listUrl;
        const resp = await this.listPage.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
        const st: number | null = resp ? resp.status() : null;
        if (st === 401 || st === 403) { this.listPage = null; return { ok: false, kind: "REFUSED", reason: `protected access: the browser got HTTP ${st} on the list page` }; }
        if (st === 429) { this.listPage = null; return { ok: false, kind: "REFUSED", reason: "HTTP 429: the site is rate-limiting automated requests" }; }
      }
      const page = this.listPage;
      const sel = `a[href="${target.pathname}${target.search}"]`;
      const link = page.locator(sel).first();
      // the cards are filled in by the app after the page loads: wait for THIS card (not for a fixed time)
      await page.waitForSelector(sel, { timeout: 12_000, state: "attached" }).catch(() => undefined);
      if (!(await link.count())) {
        // the list may have gone back to a different state: reload it once
        await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 25_000 }).catch(() => undefined);
        await page.waitForSelector(sel, { timeout: 12_000, state: "attached" }).catch(() => undefined);
        if (!(await link.count())) return { ok: false, kind: "FAILED", reason: `link_not_found: the list page ${new URL(listUrl).pathname || "/"} has no link to ${target.pathname}` };
      }
      await link.scrollIntoViewIfNeeded().catch(() => undefined);
      await link.click({ timeout: 8_000 });
      // BAANKNET is a client-side route: the real detail URL is produced by the click.
      // Do not wait for networkidle here; background analytics can keep a SPA "busy" indefinitely.
      const routeChanged = await page.waitForURL(
        (u: URL) => u.pathname.startsWith(target.pathname) && u.pathname.length > target.pathname.length,
        { timeout: 8_000 },
      ).then(() => true).catch(() => false);

      // The useful readiness signal is the rendered property data, not network idleness.
      // We only need enough visible content to know the detail view has populated.
      const populated = await page.waitForFunction(
        () => {
          const text = document.body?.innerText ?? "";
          const hasPropertySignals = /(property\s+address|reserve\s+price|emd\s+amount|auction\s+(start|end)|borrower'?s?\s+name|bank\s+property\s+id)/i.test(text);
          return text.length > 900 && hasPropertySignals;
        },
        undefined,
        { timeout: routeChanged ? 8_000 : 10_000 },
      ).then(() => true).catch(() => false);

      // Give a very small stabilization window after property content is visible.
      if (populated) await page.waitForTimeout(250);

      const finalUrl: string = page.url();
      const html: string = await page.content();
      const bodyText: string = await page.evaluate(() => (document.body ? document.body.innerText : "")).catch(() => "");
      if (bodyText.length < 4000 && CHALLENGE.test(bodyText.slice(0, 3000))) { this.listPage = null; return { ok: false, kind: "REFUSED", reason: "protected access: the rendered page is an anti-bot challenge or access-denied screen" }; }
      const hasPassword = (await page.$("input[type=password]").catch(() => null)) !== null;
      if ((hasPassword && bodyText.length < 3000) || /\/(login|signin|sign-in)\b/i.test(new URL(finalUrl).pathname)) { this.listPage = null; return { ok: false, kind: "REFUSED", reason: "protected access: the page is a login wall" }; }

      // back to the list for the next card (the app keeps its state)
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => { this.listPage = null; });
      return { ok: true, html, text: bodyText, finalUrl, status: 200, ms: Date.now() - t0, blocked: [...new Set(blocked)].slice(0, 8), apiRefused: [...new Set(apiRefused)].slice(0, 8) };
    } catch (e) {
      this.listPage = null;
      const timeout = e instanceof Error && /timeout/i.test(e.message);
      return { ok: false, kind: "FAILED", reason: timeout ? "timeout while rendering the page in the browser" : `browser error: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` };
    }
  }

  async close() {
    try { await this.listPage?.close(); } catch { /* ignore */ }
    this.listPage = null;
    try { await this.ctx?.close(); } catch { /* ignore */ }
    try { await this.browser?.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.browser = null;
  }
}
