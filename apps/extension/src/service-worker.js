importScripts("i18n.js");

const API_URL = "http://localhost:8000";
const inflight = new Map();
const statusWrites = new Map();
const pendingStartTabs = new Set();
const terminalEvents = new Set(["done", "error"]);

function logEvent(event, details = {}) {
  console.info("tos_decipher_event", JSON.stringify({ event, at: new Date().toISOString(), ...details }));
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return "[invalid URL]";
  }
}

const MULTI_LABEL_SUFFIXES = new Set(["ac.uk", "co.uk", "gov.uk", "org.uk", "com.au", "net.au", "org.au", "edu.au", "gov.au", "co.jp", "ne.jp", "or.jp", "co.nz", "com.br", "com.cn", "com.hk", "com.sg", "co.in", "firm.in", "net.in", "org.in", "com.mx", "com.tr", "co.za", "com.tw", "co.kr"]);
const SHARED_HOST_SUFFIXES = new Set(["github.io", "gitlab.io", "pages.dev", "vercel.app", "netlify.app", "herokuapp.com", "web.app", "firebaseapp.com", "cloudfront.net", "azurewebsites.net", "blogspot.com", "wordpress.com", "myshopify.com", "wixsite.com", "squarespace.com"]);
const COMMON_SECOND_LEVELS = new Set(["ac", "co", "com", "edu", "firm", "gen", "go", "gov", "id", "mil", "ne", "net", "nom", "or", "org", "res", "sch"]);
const MAX_POLICY_HTML_BYTES = 2 * 1024 * 1024;
const MAX_POLICY_ASSET_BYTES = 512 * 1024;
const MAX_POLICY_ASSETS = 32;

function decodeScriptString(value) {
  if (value.startsWith('"')) {
    try { return JSON.parse(value); } catch {}
  }
  let decoded = "";
  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index];
    if (character !== "\\") {
      decoded += character;
      continue;
    }
    const next = value[++index];
    if (next === "n") decoded += "\n";
    else if (next === "r") decoded += "\r";
    else if (next === "t") decoded += "\t";
    else if (next === "b") decoded += "\b";
    else if (next === "f") decoded += "\f";
    else if (next === "u" && /^[\da-f]{4}$/i.test(value.slice(index + 1, index + 5))) {
      decoded += String.fromCharCode(parseInt(value.slice(index + 1, index + 5), 16));
      index += 4;
    } else if (next) decoded += next;
  }
  return decoded;
}

function readQuotedString(source, start) {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return "";
  let escaped = false;
  let candidateEnd = -1;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === quote) {
      const next = source.slice(index + 1).match(/^\s*([,:;}\])])/);
      if (next) return source.slice(start, index + 1);
      if (candidateEnd < 0) candidateEnd = index;
    }
  }
  return candidateEnd < 0 ? "" : source.slice(start, candidateEnd + 1);
}

function collectJsonStrings(value, output, depth = 0) {
  if (output.length >= 5000 || depth > 12) return;
  if (typeof value === "string") {
    if (value.length > 80) output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonStrings(item, output, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectJsonStrings(item, output, depth + 1);
  }
}

function embeddedStrings(source) {
  const values = [];
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const payload = match[1].trim();
    if (!payload || payload.length > MAX_POLICY_HTML_BYTES) continue;
    try { collectJsonStrings(JSON.parse(payload), values); } catch {}
  }
  for (const match of source.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g)) {
    if (match[0].length > 82) values.push(decodeScriptString(match[0]));
    if (values.length >= 10000) break;
  }
  return values;
}

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
    if (code[0] === "#") {
      const number = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : " ";
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[code.toLowerCase()] || " ";
  });
}

function scriptUrls(source, baseUrl) {
  const urls = [];
  const seen = new Set();
  for (const match of source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || seen.has(url.href)) continue;
      seen.add(url.href);
      urls.push(url);
    } catch {}
  }
  return urls;
}

function policyRouteMatches(routeName, policyUrl) {
  const route = routeName.toLowerCase();
  const path = policyUrl.pathname.toLowerCase();
  const terms = /terms?|tos|service|agreement/.test(path);
  const privacy = /privacy|cookie|data.?protection/.test(path);
  const usage = /usage|acceptable.?use/.test(path);
  const billing = /refund|billing|subscription|payment/.test(path);
  if (terms) return /terms?|service|agreement/.test(route);
  if (privacy) return /privacy|cookie|data.?protection/.test(route);
  if (usage) return /usage|acceptable.?use/.test(route);
  if (billing) return /refund|billing|subscription|payment/.test(route);
  return /terms?|privacy|cookie|policy|agreement|refund|billing|subscription|usage/.test(route);
}

function routeAssetUrls(sources, policyUrl, trustedOrigins) {
  const urls = new Map();
  for (const source of sources) {
    const routes = source.text.matchAll(/["']([^"']+)["']\s*:\s*\[([^\]]{1,6000})\]/g);
    for (const route of routes) {
      if (!policyRouteMatches(route[1], policyUrl)) continue;
      for (const asset of route[2].matchAll(/["']([^"'\s]+\.m?js)["']/g)) {
        const assetPath = asset[1];
        try {
          const base = assetPath.startsWith("js/") ? new URL("../", source.url) : new URL(source.url);
          const url = new URL(assetPath, base);
          if (url.protocol === policyUrl.protocol && !url.username && !url.password && trustedOrigins.has(url.origin)) urls.set(url.href, url);
        } catch {}
      }
    }
  }
  return [...urls.values()];
}

function policyHtmlFromBundles(sources, policyUrl) {
  const path = policyUrl.pathname.toLowerCase();
  const isPrivacy = /privacy|cookie|data.?protection/.test(path);
  const isTerms = /terms?|tos|agreement/.test(path);
  const fields = [];
  for (const source of sources) {
    const fieldPattern = /["']([^"']*(?:terms?|privacy|cookie|usage|policy|agreement)[^"']*contentHtml)["']\s*:\s*/gi;
    for (const match of source.text.matchAll(fieldPattern)) {
      const field = match[1].toLowerCase();
      if (isPrivacy && !/privacy|cookie|data.?protection/.test(field)) continue;
      if (isTerms && !/terms?|agreement|service/.test(field)) continue;
      const valueStart = match.index + match[0].length;
      const rawValue = readQuotedString(source.text, valueStart);
      if (!rawValue) continue;
      let html = decodeScriptString(rawValue);
      for (let depth = 0; depth < 3 && /\\u003[cC]|\\\\"/.test(html); depth += 1) {
        const decoded = decodeScriptString(`"${html}"`);
        if (decoded === html) break;
        html = decoded;
      }
      if (/<(?:p|h[1-6]|li|ol|ul|table)\b/i.test(html)) fields.push(html);
    }
  }
  if (fields.length) return fields.sort((left, right) => right.length - left.length)[0];
  const candidates = [];
  for (const source of sources) {
    for (const value of embeddedStrings(source.text)) {
      if (!/<(?:p|h[1-6]|li|ol|ul|table|section|article)\b/i.test(value)) continue;
      const text = decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
      const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
      const sentenceMarks = (text.match(/[.!?](?:\s|$)/g) || []).length;
      const commas = (text.match(/,/g) || []).length;
      if (text.length < 300 || words.length < 50 || sentenceMarks < 2 || commas > words.length / 8) continue;
      candidates.push(value);
    }
  }
  return candidates.sort((left, right) => right.length - left.length)[0] || "";
}

function wrapPolicyHtml(content) {
  const html = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  return `<html><body><main><article>${html}</article></main></body></html>`;
}

async function readLimitedText(response, maxBytes = MAX_POLICY_HTML_BYTES) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("The policy page assets are too large to review safely.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("The policy page assets are too large to review safely.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function hostDetails(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const labels = host.split(".");
  const isIpv6 = host.includes(":");
  const isIp = isIpv6 || (labels.length === 4 && labels.every(label => /^\d+$/.test(label) && Number(label) <= 255));
  const suffix = labels.slice(-2).join(".");
  const isSharedHost = SHARED_HOST_SUFFIXES.has(suffix);
  if (host === "localhost" || isIp || labels.length < 2 || isSharedHost) return { site: host, exact: true };
  const publicSuffixLength = MULTI_LABEL_SUFFIXES.has(suffix) || (labels.at(-1).length === 2 && COMMON_SECOND_LEVELS.has(labels.at(-2))) ? 2 : 1;
  if (labels.length <= publicSuffixLength) return { site: host, exact: true };
  return { site: labels.slice(-(publicSuffixLength + 1)).join("."), exact: false };
}

async function fetchPolicyHtml(urlValue, pageUrlValue, language = "en") {
  const translate = key => TosDecipherI18n.translate(language, key);
  let url;
  let pageUrl;
  try {
    url = new URL(urlValue);
    pageUrl = new URL(pageUrlValue);
  } catch {
    throw new Error(translate("net.invalidLink"));
  }
  const allowedSite = hostDetails(pageUrl.hostname);
  const urlSite = hostDetails(url.hostname);
  if (!["http:", "https:"].includes(url.protocol) || url.protocol !== pageUrl.protocol || url.port !== pageUrl.port || urlSite.site !== allowedSite.site || (!allowedSite.exact && urlSite.exact)) {
    throw new Error(translate("net.onlyThisSite"));
  }
  const trustedOrigins = new Set([pageUrl.origin]);
  const allowedAssetOrigins = new Set([pageUrl.origin]);
  const sourceByUrl = new Map();
  const fetchedAssets = new Map();
  const trustedAssetOrigin = asset => asset.protocol === pageUrl.protocol && allowedAssetOrigins.has(asset.origin);
  const fetchAssetText = async assetUrl => {
    if (fetchedAssets.has(assetUrl.href)) return fetchedAssets.get(assetUrl.href);
    if (fetchedAssets.size >= MAX_POLICY_ASSETS || !trustedAssetOrigin(assetUrl)) return "";
    const pending = (async () => {
      const assetResponse = await fetch(assetUrl.href, { credentials: "omit", redirect: "follow", referrerPolicy: "no-referrer", cache: "no-store", signal: AbortSignal.timeout(8000) });
      const assetFinalUrl = new URL(assetResponse.url || assetUrl.href);
      if (!assetResponse.ok || !trustedAssetOrigin(assetFinalUrl)) return "";
      const type = (assetResponse.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (type && !["application/javascript", "text/javascript", "text/plain", "application/json"].includes(type)) return "";
      const text = await readLimitedText(assetResponse, MAX_POLICY_ASSET_BYTES);
      sourceByUrl.set(assetFinalUrl.href, { url: assetFinalUrl.href, text });
      trustedOrigins.add(assetFinalUrl.origin);
      allowedAssetOrigins.add(assetFinalUrl.origin);
      return text;
    })();
    fetchedAssets.set(assetUrl.href, pending);
    try { return await pending; } catch { return ""; }
  };
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20000);
  let response;
  try {
    response = await fetch(url.href, { credentials: "omit", redirect: "follow", referrerPolicy: "no-referrer", cache: "no-store", signal: controller.signal });
  } catch {
    clearTimeout(timeoutId);
    if (timedOut) throw new Error(translate("net.timeout"));
    throw new Error(translate("net.blocked"));
  }
  let finalUrl;
  try {
    finalUrl = new URL(response.url || url.href);
  } catch {
    clearTimeout(timeoutId);
    throw new Error(translate("net.invalidRedirect"));
  }
  const finalSite = hostDetails(finalUrl.hostname);
  if (!["http:", "https:"].includes(finalUrl.protocol) || finalUrl.protocol !== pageUrl.protocol || finalUrl.port !== pageUrl.port || finalSite.site !== allowedSite.site || (!allowedSite.exact && finalSite.exact)) {
    clearTimeout(timeoutId);
    throw new Error(translate("net.redirectOutside"));
  }
  if (finalUrl.href !== url.href) {
    const initialSite = hostDetails(url.hostname);
    if (initialSite.site !== finalSite.site || (!initialSite.exact && finalSite.exact)) {
      clearTimeout(timeoutId);
      throw new Error(translate("net.redirectOutsideRequested"));
    }
  }
  if (!response.ok) {
    clearTimeout(timeoutId);
    throw new Error(TosDecipherI18n.translate(language, "net.httpStatus", { status: response.status }));
  }
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType && !["text/html", "application/xhtml+xml", "text/plain", "application/javascript", "text/javascript"].includes(contentType)) {
    clearTimeout(timeoutId);
    throw new Error(translate("net.notWebPage"));
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_POLICY_HTML_BYTES) {
    clearTimeout(timeoutId);
    throw new Error(translate("net.tooLarge"));
  }
  if (!response.body) throw new Error(translate("net.noContent"));
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch {
      clearTimeout(timeoutId);
      if (timedOut) throw new Error(translate("net.timeout"));
      throw new Error(translate("net.stopped"));
    }
    const { done, value } = chunk;
    if (done) break;
    total += value.byteLength;
    if (total > MAX_POLICY_HTML_BYTES) {
      await reader.cancel().catch(() => {});
      clearTimeout(timeoutId);
      throw new Error(translate("net.tooLarge"));
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  clearTimeout(timeoutId);
  const html = new TextDecoder().decode(bytes);
  sourceByUrl.set(finalUrl.href, { url: finalUrl.href, text: html });
  const directText = decodeEntities(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  if (directText.length >= 300) return { html, finalUrl: finalUrl.href };
  trustedOrigins.add(finalUrl.origin);
  allowedAssetOrigins.add(finalUrl.origin);
  const linkedAssets = scriptUrls(html, finalUrl).filter(asset => asset.protocol === pageUrl.protocol && !asset.username && !asset.password).slice(0, MAX_POLICY_ASSETS);
  const linkedOrigins = [...new Set(linkedAssets.filter(asset => hostDetails(asset.hostname).site !== allowedSite.site).map(asset => asset.origin))].slice(0, 3);
  for (const origin of linkedOrigins) allowedAssetOrigins.add(origin);
  await Promise.all(linkedAssets.filter(trustedAssetOrigin).map(fetchAssetText));
  let sources = [...sourceByUrl.values()];
  let routeAssets = routeAssetUrls(sources, finalUrl, trustedOrigins).filter(asset => trustedAssetOrigin(asset) && !asset.username && !asset.password && !sourceByUrl.has(asset.href));
  await Promise.all(routeAssets.slice(0, MAX_POLICY_ASSETS - fetchedAssets.size).map(fetchAssetText));
  sources = [...sourceByUrl.values()];
  let policyHtml = policyHtmlFromBundles(sources, finalUrl);
  if (policyHtml) return { html: wrapPolicyHtml(policyHtml), finalUrl: finalUrl.href };
  routeAssets = routeAssetUrls(sources, finalUrl, trustedOrigins).filter(asset => trustedAssetOrigin(asset) && !asset.username && !asset.password && !sourceByUrl.has(asset.href));
  await Promise.all(routeAssets.slice(0, MAX_POLICY_ASSETS - fetchedAssets.size).map(fetchAssetText));
  sources = [...sourceByUrl.values()];
  policyHtml = policyHtmlFromBundles(sources, finalUrl);
  if (policyHtml) return { html: wrapPolicyHtml(policyHtml), finalUrl: finalUrl.href };
  return { html, finalUrl: finalUrl.href };
}

async function post(path, body, signal, language = "en") {
  const response = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: path === "/api/analyze/staged" ? "text/event-stream" : "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok) throw new Error(TosDecipherI18n.translate(language, "api.requestFailed"));
  return response;
}

async function sendToTab(tabId, message) {
  await chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

async function staged(text, tabId, url, runId, signal, language = "en") {
  const startedAt = performance.now();
  const requestId = crypto.randomUUID();
  logEvent("staged_request_started", { tabId, runId, requestId, url: safeUrl(url), textChars: text.length });
  let response;
  try {
    response = await post("/api/analyze/staged", { text, language, background: true, correlation_id: requestId }, signal, language);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Staged analysis request failed";
    logEvent("staged_transport_failed", { tabId, runId, requestId, url: safeUrl(url), elapsedMs: Math.round(performance.now() - startedAt), error: message.slice(0, 240) });
    throw error;
  }
  if (!response.body) throw new Error(TosDecipherI18n.translate(language, "api.noStream"));
  logEvent("staged_response_opened", { tabId, runId, url: safeUrl(url), status: response.status });
  await sendToTab(tabId, { type: "analysis-progress", stage: "fast_scan", message: "Fast scan is running. Waiting for initial findings.", url, runId });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawResult = false;
  let sawFull = false;
  let finished = false;
  let apiError = "";
  async function dispatch(block) {
    const lines = block.replace(/\r/g, "").split("\n");
    const type = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!type || !data) return;
    let parsed;
    try { parsed = JSON.parse(data); } catch { throw new Error(TosDecipherI18n.translate(language, "api.invalidData")); }
    logEvent("staged_event_received", { tabId, runId, requestId, url: safeUrl(url), event: type, elapsedMs: Math.round(performance.now() - startedAt) });
    if (type === "initial") {
      sawResult = true;
      await sendToTab(tabId, { type: "analysis-event", event: type, data: parsed, url, runId });
      await sendToTab(tabId, { type: "analysis-progress", stage: "full_review", message: "Initial findings are ready. Full review is running; waiting for verified findings.", url, runId });
    } else if (type === "full") {
      sawResult = true;
      sawFull = true;
      await sendToTab(tabId, { type: "analysis-event", event: type, data: parsed, url, runId });
    } else if (type === "error") {
      apiError = parsed.message || TosDecipherI18n.translate(language, "api.stagedFailed");
      await sendToTab(tabId, { type: "analysis-event", event: type, data: parsed, url, runId });
      finished = true;
    } else if (terminalEvents.has(type)) {
      finished = true;
    }
  }
  while (!finished) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const event of events) await dispatch(event);
    if (chunk.done) {
      if (buffer.trim()) await dispatch(buffer);
      break;
    }
  }
  if (apiError) {
    logEvent("staged_request_failed", { tabId, runId, requestId, url: safeUrl(url), elapsedMs: Math.round(performance.now() - startedAt), error: apiError });
    throw new Error(apiError);
  }
  if (!sawResult) {
    logEvent("staged_stream_incomplete", { tabId, runId, requestId, url: safeUrl(url), elapsedMs: Math.round(performance.now() - startedAt), sawInitial: false, sawFull });
    throw new Error(TosDecipherI18n.translate(language, "api.incompleteInitial"));
  }
  if (!sawFull) {
    logEvent("staged_stream_incomplete", { tabId, runId, requestId, url: safeUrl(url), elapsedMs: Math.round(performance.now() - startedAt), sawInitial: sawResult, sawFull });
    throw new Error(TosDecipherI18n.translate(language, "api.incompleteFull"));
  }
  logEvent("staged_request_completed", { tabId, runId, requestId, url: safeUrl(url), elapsedMs: Math.round(performance.now() - startedAt) });
}

function statusKey(tabId) {
  return `review:${tabId}`;
}

function saveStatus(tabId, status) {
  if (!status || typeof status !== "object") return Promise.resolve();
  const key = statusKey(tabId);
  const previous = statusWrites.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => chrome.storage.local.set({ [key]: { ...status, updatedAt: Date.now() } }));
  statusWrites.set(key, next);
  return next.finally(() => {
    if (statusWrites.get(key) === next) statusWrites.delete(key);
  });
}

chrome.tabs.onRemoved.addListener(tabId => {
  pendingStartTabs.delete(tabId);
  chrome.storage.local.remove(statusKey(tabId)).catch(() => {});
});

async function startPendingPermission(tabId, pending) {
  if (pendingStartTabs.has(tabId)) return;
  pendingStartTabs.add(tabId);
  const key = `permission-pending:${tabId}`;
  try {
    const saved = await chrome.storage.local.get(key);
    if (saved[key]?.pageUrl !== pending.pageUrl) return;
    const granted = await chrome.permissions.contains({ origins: pending.origins });
    if (!granted) return;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab?.url) {
      await chrome.storage.local.remove(key);
      return;
    }
    if (new URL(tab.url).href !== pending.pageUrl) {
      await chrome.storage.local.remove(key);
      return;
    }
    if (tab.status !== "complete") {
      await chrome.storage.local.set({ [key]: pending });
      return;
    }
    await chrome.storage.local.remove(key);
    await chrome.scripting.executeScript({ target: { tabId }, files: ["src/i18n.js", "src/content.js"] });
    const current = await chrome.tabs.sendMessage(tabId, { type: "get-status" }).catch(() => null);
    if (!current?.stage || current.pageUrl !== pending.pageUrl || ["complete", "error"].includes(current.stage)) {
      const stored = await chrome.storage.local.get("language");
      await chrome.tabs.sendMessage(tabId, { type: "start", restart: Boolean(current?.pageUrl === pending.pageUrl), language: TosDecipherI18n.resolveLanguage(stored.language) });
    }
  } catch (error) {
    logEvent("permission_auto_start_failed", { tabId, error: error instanceof Error ? error.message : String(error) });
  } finally {
    pendingStartTabs.delete(tabId);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [key, change] of Object.entries(changes)) {
    const match = key.match(/^permission-pending:(\d+)$/);
    if (match && change.newValue?.pageUrl && Array.isArray(change.newValue.origins)) {
      startPendingPermission(Number(match[1]), change.newValue);
    }
  }
});

async function resumePendingPermission(tabId) {
  const key = `permission-pending:${tabId}`;
  const stored = await chrome.storage.local.get(key);
  const pending = stored[key];
  if (!pending?.pageUrl || !Array.isArray(pending.origins)) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url || (tab.status === "complete" && new URL(tab.url).href !== pending.pageUrl)) {
    await chrome.storage.local.remove(key);
    return;
  }
  if (tab.status === "complete") await startPendingPermission(tabId, pending);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") resumePendingPermission(tabId).catch(error => logEvent("permission_auto_start_failed", { tabId, error: error instanceof Error ? error.message : String(error) }));
});

chrome.permissions.onAdded.addListener(() => {
  chrome.storage.local.get(null).then(stored => {
    for (const [key, pending] of Object.entries(stored)) {
      const match = key.match(/^permission-pending:(\d+)$/);
      if (match && pending?.pageUrl && Array.isArray(pending.origins)) startPendingPermission(Number(match[1]), pending);
    }
  }).catch(error => logEvent("permission_auto_start_failed", { error: error instanceof Error ? error.message : String(error) }));
});

const ALL_SITES = ["http://*/*", "https://*/*"];

function isBlockedHostname(hostname, blockedSites) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return blockedSites.some(site => host === site || host.endsWith(`.${site}`));
}

function legalSignalOnPage() {
  const pattern = /terms|privacy|polic(y|ies)|legal|cookie|condition|agreement|eula|\btos\b|licen[cs]e|subscription|billing|privacidad|t[eé]rminos|pol[ií]tica|condiciones|aviso|cookies/i;
  if (pattern.test(document.title) || pattern.test(location.pathname)) return true;
  return [...document.querySelectorAll("a[href]")].some(anchor => pattern.test(anchor.textContent || "") || pattern.test(anchor.getAttribute("href") || ""));
}

async function autoReview(tab) {
  if (!tab?.id || !tab.url) return;
  let pageUrl;
  try { pageUrl = new URL(tab.url); } catch { return; }
  if (!["http:", "https:"].includes(pageUrl.protocol)) return;
  const stored = await chrome.storage.local.get(["autoRun", "blockedSites", "language"]);
  if (!stored.autoRun) return;
  const blockedSites = Array.isArray(stored.blockedSites) ? stored.blockedSites : [];
  if (isBlockedHostname(pageUrl.hostname, blockedSites)) return;
  if (!await chrome.permissions.contains({ origins: ALL_SITES })) return;
  const [probe] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: legalSignalOnPage });
  if (!probe?.result) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/i18n.js", "src/content.js"] });
  await chrome.tabs.sendMessage(tab.id, { type: "start", restart: false, language: TosDecipherI18n.resolveLanguage(stored.language) }).catch(() => {});
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") autoReview(tab).catch(error => logEvent("auto_review_failed", { tabId, error: error instanceof Error ? error.message : String(error) }));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "auto-review-tab") return false;
  chrome.tabs.get(message.tabId).then(tab => autoReview(tab)).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab?.id) return false;
  const language = TosDecipherI18n.normalizeLanguage(message.language);
  if (message.type === "progress") {
    saveStatus(sender.tab.id, message.status).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === "fetch-policy") {
    const pageUrl = sender.url || sender.tab.url || "";
    const startedAt = performance.now();
    fetchPolicyHtml(message.url, pageUrl, language).then(result => {
      logEvent("policy_fetch_completed", { tabId: sender.tab.id, runId: message.runId || "unknown", url: safeUrl(message.url), finalUrl: safeUrl(result.finalUrl), htmlChars: result.html.length, durationMs: Math.round(performance.now() - startedAt) });
      sendResponse({ ok: true, ...result });
    }).catch(error => {
      const reason = error instanceof Error ? error.message : TosDecipherI18n.translate(language, "net.unreadable");
      logEvent("policy_fetch_failed", { tabId: sender.tab.id, runId: message.runId || "unknown", url: safeUrl(message.url), durationMs: Math.round(performance.now() - startedAt), error: reason.slice(0, 240) });
      sendResponse({ ok: false, error: reason });
    });
    return true;
  }
  if (message.type === "classify") {
    const tabId = sender.tab.id;
    const runId = message.runId || "unknown";
    const candidates = message.anchors || [];
    const correlationId = crypto.randomUUID();
    logEvent("anchor_classification_requested", { tabId, runId, correlationId, candidateCount: candidates.length, candidates: candidates.map(item => ({ id: item.id, label: (item.label || "").slice(0, 120), url: safeUrl(item.url) })) });
    const startedAt = performance.now();
    post("/api/extension/classify-anchors", { anchors: candidates, correlation_id: correlationId }).then(response => response.json()).then(data => {
      const results = data.classifications || [];
      logEvent("anchor_classification_returned", { tabId, runId, correlationId, candidateCount: candidates.length, likelyPolicy: results.filter(item => item.likelyPolicy).length, notPolicy: results.filter(item => !item.likelyPolicy).length, durationMs: Math.round(performance.now() - startedAt), results: results.map(item => ({ id: item.id, likelyPolicy: item.likelyPolicy, confidence: item.confidence })) });
      sendResponse(results);
    }).catch(error => {
      const messageText = error instanceof Error ? error.message : "Classification failed";
      logEvent("anchor_classification_failed", { tabId, runId, correlationId, candidateCount: candidates.length, durationMs: Math.round(performance.now() - startedAt), error: messageText.slice(0, 240) });
      sendResponse({ error: TosDecipherI18n.translate(language, "error.linkClassification") });
    });
    return true;
  }
  if (message.type === "classify-policy-types") {
    const tabId = sender.tab.id;
    const runId = message.runId || "unknown";
    const candidates = message.anchors || [];
    const correlationId = crypto.randomUUID();
    logEvent("policy_type_classification_requested", { tabId, runId, correlationId, candidateCount: candidates.length, candidates: candidates.map(item => ({ id: item.id, label: (item.label || "").slice(0, 120), url: safeUrl(item.url) })) });
    const startedAt = performance.now();
    post("/api/extension/classify-policy-types", { anchors: candidates, correlation_id: correlationId }).then(response => response.json()).then(data => {
      const results = data.classifications || [];
      logEvent("policy_type_classification_returned", { tabId, runId, correlationId, candidateCount: candidates.length, durationMs: Math.round(performance.now() - startedAt), results });
      sendResponse(results);
    }).catch(error => {
      const messageText = error instanceof Error ? error.message : "Policy type classification failed";
      logEvent("policy_type_classification_failed", { tabId, runId, correlationId, candidateCount: candidates.length, durationMs: Math.round(performance.now() - startedAt), error: messageText.slice(0, 240) });
      sendResponse({ error: TosDecipherI18n.translate(language, "error.typeClassification") });
    });
    return true;
  }
  if (message.type === "analyze") {
    for (const [key, promise] of inflight) {
      if (key.startsWith(`${sender.tab.id}:`) && !key.startsWith(`${sender.tab.id}:${message.runId}:`)) {
        promise.catch(() => {});
        inflight.delete(key);
      }
    }
    const key = `${sender.tab.id}:${message.runId}:${message.url}`;
    if (!inflight.has(key)) {
      const controller = new AbortController();
      inflight.set(key, staged(message.text, sender.tab.id, message.url, message.runId, controller.signal, language).finally(() => inflight.delete(key)));
    }
    inflight.get(key).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, message: error instanceof Error ? error.message : TosDecipherI18n.translate(language, "error.analysisFailed") }));
    return true;
  }
  return false;
});
