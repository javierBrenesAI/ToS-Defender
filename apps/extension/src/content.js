(function () {
  if (globalThis.__tosDecipherContent) return;
  const api = {};
  globalThis.__tosDecipherContent = api;
  const CLASSIFICATION_BATCH_SIZE = 100;
  const MAX_TEXT = 120000;
  const MAX_CONCURRENCY = 3;
  const MAX_PANEL_FINDINGS = 12;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SHIELD_PATH = "M12 2 20 5v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5z";
  const TONE_COLORS = { brand: "#3b4fd8", pending: "#64748b", clear: "#15803d", caution: "#c26a04", warning: "#dc2626", unrated: "#3b4fd8", error: "#64748b" };
  const TYPE_LABELS = { terms_of_service: "doc.typeTerms", privacy_policy: "doc.typePrivacy", subscription_or_billing: "doc.typeBilling", other: "doc.typeOther", unknown: "doc.typeOther" };
  const IMPACT_ORDER = ["important", "caution", "routine", "favorable"];
  const IMPACT_LABELS = { important: "impact.important", caution: "impact.caution", routine: "impact.routine", favorable: "impact.favorable" };
  const IMPACT_TONES = { important: "warning", caution: "caution", routine: "unrated", favorable: "clear" };
  const BADGE_CSS = ":host{all:initial;display:inline-block;vertical-align:middle;margin-left:.3em;line-height:0}button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;cursor:pointer;transition:transform .12s ease}button:hover{transform:scale(1.12)}button:focus-visible{outline:2px solid #3b4fd8;outline-offset:2px}svg{width:20px;height:20px;display:block;filter:drop-shadow(0 1px 1px rgba(15,23,42,.25))}.busy svg{animation:pulse 1.2s ease-in-out infinite}@keyframes pulse{50%{opacity:.4}}@media (prefers-reduced-motion:reduce){.busy svg{animation:none}button{transition:none}}";
  const UI_CSS = ":host{all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647}*{box-sizing:border-box}.panel{position:fixed;display:flex;flex-direction:column;max-height:min(480px,calc(100vh - 24px));background:#fff;color:#172033;border:1px solid #d6dbe6;border-radius:14px;box-shadow:0 18px 48px rgba(15,23,42,.22);font:13px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;overflow:hidden;outline:none}.panel[hidden],.pill[hidden]{display:none}header{display:flex;gap:10px;align-items:flex-start;padding:14px 14px 10px}header svg{width:26px;height:26px;flex:none}.titles{flex:1;min-width:0}h2{font-size:15px;line-height:1.3;margin:0;overflow-wrap:anywhere}.sub{margin:2px 0 0;color:#5b6678;font-size:11.5px;overflow-wrap:anywhere}.close{all:unset;flex:none;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;cursor:pointer;color:#5b6678;font-size:18px;line-height:1}.close:hover{background:#eef1f6}.close:focus-visible,.pill button:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid #3b4fd8;outline-offset:2px}.verdict{display:flex;gap:10px;align-items:flex-start;margin:0 14px 10px;padding:10px 12px;border-radius:10px;background:#f4f6fb}.verdict svg{width:22px;height:22px;flex:none}.verdict strong{display:block;font-size:13.5px}.verdict span{display:block;color:#3c4659;font-size:12px}.tone-warning.verdict{background:#fdeeee}.tone-caution.verdict{background:#fdf3e4}.tone-clear.verdict{background:#eaf6ee}.body{overflow-y:auto;padding:0 14px 6px;overscroll-behavior:contain}.status{display:flex;gap:8px;align-items:center;color:#5b6678;font-size:12px;margin:2px 0 10px}.spinner{width:12px;height:12px;flex:none;border-radius:50%;border:2px solid #cfd6e4;border-top-color:#3b4fd8;animation:spin .8s linear infinite}ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}li{border:1px solid #e3e7ef;border-radius:10px;padding:10px 12px}.level{display:flex;gap:6px;align-items:center;font-size:11px;font-weight:600;color:#3c4659;text-transform:uppercase;letter-spacing:.03em}.dot{width:8px;height:8px;border-radius:50%;flex:none}.explain{margin:5px 0 0;font-size:13.5px;font-weight:600;color:#172033}.means{margin:4px 0 0;color:#3c4659}.means b{font-weight:600}details{margin-top:6px}summary{cursor:pointer;color:#3b4fd8;font-size:12px;width:max-content}blockquote{margin:6px 0 0;padding:6px 10px;border-left:3px solid #d6dbe6;color:#4a5568;font-size:12px;font-style:italic;background:#fafbfd}.empty{color:#3c4659;margin:4px 0 10px}footer{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 14px;border-top:1px solid #eef1f6;color:#6b7588;font-size:11px}footer a{color:#3b4fd8;text-decoration:none;font-weight:600;white-space:nowrap}footer a:hover{text-decoration:underline}.pill{position:fixed;right:16px;bottom:16px;display:flex;align-items:center;background:#fff;border:1px solid #d6dbe6;border-radius:999px;box-shadow:0 8px 24px rgba(15,23,42,.18);font:12.5px/1.3 system-ui,-apple-system,'Segoe UI',sans-serif;color:#172033}.pill .open{all:unset;display:flex;gap:8px;align-items:center;padding:7px 4px 7px 9px;cursor:pointer;border-radius:999px}.pill .open svg{width:20px;height:20px;flex:none}.pill .open small{display:block;color:#5b6678;font-size:11px}.pill .dismiss{all:unset;width:24px;height:24px;margin-right:6px;display:grid;place-items:center;border-radius:50%;cursor:pointer;color:#5b6678;font-size:15px}.pill .dismiss:hover{background:#eef1f6}.busy svg{animation:pulse 1.2s ease-in-out infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{50%{opacity:.4}}@media (prefers-reduced-motion:reduce){.spinner,.busy svg{animation:none}}";
  let generation = "";
  let language = "en";
  let hasStarted = false;
  const t = (key, vars) => TosDecipherI18n.translate(language, key, vars);
  let observer;
  let debounceTimer;
  let scanning = false;
  let pagePhaseComplete = false;
  let pageOutcome = () => "";
  let pageDoc = null;
  let badgeEntries = new WeakMap();
  let uiHost;
  let panel;
  let pill;
  let pillOpen;
  let openPanel = null;
  let placeFrame = 0;
  const states = new Map();
  const activeUrls = new Set();
  const discoveredUrls = new Set();
  const linkRecords = new Map();
  const disclosureRecords = new Map();
  const disclosureTargets = new Map();
  const disclosureUrls = new WeakMap();
  const disclosureIds = new WeakMap();
  let activatedDisclosureControls = new WeakSet();
  let disclosureSequence = 0;
  const reviewErrors = [];
  const linkStats = { found: 0, classified: 0, policyCandidates: 0 };
  let pageReview = "not-checked";
  let currentStatus = { stage: "checking_page", message: t("status.ready"), pageUrl: location.href, links: linkStats, documents: [], linkResults: [], timeline: [] };
  let timelineEntries = [];
  let statusText = () => t("status.ready");
  let statusKind = "status";

  const MULTI_LABEL_SUFFIXES = new Set(["ac.uk", "co.uk", "gov.uk", "org.uk", "com.au", "net.au", "org.au", "edu.au", "gov.au", "co.jp", "ne.jp", "or.jp", "co.nz", "com.br", "com.cn", "com.hk", "com.sg", "co.in", "firm.in", "net.in", "org.in", "com.mx", "com.tr", "co.za", "com.tw", "co.kr"]);
  const SHARED_HOST_SUFFIXES = new Set(["github.io", "gitlab.io", "pages.dev", "vercel.app", "netlify.app", "herokuapp.com", "web.app", "firebaseapp.com", "cloudfront.net", "azurewebsites.net", "blogspot.com", "wordpress.com", "myshopify.com", "wixsite.com", "squarespace.com"]);
  const COMMON_SECOND_LEVELS = new Set(["ac", "co", "com", "edu", "firm", "gen", "go", "gov", "id", "mil", "ne", "net", "nom", "or", "org", "res", "sch"]);

  function siteDetails(hostname) {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    const labels = host.split(".");
    const isIp = host.includes(":") || (labels.length === 4 && labels.every(label => /^\d+$/.test(label) && Number(label) <= 255));
    const suffix = labels.slice(-2).join(".");
    if (host === "localhost" || isIp || labels.length < 2 || SHARED_HOST_SUFFIXES.has(suffix)) return { site: host, exact: true };
    const publicSuffixLength = MULTI_LABEL_SUFFIXES.has(suffix) || (labels.at(-1).length === 2 && COMMON_SECOND_LEVELS.has(labels.at(-2))) ? 2 : 1;
    if (labels.length <= publicSuffixLength) return { site: host, exact: true };
    return { site: labels.slice(-(publicSuffixLength + 1)).join("."), exact: false };
  }

  function sameSite(urlValue) {
    try {
      const url = new URL(urlValue);
      if (!["http:", "https:"].includes(url.protocol) || url.protocol !== location.protocol || url.port !== location.port) return false;
      const pageSite = siteDetails(location.hostname);
      const linkSite = siteDetails(url.hostname);
      return pageSite.site === linkSite.site && (pageSite.exact === linkSite.exact || (!pageSite.exact && !linkSite.exact));
    } catch {
      return false;
    }
  }

  function anchorUrl(anchor) {
    try { return new URL(anchor.href, location.href); } catch { return null; }
  }

  function normalizedHref(anchor) {
    return anchorUrl(anchor)?.href.split("#")[0] || "";
  }

  function labelFor(anchor) {
    return (anchor.textContent || anchor.getAttribute("aria-label") || anchor.getAttribute("title") || "").replace(/\s+/g, " ").trim();
  }

  function safeUrl(value) {
    if (typeof value === "string" && value.startsWith("tos-decipher://")) return "[in-page legal disclosure]";
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`.slice(0, 500);
    } catch {
      return "[invalid URL]";
    }
  }

  function displayLabel(value) {
    return (value || t("ui.untitledLink")).replace(/[\r\n\t]+/g, " ").slice(0, 120);
  }

  function logEvent(event, details = {}) {
    console.info("tos_decipher_event", JSON.stringify({ event, runId: generation, at: new Date().toISOString(), ...details }));
  }

  function stats() {
    const links = [...linkRecords.values()];
    const reviews = [...links, ...disclosureRecords.values()];
    return {
      found: links.length,
      classified: links.filter(item => item.classification === "likely-policy" || item.classification === "not-policy").length,
      policyCandidates: links.filter(item => item.classification === "likely-policy").length,
      reviewsQueued: reviews.filter(item => item.review === "queued").length,
      reviewsActive: reviews.filter(item => item.review === "fetching" || item.review === "analyzing").length,
      reviewsSucceeded: reviews.filter(item => item.review === "succeeded").length,
      reviewsFailed: reviews.filter(item => item.review === "failed").length,
      classificationFailed: links.filter(item => item.classification === "error").length,
      pageReview,
    };
  }

  function snapshotRecords() {
    return [...linkRecords.values()].map(({ id, label, displayUrl, classification, review, error }) => ({ id, label, displayUrl, classification, review, ...(error ? { error } : {}) }));
  }

  function documentFor(url) {
    if (pageDoc && pageDoc.url === url) return pageDoc;
    if (disclosureRecords.has(url)) return disclosureRecords.get(url);
    const record = linkRecords.get(url);
    return record?.classification === "likely-policy" ? record : null;
  }

  function policyDocuments() {
    return [pageDoc, ...[...linkRecords.values()].filter(record => record.classification === "likely-policy"), ...disclosureRecords.values()].filter(Boolean);
  }

  function typeLabel(doc) {
    const type = doc.analysis?.policyType && doc.analysis.policyType !== "unknown" ? doc.analysis.policyType : doc.policyType;
    return t(TYPE_LABELS[type] || TYPE_LABELS.other);
  }

  function impactCounts(doc) {
    const findings = doc.analysis?.findings || [];
    return { important: findings.filter(item => item.impact === "important").length, caution: findings.filter(item => item.impact === "caution").length, total: findings.length };
  }

  function docError(doc) {
    return doc.errorKey ? t(doc.errorKey) : doc.error;
  }

  function viewOf(doc) {
    const analysis = doc.analysis;
    if (!analysis) {
      if (doc.review === "failed") return {
        tone: "error",
        label: t("doc.failedLabel"),
        detail: doc.fetchFailed
          ? t("doc.fetchFailed")
                : t("doc.reviewFailed", { error: docError(doc) || t("doc.reviewIncomplete") }),
        busy: false,
      };
      return { tone: "pending", label: doc.review === "queued" ? t("doc.waiting") : t("doc.reading"), detail: t("doc.readingDetail"), busy: true };
    }
    const counts = impactCounts(doc);
    const provisional = analysis.event !== "full";
    const busy = provisional && doc.review !== "failed";
    const rating = analysis.rating || "unrated";
    const views = {
      warning: { label: t("view.warningLabel"), detail: t("view.warningDetail", { points: t("count.point", { count: counts.important }) }) },
      caution: { label: t("view.cautionLabel"), detail: t("view.cautionDetail", { points: t("count.point", { count: counts.caution }) }) },
      clear: { label: t("view.cleanLabel"), detail: t("view.cleanDetail") },
      unrated: { label: counts.total ? t("view.summaryLabel") : t("view.noTermsLabel"), detail: counts.total ? t("view.summaryDetail") : t("view.noTermsDetail") },
    };
    const view = views[rating] || views.unrated;
    const note = provisional ? (busy ? t("view.quickScan") : t("view.quickScanDone")) : "";
    return { tone: rating === "unrated" ? "unrated" : rating, label: view.label, detail: `${view.detail}${note}`, busy, provisional };
  }

  function documentsSnapshot() {
    return policyDocuments().map(doc => {
      const view = viewOf(doc);
      const counts = impactCounts(doc);
      const top = [...(doc.analysis?.findings || [])].sort(compareFindings)[0];
      return { url: doc.url, label: doc.label, displayUrl: doc.displayUrl, isPage: Boolean(doc.isPage), type: typeLabel(doc), tone: view.tone, verdict: view.label, busy: view.busy, provisional: Boolean(view.provisional), review: doc.review, fetchFailed: Boolean(doc.fetchFailed), ...(docError(doc) ? { error: docError(doc) } : {}), important: counts.important, caution: counts.caution, total: counts.total, headline: top?.explanation || "" };
    });
  }

  function compareFindings(left, right) {
    const rank = item => { const index = IMPACT_ORDER.indexOf(item.impact); return index === -1 ? IMPACT_ORDER.length : index; };
    return rank(left) - rank(right) || (right.impactScore ?? 0) - (left.impactScore ?? 0);
  }

  function svgElement(tag, attributes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function shieldIcon(tone) {
    const svg = svgElement("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
    svg.append(svgElement("path", { d: SHIELD_PATH, fill: TONE_COLORS[tone] || TONE_COLORS.brand }));
    if (tone === "clear") svg.append(svgElement("path", { d: "M8.4 12.3 11 14.9l4.8-5.1", fill: "none", stroke: "#fff", "stroke-width": "2.2", "stroke-linecap": "round", "stroke-linejoin": "round" }));
    else if (tone === "caution" || tone === "warning") svg.append(svgElement("path", { d: "M12 7.6v5.3", stroke: "#fff", "stroke-width": "2.3", "stroke-linecap": "round" }), svgElement("circle", { cx: "12", cy: "16.2", r: "1.35", fill: "#fff" }));
    else if (tone === "error") svg.append(svgElement("path", { d: "M8.8 12h6.4", stroke: "#fff", "stroke-width": "2.2", "stroke-linecap": "round" }));
    else svg.append(svgElement("path", { d: "M8.5 7h4.9l2.1 2.1V17h-7z", fill: "#fff" }), svgElement("path", { d: "M10 11h4v.9h-4zm0 1.9h4v.9h-4zm0 1.9h2.6v.9H10z", fill: TONE_COLORS[tone] || TONE_COLORS.brand }));
    return svg;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function anchorsFor(url) {
    const disclosureTrigger = disclosureTargets.get(url)?.trigger;
    if (disclosureTrigger?.isConnected) return [disclosureTrigger];
    return [...document.querySelectorAll("a[href]")].filter(anchor => !anchor.closest("[data-tos-decipher-ui]") && normalizedHref(anchor) === url);
  }

  function openDocumentPanel(url, trigger) {
    const doc = documentFor(url);
    if (!doc) return false;
    if (doc.isPage) {
      renderDocument(url);
      openPanelFor(url, pill, pillOpen);
      return true;
    }
    renderDocument(url);
    const anchor = trigger || anchorsFor(url).find(node => node.getClientRects().length > 0) || anchorsFor(url)[0];
    const entry = anchor ? badgeEntries.get(anchor) : null;
    anchor?.scrollIntoView({ block: "center", behavior: "smooth" });
    openPanelFor(url, entry?.host || null, entry?.button || null);
    return true;
  }

  function badgeFor(anchor) {
    const existing = badgeEntries.get(anchor);
    if (existing?.host.isConnected) return existing;
    const host = document.createElement("span");
    host.dataset.tosDecipherBadge = "";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = BADGE_CSS;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    shadow.append(style, button);
    const entry = { host, button, url: "" };
    host.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      togglePanel(entry.url, host, button);
    });
    anchor.insertAdjacentElement("afterend", host);
    badgeEntries.set(anchor, entry);
    return entry;
  }

  function paintBadge(entry, doc, view) {
    entry.url = doc.url;
    entry.button.classList.toggle("busy", view.busy);
    entry.button.replaceChildren(shieldIcon(view.tone));
    const description = t("badge.description", { type: typeLabel(doc), view: view.label });
    entry.button.setAttribute("aria-label", `${doc.label}. ${description}`);
    entry.button.title = t("badge.title", { view: view.label });
  }

  function ensureUi() {
    if (uiHost?.isConnected) return;
    uiHost = document.createElement("div");
    uiHost.dataset.tosDecipherUi = "";
    const root = uiHost.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = UI_CSS;
    panel = element("section", "panel");
    panel.hidden = true;
    panel.tabIndex = -1;
    panel.setAttribute("role", "dialog");
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closePanel(true);
      }
    });
    pill = element("div", "pill");
    pill.hidden = true;
    pillOpen = element("button", "open");
    pillOpen.type = "button";
    pillOpen.setAttribute("aria-haspopup", "dialog");
    pillOpen.setAttribute("aria-expanded", "false");
    pillOpen.addEventListener("click", () => { if (pageDoc) togglePanel(pageDoc.url, pill, pillOpen); });
    const dismiss = element("button", "dismiss", "×");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", t("ui.hide"));
    dismiss.addEventListener("click", () => {
      if (pageDoc && openPanel?.url === pageDoc.url) closePanel(false);
      pill.hidden = true;
    });
    pill.append(pillOpen, dismiss);
    root.append(style, panel, pill);
    document.documentElement.append(uiHost);
  }

  function setExpanded(value) {
    openPanel?.button?.setAttribute("aria-expanded", String(value));
  }

  function togglePanel(url, trigger, button) {
    if (!url) return;
    if (openPanel && openPanel.url === url && openPanel.trigger === trigger) {
      closePanel(false);
      return;
    }
    openPanelFor(url, trigger, button);
  }

  function openPanelFor(url, trigger, button) {
    ensureUi();
    setExpanded(false);
    openPanel = { url, trigger, button };
    setExpanded(true);
    panel.hidden = false;
    renderPanel(true);
    placePanel();
    panel.focus({ preventScroll: true });
    logEvent("panel_opened", { url: safeUrl(url) });
  }

  function closePanel(restoreFocus) {
    if (!openPanel) return;
    const { button } = openPanel;
    setExpanded(false);
    openPanel = null;
    if (panel) panel.hidden = true;
    if (restoreFocus) button?.focus({ preventScroll: true });
  }

  function placePanel() {
    if (!openPanel || !panel || panel.hidden) return;
    const margin = 12;
    const width = Math.min(360, window.innerWidth - margin * 2);
    panel.style.width = `${width}px`;
    const height = panel.offsetHeight;
    const rect = openPanel.trigger?.isConnected ? openPanel.trigger.getBoundingClientRect() : null;
    let left = window.innerWidth - width - 16;
    let top = window.innerHeight - height - 16;
    if (rect && rect.width + rect.height > 0) {
      left = rect.left + rect.width / 2 - width / 2;
      const below = rect.bottom + 8;
      const above = rect.top - 8 - height;
      top = below + height <= window.innerHeight - margin || above < margin ? below : above;
    }
    left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - width - margin));
    top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  function schedulePlacement() {
    if (!openPanel || placeFrame) return;
    placeFrame = requestAnimationFrame(() => {
      placeFrame = 0;
      placePanel();
    });
  }

  function renderPanel(reset = false) {
    if (!openPanel || !panel) return;
    const doc = documentFor(openPanel.url);
    if (!doc) {
      closePanel(false);
      return;
    }
    const previousBody = panel.querySelector(".body");
    const scrollTop = reset ? 0 : previousBody?.scrollTop || 0;
    const openQuotes = reset ? new Set() : new Set([...panel.querySelectorAll("details[open]")].map(node => node.dataset.key));
    const view = viewOf(doc);
    panel.setAttribute("aria-label", t("ui.panelLabel", { label: doc.label }));
    const header = element("header");
    const titles = element("div", "titles");
    titles.append(element("h2", "", doc.label), element("p", "sub", `${typeLabel(doc)} · ${doc.displayUrl}`));
    const close = element("button", "close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("ui.close"));
    close.addEventListener("click", () => closePanel(true));
    header.append(shieldIcon("brand"), titles, close);
    const verdict = element("div", `verdict tone-${view.tone}`);
    const verdictText = element("div");
    verdictText.append(element("strong", "", view.label), element("span", "", view.detail));
    verdict.append(shieldIcon(view.tone), verdictText);
    const body = element("div", "body");
    if (view.busy) {
      const status = element("div", "status");
      status.setAttribute("role", "status");
      status.append(element("span", "spinner"), element("span", "", doc.analysis ? t("ui.verifying") : t("ui.reading")));
      body.append(status);
    }
    const findings = [...(doc.analysis?.findings || [])].sort(compareFindings).slice(0, MAX_PANEL_FINDINGS);
    if (findings.length) {
      const list = element("ol");
      for (const finding of findings) {
        const item = element("li");
        const level = element("div", "level");
        const dot = element("span", "dot");
        dot.style.background = TONE_COLORS[IMPACT_TONES[finding.impact]] || TONE_COLORS.pending;
        level.append(dot, element("span", "", t(IMPACT_LABELS[finding.impact] || "impact.notRated")));
        item.append(level, element("p", "explain", finding.explanation || t("ui.fallbackPoint")));
        if (finding.implication) {
          const means = element("p", "means");
          means.append(element("b", "", t("ui.means")), document.createTextNode(finding.implication));
          item.append(means);
        }
        if (finding.excerpt) {
          const quote = element("details");
          quote.dataset.key = finding.excerpt.slice(0, 80);
          quote.open = openQuotes.has(quote.dataset.key);
          quote.append(element("summary", "", t("ui.saysQuote")), element("blockquote", "", `“${finding.excerpt}”`));
          item.append(quote);
        }
        list.append(item);
      }
      body.append(list);
    } else if (!view.busy) {
      body.append(element("p", "empty", doc.analysis ? t("ui.noPoints") : view.detail));
    }
    const footer = element("footer");
    footer.append(element("span", "", t("ui.footer")));
    if (!doc.isPage) {
      const link = element("a", "", doc.fetchFailed ? t("doc.openTab") : t("doc.openDocument"));
      link.href = doc.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      footer.append(link);
    }
    panel.replaceChildren(header, verdict, body, footer);
    body.scrollTop = scrollTop;
    placePanel();
  }

  function renderPagePill(doc, view) {
    ensureUi();
    pillOpen.classList.toggle("busy", view.busy);
    const text = element("span");
    text.append(document.createTextNode(t("doc.pageIs", { type: typeLabel(doc).toLowerCase() })), element("small", "", t("ui.pillSummary", { view: view.label })));
    pillOpen.replaceChildren(shieldIcon(view.tone), text);
    pillOpen.setAttribute("aria-label", t("ui.pillLabel", { type: typeLabel(doc).toLowerCase(), view: view.label }));
    pill.hidden = false;
  }

  function renderDocument(url) {
    const doc = documentFor(url);
    if (!doc) return;
    const view = viewOf(doc);
    if (doc.isPage) renderPagePill(doc, view);
    else for (const anchor of anchorsFor(url)) paintBadge(badgeFor(anchor), doc, view);
    if (openPanel?.url === url) renderPanel();
  }

  function refreshBadges() {
    for (const doc of policyDocuments()) if (!doc.isPage) renderDocument(doc.url);
  }

  function revealDocument(url) {
    const doc = documentFor(url);
    const trigger = disclosureTargets.get(url)?.trigger;
    return openDocumentPanel(url, trigger);
  }

  function clearUi() {
    closePanel(false);
    document.querySelectorAll("[data-tos-decipher-badge]").forEach(node => node.remove());
    badgeEntries = new WeakMap();
    if (pill) pill.hidden = true;
  }

  function normalizeAnalysis(data, event) {
    return {
      event,
      title: data.title || "",
      policyType: data.policyType || "unknown",
      overview: data.overview || "",
      rating: data.rating || "unrated",
      findings: (data.findings || []).map(finding => ({ category: finding.category, explanation: finding.explanation, implication: finding.implication, impact: finding.impact || null, impactScore: typeof finding.impactScore === "number" ? finding.impactScore : null, excerpt: finding.citation?.excerpt || "" })),
    };
  }

  function publish(stage, text, extra = {}, kind = stage === "error" ? "error" : "status") {
    const last = timelineEntries[timelineEntries.length - 1];
    if (!last || last.kind !== kind || last.text() !== text()) timelineEntries = [...timelineEntries, { text, kind, at: Date.now() }].slice(-8);
    statusText = text;
    statusKind = kind;
    currentStatus = {
      ...currentStatus,
      ...extra,
      stage,
      message: text(),
      pageUrl: location.href,
      links: stats(),
      documents: documentsSnapshot(),
      linkResults: snapshotRecords(),
      timeline: timelineEntries.map(entry => ({ message: entry.text(), kind: entry.kind, at: entry.at })),
    };
    chrome.runtime.sendMessage({ type: "progress", status: currentStatus }).catch(() => {});
  }

  function extractText(documentText) {
    const root = documentText.querySelector("article, main, [role='main']") || documentText.body;
    if (!root) return "";
    const clone = root.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, nav, footer, header, form, [data-tos-decipher-badge], [data-tos-decipher-ui]").forEach(node => node.remove());
    const disclosures = documentText === document ? disclosureCandidates().filter(item => root.contains(item.target)).map(item => item.text) : [];
    const pageText = (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim();
    return [...new Set([pageText, ...disclosures])].filter(Boolean).join(" ").slice(0, MAX_TEXT);
  }

  async function classify(items) {
    const startedAt = performance.now();
    const classifications = await chrome.runtime.sendMessage({ type: "classify", runId: generation, language, anchors: items.map(({ anchor, isDisclosure, text, control, target, policyType, ...item }) => item) });
    if (classifications?.error) throw new Error(classifications.error);
    if (!Array.isArray(classifications)) throw new Error(t("error.classifierInvalid"));
    const ids = new Set(items.map(item => item.id));
    if (classifications.length !== items.length || new Set(classifications.map(result => result.id)).size !== items.length || classifications.some(result => !ids.has(result.id) || typeof result.likelyPolicy !== "boolean" || typeof result.confidence !== "number")) throw new Error(t("error.classifierIncomplete"));
    logEvent("classification_response_received", { count: classifications.length, likelyPolicy: classifications.filter(result => result.likelyPolicy).length, notPolicy: classifications.filter(result => !result.likelyPolicy).length, durationMs: Math.round(performance.now() - startedAt) });
    return classifications;
  }

  async function classifyTypes(items) {
    const startedAt = performance.now();
    const classifications = await chrome.runtime.sendMessage({ type: "classify-policy-types", runId: generation, language, anchors: items.map(({ anchor, isDisclosure, text, control, target, policyType, ...item }) => item) });
    if (classifications?.error) throw new Error(classifications.error);
    if (!Array.isArray(classifications)) throw new Error(t("error.typeInvalid"));
    const ids = new Set(items.map(item => item.id));
    if (classifications.length !== items.length || new Set(classifications.map(result => result.id)).size !== items.length || classifications.some(result => !ids.has(result.id) || typeof result.policyType !== "string")) throw new Error(t("error.typeIncomplete"));
    logEvent("policy_type_classification_response_received", { count: classifications.length, durationMs: Math.round(performance.now() - startedAt) });
    return classifications;
  }

  async function processItem(item, text, runId, isLink) {
    if (runId !== generation || activeUrls.has(item.url)) return;
    activeUrls.add(item.url);
    states.set(item.url, item);
    const record = isLink ? linkRecords.get(item.url) || disclosureRecords.get(item.url) : pageDoc;
    if (record) record.review = "analyzing";
    logEvent("review_started", { url: safeUrl(item.url), label: item.label.slice(0, 120), extractedChars: text.length, isLink });
    renderDocument(item.url);
    if (isLink) publish("fast_scan", () => t("status.reading", { label: item.label || t("ui.policyFallback") }));
    else {
      pageReview = "admitted";
      publish("fast_scan", () => t("status.pageTranslating"));
    }
    try {
      const result = await chrome.runtime.sendMessage({ type: "analyze", url: item.url, text, runId, language });
      if (!result?.ok && runId === generation) throw new Error(result?.message || t("error.analysisFailed"));
      if (record) {
        record.review = "succeeded";
        record.error = "";
      }
      if (!isLink) pageReview = "succeeded";
      logEvent("review_succeeded", { url: safeUrl(item.url), isLink });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("error.analyzeFailed");
      const alreadyReported = record?.review === "failed";
      if (record) {
        record.review = "failed";
        record.error = message.slice(0, 240);
      }
      if (!isLink) pageReview = "failed";
      if (!alreadyReported) {
        reviewErrors.push(`${item.label || "Policy page"}: ${message}`);
        logEvent("review_failed", { url: safeUrl(item.url), error: message.slice(0, 240), isLink });
      }
      if (runId === generation) publish("scanning_links", () => t("status.failed", { label: item.label || t("ui.policyReview"), error: message }), {}, "error");
    } finally {
      activeUrls.delete(item.url);
      if (runId === generation) renderDocument(item.url);
      if (runId === generation && disclosureRecords.has(item.url) && hasPendingDisclosures()) schedule();
      if (runId === generation && pagePhaseComplete && !scanning) publish("scanning_links", () => t("status.reviewsProgress", { succeeded: stats().reviewsSucceeded, failed: stats().reviewsFailed, queued: stats().reviewsQueued }));
    }
  }

  async function scanLinks(runId) {
    if (scanning || runId !== generation || !pagePhaseComplete) return;
    scanning = true;
    try {
      while (runId === generation) {
        const items = candidates();
        if (!items.length) break;
        const batches = [];
        for (let offset = 0; offset < items.length; offset += CLASSIFICATION_BATCH_SIZE) batches.push(items.slice(offset, offset + CLASSIFICATION_BATCH_SIZE));
        const legalItems = [];
        let classifiedCount = 0;
        let notPolicyCount = 0;
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
          const batch = batches[batchIndex];
          for (const item of batch) {
            discoveredUrls.add(item.url);
            linkRecords.set(item.url, { id: item.id, url: item.url, label: displayLabel(item.label), displayUrl: safeUrl(item.url), classification: "pending", policyType: "other", review: "not-selected", error: "", analysis: null });
          }
          linkStats.found = discoveredUrls.size;
          logEvent("links_discovered", { batchSize: batch.length, batchIndex: batchIndex + 1, batchCount: batches.length, totalFound: discoveredUrls.size, candidates: batch.map(item => ({ id: item.id, label: item.label.slice(0, 120), url: safeUrl(item.url) })) });
          publish("scanning_links", () => t("status.checkingLinks", { links: t("count.link", { count: linkRecords.size }) }));
          try {
            logEvent("legal_classification_started", { batchIndex: batchIndex + 1, batchCount: batches.length, count: batch.length, candidates: batch.map(item => ({ id: item.id, label: item.label.slice(0, 120), url: safeUrl(item.url) })) });
            const results = await classify(batch);
            if (runId !== generation) return;
            const byId = new Map(batch.map(item => [item.id, item]));
            for (const result of results) {
              const item = byId.get(result.id);
              const record = item ? linkRecords.get(item.url) : null;
              if (!item || !record) continue;
              record.confidence = result.confidence;
              if (result.likelyPolicy) {
                record.classification = "likely-policy";
                record.review = "queued";
                legalItems.push(item);
              } else {
                record.classification = "not-policy";
                notPolicyCount += 1;
              }
            }
            classifiedCount += batch.length;
            linkStats.classified += batch.length;
            logEvent("legal_classification_batch_completed", { batchIndex: batchIndex + 1, batchCount: batches.length, classified: batch.length, likelyPolicy: results.filter(result => result.likelyPolicy).length, notPolicy: results.filter(result => !result.likelyPolicy).length });
          } catch (error) {
            const message = error instanceof Error ? error.message : t("error.linkClassification");
            for (const item of batch) {
              const record = linkRecords.get(item.url);
              if (record) {
                record.classification = "error";
                record.error = message.slice(0, 240);
              }
            }
            reviewErrors.push(message);
            logEvent("classification_failed", { batchIndex: batchIndex + 1, count: batch.length, error: message.slice(0, 240) });
            publish("error", () => t("status.couldNotCheck", { links: t("count.link", { count: batch.length }), error: message }), {}, "error");
          }
        }
        if (runId !== generation) return;
        const typeResults = [];
        const typeErrors = new Map();
        for (let offset = 0; offset < legalItems.length; offset += CLASSIFICATION_BATCH_SIZE) {
          const batch = legalItems.slice(offset, offset + CLASSIFICATION_BATCH_SIZE);
          try {
            typeResults.push(...await classifyTypes(batch));
          } catch (error) {
            const message = error instanceof Error ? error.message : t("error.typeClassification");
            for (const item of batch) typeErrors.set(item.url, message);
            reviewErrors.push(message);
            logEvent("policy_type_classification_failed", { batchIndex: Math.floor(offset / CLASSIFICATION_BATCH_SIZE) + 1, count: batch.length, error: message.slice(0, 240) });
            publish("error", () => t("status.couldNotIdentify", { types: t("count.policyType", { count: batch.length }), error: message }), {}, "error");
          }
        }
        if (runId !== generation) return;
        const typesById = new Map(typeResults.map(result => [result.id, result.policyType]));
        for (const item of legalItems) {
          const record = linkRecords.get(item.url);
          const typeError = typeErrors.get(item.url);
          if (typeError && record) {
            record.classification = "error";
            record.review = "not-selected";
            record.error = typeError.slice(0, 240);
          } else if (record) {
            record.policyType = typesById.get(item.id) || "other";
            renderDocument(item.url);
          }
        }
        linkStats.policyCandidates += legalItems.length;
        logEvent("classification_completed", { found: discoveredUrls.size, classified: classifiedCount, likelyPolicy: legalItems.length, notPolicy: notPolicyCount, typeResults });
        publish("scanning_links", () => legalItems.length ? t("status.foundLinks", { links: t("count.termsLink", { count: legalItems.length }) }) : t("status.noneFound", { links: t("count.link", { count: classifiedCount }) }));
        const reviewItems = legalItems.filter(item => !typeErrors.has(item.url));
        let next = 0;
        async function worker() {
          while (next < reviewItems.length && runId === generation) {
            const item = reviewItems[next++];
            const record = linkRecords.get(item.url);
            if (record) record.review = "fetching";
            logEvent("policy_fetch_started", { id: item.id, label: item.label.slice(0, 120), url: safeUrl(item.url) });
            publish("extracting", () => t("status.opening", { label: item.label || t("ui.policyFallback"), next, total: reviewItems.length }));
            renderDocument(item.url);
            try {
              const fetched = await chrome.runtime.sendMessage({ type: "fetch-policy", url: item.url, runId, language });
              if (!fetched?.ok) throw new Error(fetched?.error || t("error.fetchFailed"));
              const text = extractText(new DOMParser().parseFromString(fetched.html, "text/html"));
              logEvent("policy_text_extracted", { id: item.id, url: safeUrl(item.url), finalUrl: safeUrl(fetched.finalUrl), htmlChars: fetched.html.length, extractedChars: text.length });
              if (record) record.sourceUrl = fetched.finalUrl;
              if (text.length < 80) throw new Error(t("error.notEnoughText"));
              await processItem(item, text, runId, true);
            } catch (error) {
              const message = error instanceof Error ? error.message : t("error.couldNotRead");
              if (record && record.review !== "failed") {
                record.review = "failed";
                record.fetchFailed = true;
                record.error = message.slice(0, 240);
                reviewErrors.push(`${item.label || "A policy link"}: ${message}`);
                logEvent("policy_fetch_failed", { id: item.id, url: safeUrl(item.url), error: message.slice(0, 240) });
                publish("scanning_links", () => t("status.couldNotRead", { label: item.label || t("ui.policyFallback"), error: message }), {}, "error");
              }
              renderDocument(item.url);
            }
          }
        }
        if (reviewItems.length) await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, reviewItems.length) }, worker));
      }
      if (runId === generation) {
        await scanDisclosures(runId);
        const totals = stats();
        const stage = reviewErrors.length ? "error" : "complete";
        const documents = policyDocuments();
        const reviewed = documents.filter(doc => doc.review === "succeeded").length;
        const failed = documents.filter(doc => doc.review === "failed").length;
        const outcome = () => totals.classificationFailed > 0
          ? t("status.linksUnchecked", { links: t("count.link", { count: totals.classificationFailed }) })
          : documents.length === 0
            ? t("status.noPolicies", { links: t("count.link", { count: totals.found }) })
            : t("status.outcome", { reviewed, documents: t("count.document", { count: documents.length }), failed: failed ? t("status.failedPart", { count: failed }) : "" });
        logEvent("run_completed", { ...totals, reviewErrors: reviewErrors.length });
        const pageText = pageOutcome;
        publish(stage, () => `${pageText()} ${outcome()}`.trim());
      }
    } finally {
      scanning = false;
      if (runId === generation && pagePhaseComplete && (candidates().length || hasPendingDisclosures())) schedule();
    }
  }

  function isLegalLink(item) {
    const text = `${item.label} ${item.url}`.toLowerCase();
    return /privacy|cookie|legal|terms?|tos|dpa|data.processing|acceptable.use|refund|billing|subscription|user.agreement|service.agreement|condiciones|t[eé]rminos|pol[ií]tica|privacidad/.test(text);
  }

  function candidates() {
    const seen = new Set();
    const items = [...document.querySelectorAll("a[href]")].filter(anchor => !anchor.closest("[data-tos-decipher-ui]")).map((anchor, index) => {
      const normalizedUrl = normalizedHref(anchor);
      return { anchor, id: `a-${index}`, label: (labelFor(anchor) || normalizedUrl).slice(0, 240), url: normalizedUrl };
    }).filter(item => {
      if (!item.url || item.url.length > 4000 || !sameSite(item.url) || item.url === location.href.split("#")[0] || discoveredUrls.has(item.url) || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
    return items.sort((left, right) => Number(isLegalLink(right)) - Number(isLegalLink(left)));
  }

  function disclosureContext(control) {
    let ancestor = control.parentElement;
    for (let depth = 0; ancestor && depth < 3 && ancestor !== document.body; depth += 1, ancestor = ancestor.parentElement) {
      const label = ancestor.querySelector("label");
      if (!label || label.contains(control)) continue;
      const text = label.textContent.replace(/\s+/g, " ").trim();
      if (/terms?|conditions?|privacy policy|data protection|protecci[oó]n de datos|pol[ií]tica de privacidad|t[eé]rminos|condiciones/i.test(text)) return text;
    }
    return "";
  }

  function disclosureLabel(control) {
    return [control.getAttribute("aria-label"), control.textContent].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 240);
  }

  function disclosureTarget(control) {
    if (control.id === "bdg_btn_ver_condiciones") {
      const formGroup = control.closest(".bdgt2_form_chekcond_evnt");
      const target = formGroup?.querySelector("#bdg_capa_padre_condiciones");
      if (target) return target;
    }
    if (control.id === "rgpd_btn_ver_condiciones") {
      const section = control.closest("[id^='rgpd_capa_padre_tipo_']");
      const target = section?.querySelector("[id^='rgpd_capa_tipo_ampliada_']");
      if (target) return target;
    }
    const ids = new Set();
    const controls = control.getAttribute("aria-controls") || "";
    for (const id of controls.split(/\s+/)) if (id) ids.add(id);
    const href = control.getAttribute("href") || "";
    const inline = control.getAttribute("onclick") || "";
    for (const match of inline.matchAll(/(?:slideToggle|toggle)\s*\(\s*['"]#?([\w:-]+)/g)) ids.add(match[1]);
    for (const match of `${href} ${inline}`.matchAll(/#([\w:-]+)/g)) ids.add(match[1]);
    for (const id of ids) {
      const target = document.getElementById(id);
      if (target && target !== control && !target.contains(control) && !target.matches("form, input, select, textarea, button")) return target;
    }
    return null;
  }

  function disclosureText(target) {
    const clone = target.cloneNode(true);
    clone.querySelectorAll("input, select, textarea, button, script, style, noscript, form, svg, [data-tos-decipher-badge], [data-tos-decipher-ui]").forEach(node => node.remove());
    return (clone.textContent || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  }

  function disclosureCandidates() {
    const legalLabel = /terms?|conditions?|privacy|data protection|legal|pol[ií]tica|privacidad|protecci[oó]n de datos|t[eé]rminos|condiciones/i;
    const controls = [...document.querySelectorAll('a[href], button, [role="button"], summary, [aria-expanded], [aria-controls], [onclick]')];
    const items = [];
    for (const control of controls) {
      if (control.closest("[data-tos-decipher-ui]")) continue;
      const ownLabel = disclosureLabel(control);
      const contextLabel = disclosureContext(control);
      const userActivated = activatedDisclosureControls.has(control);
      const label = [contextLabel, ownLabel].filter(Boolean).join(" ").slice(0, 320);
      if (!legalLabel.test(label)) continue;
      const href = control.getAttribute("href") || "";
      const inline = control.getAttribute("onclick") || "";
      const hasDisclosureSignal = control.hasAttribute("aria-controls") || control.hasAttribute("aria-expanded") || /toggle|slideToggle|collapse|expand/i.test(inline);
      if (!hasDisclosureSignal && !/^javascript:/i.test(href) && !href.startsWith("#") && !userActivated) continue;
      if (!userActivated && !contextLabel && !legalLabel.test(ownLabel)) continue;
      const target = disclosureTarget(control);
      if (!target || target.contains(control) || !(target.hasAttribute("id") || target.hasAttribute("aria-label") || target.hasAttribute("data-legal-policy"))) continue;
      if (!disclosureText(target) && !userActivated) continue;
      let url = disclosureUrls.get(control);
      let id = disclosureIds.get(control);
      if (!url) {
        id = `disclosure-${++disclosureSequence}`;
        url = `tos-decipher://${location.host}/${id}`;
        disclosureUrls.set(control, url);
        disclosureIds.set(control, id);
      }
      const text = disclosureText(target);
      if (text.length < 80) {
        if (userActivated) disclosureTargets.set(url, { trigger: control, target });
        continue;
      }
      const type = /privacy|data protection|privacidad|protecci[oó]n de datos|pol[ií]tica/i.test(label) ? "privacy_policy" : "terms_of_service";
      const item = { id, label, url, text, policyType: type, control, target, isDisclosure: true };
      disclosureTargets.set(url, { trigger: control, target });
      items.push(item);
    }
    return items;
  }

  function hasPendingDisclosures() {
    return disclosureCandidates().some(item => disclosureRecords.get(item.url)?.sourceText !== item.text);
  }

  async function scanDisclosures(runId) {
    for (const item of disclosureCandidates()) {
      if (runId !== generation) return;
      const existing = disclosureRecords.get(item.url);
      if (existing?.sourceText === item.text && ["fetching", "analyzing", "succeeded", "failed"].includes(existing.review)) continue;
      if (activeUrls.has(item.url)) continue;
      const record = existing || { id: item.id, url: item.url, label: displayLabel(item.label), displayUrl: safeUrl(item.url), policyType: item.policyType, classification: "likely-policy", review: "queued", error: "", analysis: null, isPage: false };
      record.label = displayLabel(item.label);
      record.displayUrl = safeUrl(item.url);
      record.policyType = item.policyType;
      record.sourceText = item.text;
      record.review = "queued";
      record.error = "";
      record.analysis = null;
      disclosureRecords.set(item.url, record);
      states.set(item.url, item);
      renderDocument(item.url);
      await processItem(item, item.text, runId, true);
    }
  }

  async function review(runId) {
    publish("checking_page", () => t("status.checkingPolicy"));
    const currentPage = { id: "current-page", label: (document.title || location.href).slice(0, 240), url: location.href };
    if (currentPage.url.length > 4000) throw new Error(t("error.urlTooLong"));
    states.set(currentPage.url, currentPage);
    const [classification] = await classify([currentPage]);
    if (runId !== generation) return;
    if (classification?.id !== "current-page" || typeof classification.likelyPolicy !== "boolean") throw new Error(t("error.pageClassification"));
    logEvent("current_page_classified", { likelyPolicy: classification.likelyPolicy, policyType: classification.policyType, confidence: classification.confidence });
    if (classification.likelyPolicy) {
      const [typeClassification] = await classifyTypes([currentPage]);
      if (runId !== generation) return;
      pageReview = "admitted";
      pageOutcome = () => t("status.pageIsPolicy");
      pageDoc = { id: "current-page", url: currentPage.url, label: displayLabel(currentPage.label), displayUrl: safeUrl(currentPage.url), policyType: typeClassification?.policyType || "other", review: "fetching", error: "", analysis: null, isPage: true };
      renderDocument(pageDoc.url);
      publish("extracting", () => t("status.pageReading"));
      const text = extractText(document);
      if (text.length < 80) {
        pageReview = "failed";
        pageDoc.review = "failed";
        pageDoc.errorKey = "status.tooLittleText";
        pageOutcome = () => t("status.pageTooShort");
        reviewErrors.push("Current page: not enough readable text to analyze.");
        logEvent("current_page_extraction_failed", { extractedChars: text.length });
        renderDocument(pageDoc.url);
        publish("scanning_links", () => t("status.pageTextShort"));
      } else {
        await processItem(currentPage, text, runId, false);
      }
    } else {
      pageReview = "not-admitted";
      pageOutcome = () => "";
      publish("scanning_links", () => t("status.lookingLinks"));
    }
    if (runId !== generation) return;
    pagePhaseComplete = true;
    await scanLinks(runId);
  }

  function schedule() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      refreshBadges();
      scanLinks(generation).catch(error => publish("error", () => error instanceof Error ? error.message : t("error.linkReview")));
      scanDisclosures(generation).catch(error => publish("error", () => error instanceof Error ? error.message : t("error.linkReview")));
    }, 250);
  }

  function isOwnNode(node) {
    return node.nodeType === Node.ELEMENT_NODE && (node.matches("[data-tos-decipher-badge], [data-tos-decipher-ui]") || Boolean(node.closest("[data-tos-decipher-ui]")));
  }

  function installListeners() {
    if (observer) return;
    observer = new MutationObserver(mutations => {
      if (!pagePhaseComplete) return;
      if (mutations.some(mutation => mutation.type === "characterData" || [...mutation.addedNodes].some(node => node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && !isOwnNode(node))))) schedule();
      if ([...disclosureTargets.values()].some(({ target }) => !target.isConnected)) {
        for (const [url, target] of disclosureTargets) if (!target.isConnected) disclosureTargets.delete(url);
      }
    });
    observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target || target.closest("[data-tos-decipher-ui], [data-tos-decipher-badge]")) return;
      const control = target.closest('a[href], button, [role="button"], summary, [aria-expanded], [aria-controls], [onclick]');
      if (!control) return;
      const label = `${control.getAttribute("aria-label") || ""} ${control.textContent || ""}`.replace(/\s+/g, " ");
      const context = disclosureContext(control);
      if (!/terms?|conditions?|privacy policy|pol[ií]tica de privacidad|t[eé]rminos|condiciones/i.test(label) && !context) return;
      activatedDisclosureControls.add(control);
      schedule();
    }, true);
    document.addEventListener("pointerdown", event => {
      if (!openPanel) return;
      const path = event.composedPath();
      if ((uiHost && path.includes(uiHost)) || (openPanel.trigger && path.includes(openPanel.trigger))) return;
      closePanel(false);
    }, true);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && openPanel) closePanel(true);
    });
    window.addEventListener("scroll", schedulePlacement, { capture: true, passive: true });
    window.addEventListener("resize", schedulePlacement, { passive: true });
  }

  function start() {
    generation = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pagePhaseComplete = false;
    scanning = false;
    clearTimeout(debounceTimer);
    activatedDisclosureControls = new WeakSet();
    clearUi();
    discoveredUrls.clear();
    linkRecords.clear();
    disclosureRecords.clear();
    disclosureTargets.clear();
    states.clear();
    activeUrls.clear();
    reviewErrors.length = 0;
    linkStats.found = 0;
    linkStats.classified = 0;
    linkStats.policyCandidates = 0;
    pageDoc = null;
    pageOutcome = () => "";
    pageReview = "not-checked";
    currentStatus = { stage: "checking_page", message: t("status.checkingPage"), pageUrl: location.href, links: stats(), documents: [], linkResults: [], timeline: [] };
    timelineEntries = [];
    statusText = () => t("status.checkingPage");
    statusKind = "status";
    logEvent("run_started", { pageUrl: safeUrl(location.href), title: (document.title || "").slice(0, 120) });
    installListeners();
    review(generation).catch(error => publish("error", () => error instanceof Error ? error.message : t("error.pageReview")));
    return { status: "started", message: t("status.started") };
  }

  function setLanguage(value) {
    const next = TosDecipherI18n.normalizeLanguage(value);
    if (next === language) return;
    language = next;
    if (hasStarted && currentStatus.stage) publish(currentStatus.stage, statusText, {}, statusKind);
    for (const doc of policyDocuments()) renderDocument(doc.url);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "get-status") { sendResponse(hasStarted ? currentStatus : null); return false; }
    if (message.type === "set-language") { setLanguage(message.language); sendResponse({ ok: true }); return false; }
    if (message.type === "start") {
      setLanguage(message.language);
      if (hasStarted && currentStatus.pageUrl === location.href && !message.restart) {
        sendResponse({ status: "started", message: currentStatus.message });
      } else {
        hasStarted = true;
        sendResponse(start());
      }
      return false;
    }
    if (message.type === "open-panel") { sendResponse({ ok: revealDocument(message.url) }); return false; }
    if (message.type === "analysis-progress") {
      if (message.runId !== generation || !states.has(message.url)) return false;
      const item = states.get(message.url);
      logEvent("analysis_progress", { stage: message.stage, url: safeUrl(message.url), message: (message.message || "").slice(0, 180) });
      if (message.stage === "full_review") publish(message.stage, () => t("status.quickSummary", { label: item.label || t("ui.thisPage") }));
      else publish(message.stage, () => t("status.translating", { label: item.label || t("ui.policy") }));
      return false;
    }
    if (message.type === "analysis-event") {
      const item = states.get(message.url);
      if (!item || message.runId !== generation) return false;
      const doc = documentFor(message.url);
      if (message.event === "error") {
        const reason = message.data?.message || t("error.policyAnalysis");
        const alreadyFailed = doc?.review === "failed";
        if (doc) {
          doc.review = "failed";
          doc.error = reason.slice(0, 240);
        }
        if (item.id === "current-page") pageReview = "failed";
        if (!alreadyFailed) reviewErrors.push(`${item.label || "Policy page"}: ${reason}`);
        logEvent("staged_analysis_error", { url: safeUrl(message.url), message: reason.slice(0, 240) });
        renderDocument(message.url);
        publish("scanning_links", () => t("status.failed", { label: item.label || t("ui.policyReview"), error: reason }), {}, "error");
      }
      if (message.event === "initial" || message.event === "full") {
        const data = message.data || {};
        if (doc) doc.analysis = normalizeAnalysis(data, message.event);
        logEvent("analysis_event_received", { event: message.event, url: safeUrl(message.url), title: data.title, rating: data.rating, findingCount: (data.findings || []).length, impacts: (data.findings || []).map(finding => finding.impact || null) });
        renderDocument(message.url);
        const statusMessage = () => message.event === "initial" ? t("status.quickSummary", { label: item.label || t("ui.thisPage") }) : t("status.explained", { label: item.label || t("ui.thisPage") });
        publish(message.event === "initial" || item.id === "current-page" ? "full_review" : "scanning_links", statusMessage);
      }
      return false;
    }
    return false;
  });

  api.start = start;
})();
