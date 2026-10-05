import * as cheerio from "cheerio";
import { BrowserRenderer, type RenderGate } from "@/lib/scrapDemo/browser";
import { htmlToText } from "./webScan";
import type { RobotsGate } from "./robotsGate";

/*
 * JavaScript render fallback for the production crawler.
 *
 * It is used ONLY for a public page that the normal crawler was already allowed to request (same do-not-fetch list, same robots.txt
 * check, same honest user agent) and that came back as an empty JavaScript application shell. The browser merely runs that page's
 * own JavaScript, like a visitor's browser would. It is never a way around a refusal: HTTP 401 / 403, a CAPTCHA / verification
 * screen or a login wall stop the page (classified honestly), a robots.txt rule is checked for the page and for every data request
 * the page makes, and other domains' data requests are not made at all.
 *
 * All browser code is server-side only (Node runtime). The browser library is loaded lazily; when it cannot start (no Chromium)
 * the page is simply reported as "render_error" with the reason.
 */

export type RenderFailure = "render_timeout" | "render_error" | "http_401" | "http_403" | "captcha" | "robots_disallowed" | "network_error" | "http_429";

/** True when the HTML is an empty JavaScript application shell: almost no visible text, but scripts and/or an app root. */
export function isJsShell(html: string): { shell: boolean; why: string } {
  const text = htmlToText(html);
  const $ = cheerio.load(html);
  const scripts = $("script").length;
  const root = /id=["'](root|app|__next|__nuxt)["']|<app-root|ng-version|data-reactroot/i.test(html);
  const noscript = /you need to enable javascript|please enable javascript|enable javascript to (run|view)/i.test(html);
  if (text.length < 400 && (root || scripts >= 1 || noscript)) {
    return { shell: true, why: `only ${text.length} chars of visible text, ${scripts} script tag(s)${root ? ", an empty app root" : ""}${noscript ? ", a 'enable JavaScript' notice" : ""}` };
  }
  return { shell: false, why: `${text.length} chars of visible text` };
}

function classifyFailure(kind: "UNAVAILABLE" | "REFUSED" | "FAILED", reason: string): RenderFailure {
  return kind === "UNAVAILABLE" ? "render_error"
    : /HTTP 401/.test(reason) ? "http_401"
    : /HTTP 403/.test(reason) ? "http_403"
    : /HTTP 429/.test(reason) ? "http_429"
    : kind === "REFUSED" ? (/login/i.test(reason) ? "http_401" : "captcha")
    : /timeout/i.test(reason) ? "render_timeout"
    : /network|net::|ERR_/i.test(reason) ? "network_error"
    : "render_error";
}

export interface RenderedPage {
  html: string;
  /** The text exactly as the browser lays it out (labels and values on their own lines). */
  text: string;
  finalUrl: string;
  ms: number;
}

/** One browser per fetcher; pages are rendered one at a time. */
export class RenderingFetcher {
  private readonly browser = new BrowserRenderer();
  rendered = 0;
  private readonly maxPages: number;

  constructor(private readonly gate: RobotsGate, maxPages = 400) {
    this.maxPages = maxPages;
  }

  async status() {
    return this.browser.status();
  }

  async render(url: string): Promise<{ ok: true; page: RenderedPage } | { ok: false; failure: RenderFailure; reason: string }> {
    const origin = new URL(url).hostname.replace(/^www\./, "");
    const gate: RenderGate = {
      sameFamily: (u) => { try { const h = new URL(u).hostname.toLowerCase().replace(/^www\./, ""); return h === origin || h.endsWith("." + origin); } catch { return false; } },
      robotsFor: (u) => this.gate.check(u),
      consume: () => {
        if (this.rendered >= this.maxPages) throw new Error(`render budget reached (${this.maxPages} pages)`);
        this.rendered++;
      },
    };
    if ((await this.gate.check(url)) !== "allowed") return { ok: false, failure: "robots_disallowed", reason: "robots.txt does not allow this address; the browser was not started" };
    const r = await this.browser.render(url, gate);
    if (r.ok) return { ok: true, page: { html: r.html, text: r.text, finalUrl: r.finalUrl, ms: r.ms } };
    return { ok: false, failure: classifyFailure(r.kind, r.reason), reason: r.reason };
  }

  /** Renders a detail page by clicking its card on `listUrl` (for single-page apps that build the real address on click). */
  async renderLinked(listUrl: string, url: string): Promise<{ ok: true; page: RenderedPage } | { ok: false; failure: RenderFailure; reason: string }> {
    const origin = new URL(url).hostname.replace(/^www\./, "");
    if ((await this.gate.check(listUrl)) !== "allowed" || (await this.gate.check(url)) !== "allowed") return { ok: false, failure: "robots_disallowed", reason: "robots.txt does not allow this address; the browser was not started" };
    const gate: RenderGate = {
      sameFamily: (u) => { try { const h = new URL(u).hostname.toLowerCase().replace(/^www\./, ""); return h === origin || h.endsWith("." + origin); } catch { return false; } },
      robotsFor: (u) => this.gate.check(u),
      consume: () => {
        if (this.rendered >= this.maxPages) throw new Error(`render budget reached (${this.maxPages} pages)`);
        this.rendered++;
      },
    };
    const r = await this.browser.renderLinked(listUrl, url, gate);
    if (r.ok) return { ok: true, page: { html: r.html, text: r.text, finalUrl: r.finalUrl, ms: r.ms } };
    return { ok: false, failure: classifyFailure(r.kind, r.reason), reason: r.reason };
  }

  async close() {
    await this.browser.close();
  }
}
