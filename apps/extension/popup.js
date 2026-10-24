const status = document.querySelector("#status");
const review = document.querySelector("#review");
const documentsSection = document.querySelector("#documents");
const activity = document.querySelector("#activity");
const timeline = document.querySelector("#timeline");
const linkDetails = document.querySelector("#linkDetails");
const linkSummary = document.querySelector("#linkSummary");
const counts = document.querySelector("#counts");
const links = document.querySelector("#links");
const languageToggle = document.querySelector("#languageToggle");
const languageMenu = document.querySelector("#languageMenu");
const languageOptions = [...languageMenu.querySelectorAll("button[data-language]")];
let language = TosDecipherI18n.resolveLanguage();
let lastStage = null;
let statusMessage = null;
const ALL_SITES = ["http://*/*", "https://*/*"];
const autoRunInput = document.querySelector("#autoRun");
const siteToggle = document.querySelector("#siteToggle");
const blockedList = document.querySelector("#blockedList");
let settings = { autoRun: false, blockedSites: [] };
let linkCount = 0;
const t = (key, vars) => TosDecipherI18n.translate(language, key, vars);
const SVG_NS = "http://www.w3.org/2000/svg";
const TONE_COLORS = { brand: "#3b4fd8", pending: "#64748b", clear: "#15803d", caution: "#c26a04", warning: "#dc2626", unrated: "#3b4fd8", error: "#64748b" };
const VERDICT_COLORS = { clear: "#166534", caution: "#9a4f00", warning: "#b91c1c", unrated: "#3c4659", pending: "#5b6678", error: "#5b6678" };
const CLASSIFICATION_LABELS = { "likely-policy": "classify.likely", "not-policy": "classify.notPolicy", pending: "classify.pending", error: "classify.error" };
let activeTabId;
let activeTab;
let reviewBusy = false;
let requestingPermission = false;
let cachedScriptHosts = { tabId: -1, url: "", patterns: [] };
const startingTabs = new Set();
const navigationPendingTabs = new Set();
review.disabled = true;

const MULTI_LABEL_SUFFIXES = new Set(["ac.uk", "co.uk", "gov.uk", "org.uk", "com.au", "net.au", "org.au", "edu.au", "gov.au", "co.jp", "ne.jp", "or.jp", "co.nz", "com.br", "com.cn", "com.hk", "com.sg", "co.in", "firm.in", "net.in", "org.in", "com.mx", "com.tr", "co.za", "com.tw", "co.kr"]);
const SHARED_HOST_SUFFIXES = new Set(["github.io", "gitlab.io", "pages.dev", "vercel.app", "netlify.app", "herokuapp.com", "web.app", "firebaseapp.com", "cloudfront.net", "azurewebsites.net", "blogspot.com", "wordpress.com", "myshopify.com", "wixsite.com", "squarespace.com"]);

function hostDetails(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const labels = host.split(".");
  const isIp = host.includes(":") || (labels.length === 4 && labels.every(label => /^\d+$/.test(label) && Number(label) <= 255));
  const suffix = labels.slice(-2).join(".");
  const isSharedHost = SHARED_HOST_SUFFIXES.has(suffix);
  if (host === "localhost" || isIp || host.includes(":") || labels.length < 2 || isSharedHost) return { site: host, exact: true };
  return { site: labels.slice(-(MULTI_LABEL_SUFFIXES.has(suffix) ? 3 : 2)).join("."), exact: false };
}

function pageHostPatterns(pageUrl) {
  const { site, exact } = hostDetails(pageUrl.hostname);
  return ["http:", "https:"].flatMap(scheme => exact
    ? [`${scheme}//${site}/*`]
    : [`${scheme}//${site}/*`, `${scheme}//*.${site}/*`]);
}

function siteKey(hostname) {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function isBlockedHostname(hostname, blockedSites) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return blockedSites.some(site => host === site || host.endsWith(`.${site}`));
}

function currentSite() {
  if (!activeTab?.url) return null;
  try { return siteKey(new URL(activeTab.url).hostname); } catch { return null; }
}

function isBlockedUrl(url) {
  return isBlockedHostname(url.hostname, settings.blockedSites);
}

function renderSettings() {
  const site = currentSite();
  siteToggle.hidden = !site;
  if (site) siteToggle.textContent = settings.blockedSites.includes(site) ? t("popup.allowSite") : t("popup.blockSite");
  if (!settings.blockedSites.length) {
    blockedList.replaceChildren(element("li", "empty", t("popup.noBlockedSites")));
    return;
  }
  blockedList.replaceChildren(...settings.blockedSites.map(site => {
    const item = element("li", "", site);
    const remove = element("button", "", t("popup.removeSite"));
    remove.type = "button";
    remove.addEventListener("click", () => setSiteBlocked(site, false));
    item.append(remove);
    return item;
  }));
}

async function setSiteBlocked(site, blocked) {
  settings.blockedSites = blocked
    ? [...new Set([...settings.blockedSites, site])]
    : settings.blockedSites.filter(item => item !== site);
  await chrome.storage.local.set({ blockedSites: settings.blockedSites }).catch(() => {});
  renderSettings();
  if (activeTab && site === currentSite()) await initializeTab(activeTab).catch(() => {});
}

function blockedView() {
  reviewBusy = false;
  lastStage = null;
  review.disabled = true;
  review.textContent = t("popup.check");
  setStatus({ key: "popup.siteBlocked" });
  documentsSection.replaceChildren();
}

function messageText(message) {
  return message.key ? t(message.key, message.vars) : message.text;
}

function setStatus(message) {
  statusMessage = message;
  status.textContent = messageText(message);
}

function getInjectableUrl(tab) {
  if (!tab?.id) throw new Error(t("popup.errNoTab"));
  if (!tab.url) throw new Error(t("popup.errNoUrl"));
  let url;
  try { url = new URL(tab.url); } catch { throw new Error(t("popup.errInvalidUrl")); }
  const blocked = new Set(["chrome:", "edge:", "about:", "chrome-error:", "view-source:", "file:"]);
  if (blocked.has(url.protocol)) throw new Error(t("popup.errNotInjectable", { protocol: url.protocol }));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(t("popup.errNotSupported", { protocol: url.protocol }));
  return url;
}

function svgElement(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function shieldIcon(tone) {
  const svg = svgElement("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
  svg.append(svgElement("path", { d: "M12 2 20 5v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5z", fill: TONE_COLORS[tone] || TONE_COLORS.brand }));
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

function verdictText(doc) {
  const parts = [doc.verdict];
  if (doc.important) parts.push(t("doc.importantCount", { count: doc.important }));
  if (doc.caution) parts.push(t("doc.cautionCount", { count: doc.caution }));
  return parts.join(" · ");
}

async function showOnPage(url) {
  if (!activeTabId) return;
  const response = await chrome.tabs.sendMessage(activeTabId, { type: "open-panel", url }).catch(() => null);
  if (response?.ok) window.close();
  else setStatus({ key: "popup.docGone" });
}

function renderDocuments(documents, stage) {
  documentsSection.replaceChildren();
  if (!documents.length) {
    if (stage === "complete") documentsSection.append(element("p", "empty", t("popup.noLinks")));
    return;
  }
  for (const doc of documents) {
    const card = element("article", `doc${doc.busy ? " busy" : ""}`);
    const text = element("div");
    text.append(element("strong", "", doc.label || t("ui.policy")), element("span", "type", doc.isPage ? t("doc.thisPage", { type: doc.type }) : doc.type));
    const verdict = element("span", "verdict", verdictText(doc));
    verdict.style.color = VERDICT_COLORS[doc.tone] || VERDICT_COLORS.unrated;
    text.append(verdict);
    if (doc.headline) text.append(element("p", "headline", doc.headline));
    if (doc.review === "failed") {
      const guidance = doc.fetchFailed
        ? t("doc.fetchFailed")
        : t("doc.reviewFailed", { error: doc.error || t("doc.reviewIncomplete") });
      text.append(element("p", "fetch-error", guidance));
      const open = element("a", "show", t("doc.openPolicyTab"));
      open.href = doc.url;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      text.append(open);
    }
    const show = element("button", "show", t("doc.showOnPage"));
    show.type = "button";
    show.addEventListener("click", () => showOnPage(doc.url));
    text.append(show);
    card.append(shieldIcon(doc.tone), text);
    documentsSection.append(card);
  }
}

function renderStatus(data) {
  if (!data) return;
  statusMessage = null;
  const stage = data.stage || "checking_page";
  const busy = !["complete", "error", "permission_required"].includes(stage);
  reviewBusy = busy;
  review.disabled = busy;
  lastStage = stage;
  review.textContent = busy ? t("popup.checking") : buttonLabel(stage);
  status.replaceChildren();
  if (busy) status.append(element("span", "spinner"));
  status.append(element("span", "", data.message || t("popup.statusUnavailable")));
  renderDocuments(data.documents || [], stage);
  const events = (data.timeline || []).slice(-8);
  activity.hidden = events.length === 0;
  timeline.replaceChildren(...events.map(event => element("div", `timeline-entry${event.kind === "error" ? " error" : ""}`, event.message)));
  const records = data.linkResults || [];
  const linkCounts = data.links || {};
  linkDetails.hidden = records.length === 0;
  linkCount = records.length;
  linkSummary.textContent = t("popup.allLinks", { count: linkCount });
  counts.textContent = t("popup.counts", { policies: linkCounts.policyCandidates || 0, others: (linkCounts.classified || 0) - (linkCounts.policyCandidates || 0) }) + (linkCounts.classificationFailed ? t("popup.countsFailed", { count: linkCounts.classificationFailed }) : "");
  links.replaceChildren(...records.map(record => {
    const row = element("div", "link-row");
    row.append(element("strong", "", `${record.label || t("ui.untitledLink")} · ${t(CLASSIFICATION_LABELS[record.classification] || record.classification)}`), element("span", "", record.displayUrl || ""));
    if (record.error) row.append(element("span", "", record.error));
    return row;
  }));
}

function buttonLabel(stage) {
  if (stage === "permission_required") return t("popup.grant");
  if (stage === "error") return t("popup.retry");
  if (stage === "complete") return t("popup.recheck");
  return t("popup.check");
}

function applyLanguage() {
  document.documentElement.lang = language;
  for (const option of languageOptions) option.setAttribute("aria-pressed", String(option.dataset.language === language));
  const current = languageOptions.find(option => option.dataset.language === language) || languageOptions[0];
  languageToggle.replaceChildren(current.querySelector("svg").cloneNode(true));
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll("[data-i18n-aria]")) node.setAttribute("aria-label", t(node.dataset.i18nAria));
  linkSummary.textContent = t("popup.allLinks", { count: linkCount });
  review.textContent = reviewBusy ? t("popup.checking") : buttonLabel(lastStage);
  if (statusMessage) status.textContent = messageText(statusMessage);
  renderSettings();
}

function resetView(message) {
  reviewBusy = false;
  review.disabled = false;
  lastStage = null;
  review.textContent = t("popup.check");
  setStatus(message);
  documentsSection.replaceChildren();
  timeline.replaceChildren();
  activity.hidden = true;
  links.replaceChildren();
  linkDetails.hidden = true;
}

async function hydrate(tabId, currentUrl) {
  const key = `review:${tabId}`;
  const stored = await chrome.storage.local.get(key);
  if (stored[key] && stored[key].pageUrl === currentUrl) {
    renderStatus(stored[key]);
    reviewBusy = stored[key].stage !== "complete" && stored[key].stage !== "error" && stored[key].stage !== "permission_required";
    review.disabled = reviewBusy;
    if (!reviewBusy) review.textContent = buttonLabel(stored[key].stage);
  } else {
    resetView({ key: "popup.idle" });
  }
}

async function scriptHostPatterns(tabId, pageUrl) {
  if (cachedScriptHosts.tabId === tabId && cachedScriptHosts.url === pageUrl.href) return cachedScriptHosts.patterns;
  cachedScriptHosts = { tabId, url: pageUrl.href, patterns: [] };
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => [...document.scripts].map(script => script.src).filter(Boolean),
    });
    const patterns = new Set();
    for (const source of result?.result || []) {
      try {
        const scriptUrl = new URL(source);
        const scriptSite = hostDetails(scriptUrl.hostname);
        if (scriptUrl.protocol !== pageUrl.protocol || scriptUrl.username || scriptUrl.password || scriptSite.site === hostDetails(pageUrl.hostname).site) continue;
        patterns.add(`${scriptUrl.origin}/*`);
      } catch {}
      if (patterns.size >= 3) break;
    }
    cachedScriptHosts = { tabId, url: pageUrl.href, patterns: [...patterns] };
    return cachedScriptHosts.patterns;
  } catch {
    return [];
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const pending = changes[`permission-pending:${activeTabId}`]?.newValue;
  const update = changes[`review:${activeTabId}`]?.newValue;
  if (pending && update?.pageUrl === pending.pageUrl) return;
  if (!update || update.pageUrl !== activeTab?.url) return;
  if (requestingPermission && update.stage === "permission_required") return;
  renderStatus(update);
});

async function startReview(tab, pageUrl, restart = false) {
  if (startingTabs.has(tab.id)) return;
  startingTabs.add(tab.id);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/i18n.js", "src/content.js"] });
    let payload = await chrome.tabs.sendMessage(tab.id, { type: restart ? "start" : "get-status", restart, language });
    if (restart && !payload?.message) throw new Error(t("popup.errNoResponse"));
    if (!restart && (!payload?.stage || payload.pageUrl !== pageUrl.href || ["complete", "error"].includes(payload.stage))) {
      payload = await chrome.tabs.sendMessage(tab.id, { type: "start", restart: true, language });
      if (!payload?.message) throw new Error(t("popup.errNoResponse"));
    }
    const currentStatus = await chrome.tabs.sendMessage(tab.id, { type: "get-status" });
    if (currentStatus?.pageUrl === pageUrl.href) renderStatus(currentStatus);
    else renderStatus({ stage: "checking_page", pageUrl: pageUrl.href, message: payload.message || t("status.started"), documents: [], linkResults: [], timeline: [] });
  } finally {
    startingTabs.delete(tab.id);
  }
}

async function requestAndStart() {
  if (!activeTab?.id) throw new Error(t("popup.errNoTab"));
  const permissionTab = activeTab;
  const permissionUrl = getInjectableUrl(permissionTab);
  const scriptPatterns = await scriptHostPatterns(permissionTab.id, permissionUrl);
  const pageOrigins = pageHostPatterns(permissionUrl);
  const origins = [...new Set([...pageOrigins, ...scriptPatterns])];
  requestingPermission = true;
  try {
    await chrome.storage.local.set({
      [`review:${permissionTab.id}`]: {
        stage: "permission_required",
        pageUrl: permissionUrl.href,
        message: t("popup.permissionNeeded"),
        documents: [],
        linkResults: [],
        timeline: [],
      },
      [`permission-pending:${permissionTab.id}`]: {
        pageUrl: permissionUrl.href,
        origins,
        createdAt: Date.now(),
      },
    });
  } catch {
    requestingPermission = false;
    try {
      await chrome.storage.local.remove(`permission-pending:${permissionTab.id}`);
    } catch {}
    throw new Error(t("popup.errSavePermission"));
  }
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (currentTab?.id !== permissionTab.id || !currentTab.url || new URL(currentTab.url).href !== permissionUrl.href) {
    try {
      await chrome.storage.local.remove(`permission-pending:${permissionTab.id}`);
    } catch {}
    requestingPermission = false;
    reviewBusy = false;
    throw new Error(t("popup.errPageChanged"));
  }
  statusMessage = null;
  status.replaceChildren(element("span", "spinner"), element("span", "", t("popup.requesting")));
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins });
  } catch (error) {
    try {
      await chrome.storage.local.remove(`permission-pending:${permissionTab.id}`);
    } catch {}
    requestingPermission = false;
    reviewBusy = false;
    review.disabled = false;
    throw error;
  } finally {
    requestingPermission = false;
  }
  if (!granted) {
    try {
      await chrome.storage.local.remove(`permission-pending:${permissionTab.id}`);
    } catch {}
    reviewBusy = false;
    review.disabled = false;
    review.textContent = t("popup.grant");
    setStatus({ key: "popup.notGranted" });
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) throw new Error(t("popup.errUnavailable"));
  const pageUrl = getInjectableUrl(tab);
  if (tab.id !== permissionTab.id || pageUrl.href !== permissionUrl.href) {
    try {
      await chrome.storage.local.remove(`permission-pending:${permissionTab.id}`);
    } catch {}
    throw new Error(t("popup.errPageChangedClick"));
  }
  try {
    await chrome.storage.local.remove(`permission-pending:${permissionTab.id}`);
  } catch {}
  activeTabId = tab.id;
  activeTab = tab;
  if (tab.status !== "complete") {
    reviewBusy = false;
    review.disabled = false;
    setStatus({ key: "popup.grantedLoading" });
    return;
  }
  await startReview(tab, pageUrl);
}

review.addEventListener("click", async () => {
  if (reviewBusy || requestingPermission) return;
  reviewBusy = true;
  review.disabled = true;
  review.textContent = t("popup.checking");
  try {
    if (!activeTab?.id) throw new Error(t("popup.errNoTab"));
    const pageUrl = getInjectableUrl(activeTab);
    if (isBlockedUrl(pageUrl)) {
      blockedView();
      return;
    }
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!currentTab || currentTab.id !== activeTab.id || new URL(currentTab.url).href !== pageUrl.href) throw new Error(t("popup.errPageChanged"));
    if (activeTab.status !== "complete") {
      reviewBusy = false;
      review.disabled = false;
      review.textContent = t("popup.check");
      setStatus({ key: "popup.stillLoading" });
      return;
    }
    const origins = [...new Set([...pageHostPatterns(pageUrl), ...(await scriptHostPatterns(activeTab.id, pageUrl))])];
    const granted = await chrome.permissions.contains({ origins });
    if (granted) {
      const stored = await chrome.storage.local.get(`review:${activeTab.id}`);
      const currentStatus = stored[`review:${activeTab.id}`];
      if (currentStatus?.pageUrl === pageUrl.href && ["complete", "error"].includes(currentStatus.stage)) {
        reviewBusy = true;
        renderStatus({ ...currentStatus, stage: "checking_page", message: t("popup.restarting"), documents: [], linkResults: [], timeline: [] });
        review.disabled = true;
        await startReview(activeTab, pageUrl, true);
      } else {
        await startReview(activeTab, pageUrl);
      }
    } else {
      requestingPermission = false;
      reviewBusy = false;
      await requestAndStart();
    }
  } catch (error) {
    requestingPermission = false;
    reviewBusy = false;
    if (activeTab?.id) {
      try {
        await chrome.storage.local.remove(`permission-pending:${activeTab.id}`);
      } catch {}
    }
    renderStatus({ stage: "error", message: error instanceof Error ? error.message : t("error.review"), documents: [], linkResults: [], timeline: [] });
  } finally {
    review.disabled = reviewBusy;
  }
});

async function initializeTab(tab) {
  const pageUrl = getInjectableUrl(tab);
  activeTab = tab;
  activeTabId = tab.id;
  if (isBlockedUrl(pageUrl)) {
    renderSettings();
    blockedView();
    return;
  }
  const pendingKey = `permission-pending:${tab.id}`;
  const pendingState = await chrome.storage.local.get(pendingKey);
  if (pendingState[pendingKey]?.pageUrl === pageUrl.href) {
    const granted = await chrome.permissions.contains({ origins: pendingState[pendingKey].origins || [] });
    if (granted) await chrome.storage.local.remove(pendingKey);
  }
  if (navigationPendingTabs.has(tab.id)) return;
  if (startingTabs.has(tab.id)) return;
  if (tab.status !== "complete") {
    reviewBusy = false;
    review.disabled = false;
    review.textContent = t("popup.check");
    setStatus({ key: "popup.waitingLoad" });
    return;
  }
  if (requestingPermission) return;
  await hydrate(tab.id, pageUrl.href);
  const key = `review:${tab.id}`;
  const stored = await chrome.storage.local.get(key);
  if (stored[key]?.pageUrl === pageUrl.href && stored[key].stage !== "permission_required") {
    const currentStatus = await chrome.tabs.sendMessage(tab.id, { type: "get-status" }).catch(() => null);
    if (currentStatus?.pageUrl === pageUrl.href) {
      renderStatus(currentStatus);
      return;
    }
    if (stored[key].stage === "complete") return;
  }
  const origins = [...new Set([...pageHostPatterns(pageUrl), ...(await scriptHostPatterns(tab.id, pageUrl))])];
  if (settings.autoRun || !await chrome.permissions.contains({ origins })) return;
  reviewBusy = true;
  review.disabled = true;
  renderStatus({ stage: "checking_page", pageUrl: pageUrl.href, message: t("popup.starting"), documents: [], linkResults: [], timeline: [] });
  try {
    await startReview(tab, pageUrl);
  } catch (error) {
    renderStatus({ stage: "error", pageUrl: pageUrl.href, message: error instanceof Error ? error.message : t("error.review"), documents: [], linkResults: [], timeline: [] });
  }
}

chrome.storage.local.get(["language", "autoRun", "blockedSites"]).then(async stored => {
  language = TosDecipherI18n.resolveLanguage(stored.language);
  settings = {
    autoRun: Boolean(stored.autoRun),
    blockedSites: Array.isArray(stored.blockedSites) ? stored.blockedSites : [],
  };
  settings.autoRun = settings.autoRun && await chrome.permissions.contains({ origins: ALL_SITES });
  autoRunInput.checked = settings.autoRun;
  applyLanguage();
  return chrome.tabs.query({ active: true, currentWindow: true });
}).then(async ([tab]) => {
  try {
    getInjectableUrl(tab);
    review.disabled = false;
    await initializeTab(tab);
  } catch (error) {
    resetView(error instanceof Error ? { text: error.message } : { key: "popup.openRegular" });
    review.disabled = true;
  }
});

autoRunInput.addEventListener("change", async () => {
  if (autoRunInput.checked) {
    const granted = await chrome.permissions.request({ origins: ALL_SITES }).catch(() => false);
    if (!granted) {
      autoRunInput.checked = false;
      setStatus({ key: "popup.autoDenied" });
      return;
    }
    settings.autoRun = true;
    await chrome.storage.local.set({ autoRun: true }).catch(() => {});
    if (activeTab?.id) chrome.runtime.sendMessage({ type: "auto-review-tab", tabId: activeTab.id }).catch(() => {});
    return;
  }
  settings.autoRun = false;
  await chrome.storage.local.set({ autoRun: false }).catch(() => {});
  await chrome.permissions.remove({ origins: ALL_SITES }).catch(() => {});
});

siteToggle.addEventListener("click", async () => {
  const site = currentSite();
  if (!site) return;
  await setSiteBlocked(site, !settings.blockedSites.includes(site));
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await initializeTab(await chrome.tabs.get(tabId));
  } catch {
    if (activeTabId === tabId) {
      reviewBusy = false;
      review.disabled = true;
    }
  }
});

function setLanguageMenu(open) {
  languageMenu.hidden = !open;
  languageToggle.setAttribute("aria-expanded", String(open));
}

languageToggle.addEventListener("click", () => setLanguageMenu(languageMenu.hidden));

for (const option of languageOptions) {
  option.addEventListener("click", async () => {
    language = TosDecipherI18n.normalizeLanguage(option.dataset.language);
    applyLanguage();
    setLanguageMenu(false);
    languageToggle.focus();
    if (activeTabId) chrome.tabs.sendMessage(activeTabId, { type: "set-language", language }).catch(() => {});
    await chrome.storage.local.set({ language }).catch(() => {});
  });
}

document.addEventListener("click", event => {
  if (!event.target.closest(".language")) setLanguageMenu(false);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !languageMenu.hidden) {
    setLanguageMenu(false);
    languageToggle.focus();
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== activeTabId || (!changeInfo.url && changeInfo.status !== "complete") || tab.active === false) return;
  try {
    if (changeInfo.status === "complete" || changeInfo.url) cachedScriptHosts = { tabId: -1, url: "", patterns: [] };
    if (changeInfo.url) {
      navigationPendingTabs.add(tabId);
      reviewBusy = false;
      review.disabled = true;
      setStatus({ key: "popup.waitingLoad" });
    }
    if (changeInfo.status === "complete") navigationPendingTabs.delete(tabId);
    await initializeTab(tab);
  } catch {
    reviewBusy = false;
  }
});
