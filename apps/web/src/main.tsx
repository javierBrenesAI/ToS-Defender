import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Finding = { category: string; explanation: string; implication: string; uncertainty: string; citation: Citation };
type Citation = { passageId: string; excerpt: string; status?: string }; type Result = { title: string; policyType: string; overview: string; findings: Finding[]; limitations: string[]; passages: { id: string; text: string }[] };
type ReviewStatus = "idle" | "fast" | "complete" | "failed";
type SimulationScenario = "normal" | "no-fast" | "background-failure" | "duplicates";

async function consumeAnalysisEvents(response: Response, onEvent: (event: string, data: unknown) => void) {
  if (!response.body) throw new Error("The server did not provide a response stream.");
  if (!response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("The server returned an unexpected response format.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatch = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) onEvent(event, JSON.parse(data.join("\n")) as unknown);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replaceAll("\r\n", "\n");
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        dispatch(buffer.slice(0, separator));
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
    if (buffer.trim()) dispatch(buffer);
    } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

const isDevelopment = import.meta.env.DEV;
const samplePolicy = "Terms of Service. We may collect account and device information to provide and secure the service. We may share personal data with service providers and advertising partners. Subscriptions renew automatically unless you cancel at least 24 hours before renewal. Prices may change at renewal after notice by email. We may suspend or terminate accounts that violate these terms. Disputes must be resolved by binding arbitration, and you waive the right to participate in a class action.";

function sampleFinding(category: string, explanation: string, implication: string, excerpt: string, uncertainty = ""): Finding {
  return { category, explanation, implication, uncertainty, citation: { passageId: "P001", excerpt, status: "simulated" } };
}

const fastFindings = [
  sampleFinding("renewal_or_cancellation", "The subscription renews automatically unless you cancel in time.", "Cancel at least 24 hours before renewal to avoid another charge.", "Subscriptions renew automatically unless you cancel at least 24 hours before renewal."),
  sampleFinding("disputes_or_arbitration", "Disputes go to arbitration, and class-action participation is waived.", "You may have to resolve disputes individually outside court.", "Disputes must be resolved by binding arbitration, and you waive the right to participate in a class action."),
];

const backgroundFindings = [
  sampleFinding("data_sharing", "Personal data may go to service providers and advertising partners.", "Your data may be used beyond operating the core service.", "We may share personal data with service providers and advertising partners.", "The policy does not explain what data each partner receives."),
  sampleFinding("fees_or_price_changes", "Prices may change at renewal after email notice.", "Review email notices before your next renewal.", "Prices may change at renewal after notice by email.", "The notice period and possible increase are not stated."),
  sampleFinding("service_changes", "Accounts that violate the terms may be suspended or terminated.", "A violation could interrupt or end your access.", "We may suspend or terminate accounts that violate these terms."),
];

function App() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [initialResult, setInitialResult] = useState<Result | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ text: string; citations: Citation[]; uncertainty: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("idle");
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [scenario, setScenario] = useState<SimulationScenario>("normal");
  const [fastDelay, setFastDelay] = useState(800);
  const [backgroundDelay, setBackgroundDelay] = useState(4000);
  const [statusMessage, setStatusMessage] = useState("");
  const operationId = useRef(0);
  const analysisController = useRef<AbortController | null>(null);

  useEffect(() => () => {
    operationId.current += 1;
    analysisController.current?.abort();
  }, []);

  function isCurrentOperation(id: number) {
    return operationId.current === id;
  }

  async function simulateAnalysis(id: number) {
    setReviewStatus("idle");
    setResult(null);
    setInitialResult(null);
    setAnswer(null);
    setStatusMessage("Waiting for the fast scan…");
    await new Promise(resolve => window.setTimeout(resolve, fastDelay));
    if (!isCurrentOperation(id)) return;
    const initialFindings = scenario === "no-fast" ? [] : fastFindings;
    const passages = [{ id: "P001", text }];
    const initial = { title: "Initial policy scan", policyType: "terms_of_service", overview: `Preliminary scan of ${passages.length} supplied passage(s). A fuller review is still running.`, findings: initialFindings, limitations: ["This is a simulated first pass. It is not an exhaustive or fully verified review."], passages };
    setInitialResult(initial);
    setResult(initial);
    setReviewStatus("fast");
    setStatusMessage("Initial scan ready. Full review in progress…");
    await new Promise(resolve => window.setTimeout(resolve, backgroundDelay));
    if (!isCurrentOperation(id)) return;
    if (scenario === "background-failure") {
      setReviewStatus("failed");
      setStatusMessage("Initial scan is available; the simulated full review failed.");
      return;
    }
    const additional = scenario === "duplicates" ? [fastFindings[0], ...backgroundFindings] : backgroundFindings;
    const mergedFindings = [...initialFindings, ...additional].filter((item, index, all) => all.findIndex(candidate => candidate.category === item.category && candidate.citation.excerpt === item.citation.excerpt) === index);
    const completed = {
      title: "Policy review",
      policyType: "terms_of_service",
      overview: `Full simulated review complete. ${mergedFindings.length} distinct finding(s).`,
      findings: mergedFindings,
      limitations: ["Simulated UI data only. These findings were not generated or verified by an AI provider."],
      passages,
    };
    setResult(completed);
    setReviewStatus("complete");
    setStatusMessage("Full simulated review complete.");
  }

  async function analyze() {
    analysisController.current?.abort();
    const controller = new AbortController();
    analysisController.current = controller;
    const id = ++operationId.current;
    setBusy(true);
    setError("");
    setStatusMessage("");
    setReviewStatus("idle");
    setResult(null);
    setInitialResult(null);
    setAnswer(null);
    if (isDevelopment && simulationEnabled) {
      try {
        await simulateAnalysis(id);
      } finally {
        if (isCurrentOperation(id)) setBusy(false);
      }
      return;
    }
    try {
      const response = await fetch("/api/analyze/staged", { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify({ text, background: true }), signal: controller.signal });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail ?? data.message ?? "Request failed");
      }
      setStatusMessage("Waiting for the fast AI scan…");
      let streamFailed = false;
      await consumeAnalysisEvents(response, (event, payload) => {
        if (!isCurrentOperation(id)) return;
        if (event === "initial" || event === "full") {
          const data = payload as Result;
          setResult(data);
          setStatusMessage(event === "initial" ? "Initial AI scan ready. Full review in progress…" : "Full AI review complete.");
          setReviewStatus(event === "initial" ? "fast" : "complete");
          if (event === "initial") setInitialResult(data);
        } else if (event === "error") {
          streamFailed = true;
          setReviewStatus("failed");
          const data = payload as { message?: string };
          setStatusMessage(data.message ?? "The full review failed. The initial findings are still available.");
        }
      });
      if (isCurrentOperation(id) && !streamFailed) {
        setReviewStatus(current => current === "fast" ? "complete" : current);
        setStatusMessage(current => current === "Waiting for the fast AI scan…" ? "The AI stream ended before any results arrived." : current);
      }
    } catch (reason) {
      if (isCurrentOperation(id) && !(reason instanceof DOMException && reason.name === "AbortError")) {
        const message = reason instanceof Error ? reason.message : "Analysis failed";
        setError(message);
        setReviewStatus(current => current === "fast" || current === "idle" ? "failed" : current);
        setStatusMessage(current => current === "Waiting for the fast AI scan…" ? "The AI scan failed before returning findings." : current === "Initial AI scan ready. Full review in progress…" ? "Full review failed. The initial findings are still available." : current);
      }
    } finally {
      if (analysisController.current === controller) analysisController.current = null;
      if (isCurrentOperation(id)) setBusy(false);
    }
  }

  async function ask() {
    if (!result || !question.trim() || (isDevelopment && simulationEnabled)) return;
    const id = operationId.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, question }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? data.error ?? "Request failed");
      if (isCurrentOperation(id)) setAnswer({ text: data.answer, citations: data.citations ?? [], uncertainty: data.uncertainty });
    } catch (reason) {
      if (isCurrentOperation(id)) setError(reason instanceof Error ? reason.message : "Question failed");
    } finally {
      if (isCurrentOperation(id)) setBusy(false);
    }
  }

  function handlePolicyChange(value: string) {
    operationId.current += 1;
    analysisController.current?.abort();
    setBusy(false);
    setReviewStatus("idle");
    setResult(null);
    setInitialResult(null);
    setAnswer(null);
    setError("");
    setStatusMessage("");
    setText(value);
  }

  function setFastDelayAndReset(value: number) {
    operationId.current += 1;
    analysisController.current?.abort();
    setBusy(false);
    setReviewStatus("idle");
    setResult(null);
    setInitialResult(null);
    setStatusMessage("");
    setFastDelay(value);
  }

  function setBackgroundDelayAndReset(value: number) {
    operationId.current += 1;
    analysisController.current?.abort();
    setBusy(false);
    setReviewStatus("idle");
    setResult(null);
    setInitialResult(null);
    setStatusMessage("");
    setBackgroundDelay(value);
  }

  function changeScenario(value: string) {
    operationId.current += 1;
    analysisController.current?.abort();
    setBusy(false);
    setReviewStatus("idle");
    setResult(null);
    setInitialResult(null);
    setStatusMessage("");
    setScenario(value as SimulationScenario);
  }

  function loadSample() {
    operationId.current += 1;
    analysisController.current?.abort();
    setBusy(false);
    setReviewStatus("idle");
    setResult(null);
    setInitialResult(null);
    setAnswer(null);
    setError("");
    setStatusMessage("");
    setText(samplePolicy);
  }

  const displayedFindings = result?.findings ?? [];
  const initialFindingKeys = new Set(initialResult?.findings.map(finding => `${finding.category}|${finding.citation.excerpt}`) ?? []);
  const isAddedFinding = (finding: Finding) => initialResult !== result && !initialFindingKeys.has(`${finding.category}|${finding.citation.excerpt}`);
  const addedFindings = displayedFindings.filter(isAddedFinding).length;
  const isFullReviewRunning = reviewStatus === "fast";

  return <main>
    <header><span className="eyebrow">TOS DECIPHER</span><h1>Understand the fine print.</h1><p>Paste a policy and get a plain-language explanation grounded in its own wording.</p></header>
    {isDevelopment && <section className="simulator"><div className="simulator-heading"><div><span className="tag">Development tool</span><h2>Fast / slow flow simulator</h2><p>Simulate staged results without calling an AI provider.</p></div><label className="toggle"><input type="checkbox" checked={simulationEnabled} onChange={event => { operationId.current += 1; analysisController.current?.abort(); setBusy(false); setSimulationEnabled(event.target.checked); setReviewStatus("idle"); setResult(null); setInitialResult(null); setStatusMessage(""); }} /> Enable simulation</label></div>{simulationEnabled && <div className="sim-controls"><label htmlFor="scenario">Scenario</label><select id="scenario" value={scenario} onChange={event => changeScenario(event.target.value)}><option value="normal">Normal: fast scan, then full review</option><option value="no-fast">No fast findings</option><option value="background-failure">Background review fails</option><option value="duplicates">Deduplicate repeated finding</option></select><label htmlFor="fast-delay">Fast scan delay <span>{fastDelay} ms</span></label><input id="fast-delay" type="range" min="100" max="5000" step="100" value={fastDelay} onChange={event => setFastDelayAndReset(Number(event.target.value))} /><label htmlFor="background-delay">Background delay <span>{backgroundDelay} ms</span></label><input id="background-delay" type="range" min="500" max="15000" step="500" value={backgroundDelay} onChange={event => setBackgroundDelayAndReset(Number(event.target.value))} /><button className="secondary-button" onClick={loadSample}>Load sample policy</button></div>}</section>}
    <section className="input"><label htmlFor="policy">Policy text</label><textarea id="policy" value={text} onChange={event => handlePolicyChange(event.target.value)} placeholder="Paste Terms of Service or a Privacy Policy here..." /><button onClick={analyze} disabled={busy || text.length < 80}>{busy ? (simulationEnabled ? "Simulating…" : "Working…") : (simulationEnabled ? "Simulate staged review" : "Review policy")}</button></section>
    {error && <div className="error" role="alert">{error}</div>}
    {statusMessage && <div className={`review-status ${reviewStatus}`} role="status"><span className="status-dot" />{statusMessage}{reviewStatus === "fast" && <span className="status-progress">More findings may arrive.</span>}{reviewStatus === "complete" && initialResult !== result && <span className="status-progress">{addedFindings} additional finding(s).</span>}</div>}
    {result && <section className="results"><div className="summary"><span className="eyebrow">{result.policyType}</span><h2>{result.title}</h2><p>{result.overview}</p>{isDevelopment && simulationEnabled && reviewStatus !== "idle" && <span className="sim-badge">SIMULATED · NO MODEL CALLS</span>}</div>{isFullReviewRunning && <div className="background-banner"><span className="spinner" />Full review in progress. You can read the initial findings now.</div>}<h2>Important points</h2>{displayedFindings.length === 0 && <div className="notice">{isFullReviewRunning ? "No high-confidence points in the initial scan yet. The full review is still running." : "No evidence-backed findings were returned. The policy may be incomplete, or AI providers may not be configured."}</div>}{displayedFindings.map((finding, index) => <article className={`finding ${reviewStatus === "complete" && isAddedFinding(finding) ? "background-finding" : ""}`} key={`${finding.category}-${finding.citation.passageId}-${finding.citation.excerpt}-${index}`}><span className="tag">{finding.category.replaceAll("_", " ")}</span>{reviewStatus === "complete" && isAddedFinding(finding) && <span className="background-added">Added in full review</span>}<h3>{finding.explanation}</h3><p>{finding.implication}</p>{finding.uncertainty && <p className="uncertainty">{finding.uncertainty}</p>}<details><summary>Show source · {finding.citation.passageId}</summary><blockquote>{finding.citation.excerpt}</blockquote></details></article>)}{result.limitations.length > 0 && <div className="notice"><strong>Review scope</strong>{result.limitations.map(item => <p key={item}>{item}</p>)}</div>}{!(isDevelopment && simulationEnabled) && <div className="ask"><h2>Ask about this policy</h2><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="What happens if I cancel?" /><button onClick={ask} disabled={busy || !question.trim()}>Ask</button>{answer && <div className="answer"><p>{answer.text}</p><p className="uncertainty">{answer.uncertainty}</p>{answer.citations.map(citation => <blockquote key={`${citation.passageId}-${citation.excerpt}`}>{citation.passageId}: {citation.excerpt}</blockquote>)}</div>}</div>}</section>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
