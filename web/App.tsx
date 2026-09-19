import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.ts";

type View = "focus" | "direction" | "review" | "agents";

interface Vision { text: string; revision: number; updated_at: string; history?: { text: string; revision: number; created_at: string }[]; }
interface Outcome { id: string; title: string; description: string; status: string; confidence: string; target_date: string | null; revision: number; }
interface Bet { id: string; outcome_id: string | null; title: string; assumption: string; rationale: string; confidence: string; status: string; review_date: string | null; revision: number; }
interface Task { id: string; title: string; status: string; priority: string; deadline: string | null; outcome_id: string | null; bet_id: string | null; blocked: number; revision: number; }
interface Signal { id: string; title: string; kind: string; evidence: string; outcome_id: string | null; bet_id: string | null; occurred_at: string; }
interface Proposal { id: string; job_type: string; status: string; rationale: string; changes_json: string; evidence_json: string; affected_json: string; adapter: string | null; cache_hit: number; token_estimate: number; created_at: string; }
interface Decision { id: string; proposal_id: string | null; action: string; note: string; created_at: string; }
interface Adapter { id: string; bin: string; model: string; available: boolean; notes: string; }
interface Run { id: string; adapter: string; job_type: string; status: string; est_tokens: number; reported_tokens: number | null; error: string; started_at: string; }
interface NowView { overdue: Task[]; dueNext: Task[]; ordered: Task[]; blocked: Task[]; }

const VIEW_META: Record<View, { label: string; eyebrow: string }> = {
  focus: { label: "Focus", eyebrow: "Command center" },
  direction: { label: "Direction", eyebrow: "Vision and outcomes" },
  review: { label: "Review", eyebrow: "Signals and decisions" },
  agents: { label: "System", eyebrow: "Agents and runs" },
};

export default function App() {
  const [view, setView] = useState<View>("focus");
  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">N</span>
          <span>Nerve<small>Founder control room</small></span>
        </div>
        <nav className="tabs" aria-label="Main views">
          {(["focus", "direction", "review", "agents"] as View[]).map((v, index) => (
            <button key={v} aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>
              <span className="nav-index" aria-hidden="true">0{index + 1}</span>
              <span>{VIEW_META[v].label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-note">
          <span className="status-light" aria-hidden="true" />
          Local and founder-controlled
          <small>Nothing changes without your approval.</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{VIEW_META[view].eyebrow}</p>
            <p className="view-title">{VIEW_META[view].label}</p>
          </div>
          <p className="today-label">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date())}</p>
        </header>
        <main>
          {view === "focus" && <Focus />}
          {view === "direction" && <Direction />}
          {view === "review" && <Review />}
          {view === "agents" && <Agents />}
        </main>
      </div>
    </div>
  );
}

function useLoad<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    api<T>(path).then((d) => { setData(d); setError(""); }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => { reload(); }, [reload, ...deps]);
  return { data, error, loading, reload, setData };
}

function Err({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="error" role="alert">{msg}</div>;
}

/* ---------------- Direction ---------------- */
function Direction() {
  const vision = useLoad<Vision>("/api/vision");
  const outcomes = useLoad<Outcome[]>("/api/outcomes");
  const bets = useLoad<Bet[]>("/api/bets");
  const [visionText, setVisionText] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { if (vision.data) setVisionText(vision.data.text); }, [vision.data]);

  async function saveVision(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      const v = await api<Vision>("/api/vision", { method: "PUT", body: { text: visionText } });
      vision.setData(v); setMsg("Vision saved.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "save failed"); }
  }

  const betsByOutcome = useMemo(() => {
    const m = new Map<string | null, Bet[]>();
    for (const b of bets.data ?? []) {
      const k = b.outcome_id;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(b);
    }
    return m;
  }, [bets.data]);

  return (
    <div>
      <section className="card" aria-labelledby="vision-h">
        <h2 id="vision-h">Vision</h2>
        <Err msg={vision.error} />
        {vision.loading ? <p className="muted">Loading…</p> : (
          <form onSubmit={saveVision}>
            <label htmlFor="vision-text">Single current vision{vision.data && vision.data.text === "" ? " — start here" : ""}</label>
            <textarea id="vision-text" value={visionText} onChange={(e) => setVisionText(e.target.value)} placeholder="e.g. Independent developers can run a calm one-person software business." />
            <div className="actions">
              <button className="primary" type="submit">{!vision.data?.text ? "Create vision" : "Save vision"}</button>
              {vision.data && <span className="small muted">Revision {vision.data.revision}</span>}
            </div>
            {msg && <p className="small muted" role="status">{msg}</p>}
          </form>
        )}
      </section>

      {vision.data && (vision.data.history ?? []).length > 0 && (
        <section className="card" aria-labelledby="vision-hist-h">
          <h2 id="vision-hist-h">Vision history</h2>
          <details>
            <summary>Previous versions ({(vision.data.history ?? []).length})</summary>
            <ul className="list">
              {(vision.data.history ?? []).map((h) => (
                <li key={`${h.revision}-${h.created_at}`}><span className="pill">rev {h.revision}</span><span className="small muted">{h.created_at}</span><div>{h.text}</div></li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <section className="card" aria-labelledby="outcomes-h">
        <h2 id="outcomes-h">Outcomes</h2>
        <Err msg={outcomes.error} />
        <OutcomeForm onDone={() => outcomes.reload()} outcomes={outcomes.data ?? []} />
        <ul className="list">
          {(outcomes.data ?? []).map((o) => (
            <li key={o.id}>
              <OutcomeRow o={o} bets={betsByOutcome.get(o.id) ?? []} onDone={() => { outcomes.reload(); bets.reload(); }} />
            </li>
          ))}
          {(outcomes.data ?? []).length === 0 && !outcomes.loading && <li className="muted">No outcomes yet. Add one measurable desired outcome above.</li>}
        </ul>
      </section>

      <section className="card" aria-labelledby="bets-h">
        <h2 id="bets-h">Bets and assumptions</h2>
        <Err msg={bets.error} />
        <BetForm outcomes={outcomes.data ?? []} onDone={() => bets.reload()} />
        <ul className="list">
          {(bets.data ?? []).filter((b) => b.outcome_id).map((b) => (
            <li key={b.id}>
              <BetRow b={b} outcomes={outcomes.data ?? []} onDone={() => bets.reload()} />
            </li>
          ))}
          {(bets.data ?? []).length === 0 && !bets.loading && <li className="muted">No bets yet. State one bet with its assumption, confidence, and review date.</li>}
        </ul>
        {(betsByOutcome.get(null) ?? []).length > 0 && (
          <div>
            <h3>Unlinked bets</h3>
            <ul className="list">
              {(betsByOutcome.get(null) ?? []).map((b) => (
                <li key={b.id}><BetRow b={b} outcomes={outcomes.data ?? []} onDone={() => bets.reload()} /></li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function OutcomeForm({ onDone }: { onDone: () => void; outcomes: Outcome[] }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try {
      await api("/api/outcomes", { method: "POST", body: { title, description: desc, target_date: target || null } });
      setTitle(""); setDesc(""); setTarget(""); onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "failed"); }
  }
  return (
    <form onSubmit={submit}>
      <Err msg={error} />
      <label htmlFor="oc-title">New outcome (measurable)</label>
      <input id="oc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 10 paying users by 2026-12-31" />
      <label htmlFor="oc-desc">Description</label>
      <input id="oc-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="How will you know?" />
      <div className="row">
        <div><label htmlFor="oc-target">Target date</label><input id="oc-target" type="date" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
      </div>
      <div className="actions"><button className="primary" type="submit">Add outcome</button></div>
    </form>
  );
}

function OutcomeRow({ o, bets, onDone }: { o: Outcome; bets: Bet[]; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(o.title);
  const [status, setStatus] = useState(o.status);
  const [conf, setConf] = useState(o.confidence);
  const [error, setError] = useState("");
  async function save() {
    setError("");
    try {
      await api(`/api/outcomes/${o.id}`, { method: "PATCH", body: { title, status, confidence: conf } });
      setEditing(false); onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "save failed"); }
  }
  async function del() {
    if (!confirm("Archive instead of delete where possible. Delete this outcome?")) return;
    setError("");
    try {
      await api(`/api/outcomes/${o.id}`, { method: "DELETE" });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "delete failed"); }
  }
  if (!editing) {
    return (
      <div>
        <strong>{o.title}</strong> <span className="pill">{o.status}</span><span className="pill">{o.confidence} confidence</span>
        {o.target_date && <span className="pill">target {o.target_date}</span>}
        <div className="small muted">{o.description || "No description."} Linked bets: {bets.length}. Revision {o.revision}.</div>
        <Err msg={error} />
        <div className="actions"><button onClick={() => setEditing(true)}>Edit</button><button className="danger" onClick={del}>Delete</button></div>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Err msg={error} />
      <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="row">
        <div><label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">active</option><option value="done">done</option><option value="archived">archived</option></select></label></div>
        <div><label>Confidence<select value={conf} onChange={(e) => setConf(e.target.value)}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label></div>
      </div>
      <div className="actions"><button className="primary" type="submit">Save</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></div>
    </form>
  );
}

function BetForm({ outcomes, onDone }: { outcomes: Outcome[]; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [assumption, setAssumption] = useState("");
  const [outcomeId, setOutcomeId] = useState("");
  const [review, setReview] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try {
      await api("/api/bets", { method: "POST", body: { title, assumption, outcome_id: outcomeId || null, review_date: review || null } });
      setTitle(""); setAssumption(""); setOutcomeId(""); setReview(""); onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "failed"); }
  }
  return (
    <form onSubmit={submit}>
      <Err msg={error} />
      <label htmlFor="bet-title">New bet</label>
      <input id="bet-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Solo founders will pay for weekly review help" />
      <label htmlFor="bet-assume">Assumption</label>
      <input id="bet-assume" value={assumption} onChange={(e) => setAssumption(e.target.value)} placeholder="What must be true?" />
      <div className="row">
        <div><label htmlFor="bet-oc">Linked outcome<select id="bet-oc" value={outcomeId} onChange={(e) => setOutcomeId(e.target.value)}><option value="">None</option>{outcomes.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></label></div>
        <div><label htmlFor="bet-rev">Review date<input id="bet-rev" type="date" value={review} onChange={(e) => setReview(e.target.value)} /></label></div>
      </div>
      <div className="actions"><button className="primary" type="submit">Add bet</button></div>
    </form>
  );
}

function BetRow({ b, outcomes, onDone }: { b: Bet; outcomes: Outcome[]; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(b.status);
  const [conf, setConf] = useState(b.confidence);
  const [review, setReview] = useState(b.review_date ?? "");
  const [error, setError] = useState("");
  const oc = outcomes.find((o) => o.id === b.outcome_id);
  async function save() {
    setError("");
    try {
      await api(`/api/bets/${b.id}`, { method: "PATCH", body: { status, confidence: conf, review_date: review || null } });
      setEditing(false); onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "save failed"); }
  }
  if (!editing) {
    return (
      <div>
        <strong>{b.title}</strong> <span className="pill">{b.status}</span><span className="pill">{b.confidence}</span>
        {b.review_date && <span className="pill">review {b.review_date}</span>}
        <div className="small muted">Assumes: {b.assumption || "—"} {oc ? `Linked: ${oc.title}.` : "Unlinked."} Revision {b.revision}.</div>
        <div className="actions"><button onClick={() => setEditing(true)}>Edit</button></div>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Err msg={error} />
      <div className="row">
        <div><label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">open</option><option value="supported">supported</option><option value="refuted">refuted</option><option value="archived">archived</option></select></label></div>
        <div><label>Confidence<select value={conf} onChange={(e) => setConf(e.target.value)}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label></div>
        <div><label>Review date<input type="date" value={review} onChange={(e) => setReview(e.target.value)} /></label></div>
      </div>
      <div className="actions"><button className="primary" type="submit">Save</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></div>
    </form>
  );
}

/* ---------------- Focus ---------------- */
function Focus() {
  const now = useLoad<NowView>("/api/now");
  const outcomes = useLoad<Outcome[]>("/api/outcomes");
  const bets = useLoad<Bet[]>("/api/bets");
  const allTasks = useLoad<Task[]>("/api/tasks");
  const signals = useLoad<Signal[]>("/api/signals");
  const proposals = useLoad<Proposal[]>("/api/proposals");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState("p2");
  const [outcomeId, setOutcomeId] = useState("");
  const [betId, setBetId] = useState("");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const today = useMemo(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }, []);
  const horizon = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }, []);

  const activeOutcomes = (outcomes.data ?? []).filter((o) => o.status === "active");
  const activeTasks = (allTasks.data ?? []).filter((t) => t.status === "open" || t.status === "doing");
  const reviewDueBets = (bets.data ?? []).filter((b) => b.status === "open" && !!b.review_date && b.review_date <= today);
  const refutedBets = (bets.data ?? []).filter((b) => b.status === "refuted");
  const atRiskOutcomes = activeOutcomes.filter((o) => o.confidence === "low" || (!!o.target_date && o.target_date < today));
  const unlinkedTasks = activeTasks.filter((t) => !t.outcome_id);
  const pendingProposals = (proposals.data ?? []).filter((p) => p.status === "pending");
  const upcomingTasks = (now.data?.dueNext ?? []).filter((t) => !!t.deadline && t.deadline <= horizon).slice(0, 5);
  const upcomingOutcomes = activeOutcomes.filter((o) => !!o.target_date && o.target_date >= today && o.target_date <= horizon);
  const upcomingReviews = (bets.data ?? []).filter((b) => b.status === "open" && !!b.review_date && b.review_date > today && b.review_date <= horizon);
  const driftCount = (now.data?.overdue.length ?? 0) + (now.data?.blocked.length ?? 0) + reviewDueBets.length + refutedBets.length + atRiskOutcomes.length + unlinkedTasks.length;

  function reloadWork() {
    now.reload();
    allTasks.reload();
  }

  async function quickCapture(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/tasks", { method: "POST", body: { title, deadline: deadline || null, priority, outcome_id: outcomeId || null, bet_id: betId || null } });
      setTitle("");
      setDeadline("");
      setOutcomeId("");
      setBetId("");
      reloadWork();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Capture failed");
    }
  }

  async function updateTask(t: Task, patch: Record<string, unknown>) {
    setActionError("");
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", body: patch });
      reloadWork();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Update failed");
    }
  }

  const outcomeName = (id: string | null) => (outcomes.data ?? []).find((o) => o.id === id)?.title;
  const betName = (id: string | null) => (bets.data ?? []).find((b) => b.id === id)?.title;

  const renderTask = (t: Task) => {
    const linkedOutcome = outcomeName(t.outcome_id);
    const linkedBet = betName(t.bet_id);
    const isOverdue = !!t.deadline && t.deadline < today;
    return (
      <li className="action-item" key={t.id}>
        <button className="complete-button" aria-label={`Mark ${t.title} done`} title="Mark done" onClick={() => updateTask(t, { status: "done" })}>
          <span aria-hidden="true" />
        </button>
        <div className="action-body">
          <div className="action-title-line">
            <strong>{t.title}</strong>
            <span className={`priority priority-${t.priority}`}>{t.priority}</span>
          </div>
          <div className="action-context">
            <span className={linkedOutcome ? "outcome-link" : "outcome-link unlinked"}>{linkedOutcome ?? "No outcome — possible drift"}</span>
            {linkedBet && <span>via {linkedBet}</span>}
          </div>
        </div>
        <div className="action-state">
          <span className={isOverdue ? "date-chip is-danger" : "date-chip"}>{t.deadline ? (isOverdue ? `Overdue · ${t.deadline}` : `Due ${t.deadline}`) : "No date"}</span>
          <div className="inline-actions">
            {t.status === "open" && <button onClick={() => updateTask(t, { status: "doing" })}>Start</button>}
            {t.status === "doing" && <button onClick={() => updateTask(t, { status: "open" })}>Pause</button>}
            <button onClick={() => updateTask(t, { blocked: t.blocked ? 0 : 1 })}>{t.blocked ? "Unblock" : "Block"}</button>
          </div>
        </div>
      </li>
    );
  };

  if (now.loading && outcomes.loading && allTasks.loading) {
    return <div className="loading-state">Building your current picture…</div>;
  }

  return (
    <div className="focus-page">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Your operating picture</p>
          <h1>Know what matters next.</h1>
          <p>Actions are anchored to outcomes. Drift, blockers, and approaching pressure stay visible.</p>
        </div>
        <details className="capture-panel">
          <summary>Capture an action</summary>
          <form onSubmit={quickCapture}>
            <Err msg={error} />
            <label htmlFor="focus-task-title">Next concrete action</label>
            <input id="focus-task-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to move?" />
            <div className="row">
              <div><label htmlFor="focus-task-outcome">Outcome<select id="focus-task-outcome" value={outcomeId} onChange={(e) => setOutcomeId(e.target.value)}><option value="">Unlinked</option>{activeOutcomes.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></label></div>
              <div><label htmlFor="focus-task-bet">Bet<select id="focus-task-bet" value={betId} onChange={(e) => setBetId(e.target.value)}><option value="">None</option>{(bets.data ?? []).filter((b) => b.status === "open").map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label></div>
            </div>
            <div className="row">
              <div><label htmlFor="focus-task-due">Deadline<input id="focus-task-due" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label></div>
              <div><label htmlFor="focus-task-priority">Priority<select id="focus-task-priority" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="p0">P0 · critical</option><option value="p1">P1 · important</option><option value="p2">P2 · normal</option><option value="p3">P3 · later</option></select></label></div>
            </div>
            <div className="actions"><button className="primary" type="submit">Add action</button></div>
          </form>
        </details>
      </section>

      <Err msg={now.error || outcomes.error || bets.error || allTasks.error || signals.error || proposals.error || actionError} />

      <section className="pulse-grid" aria-label="Current state">
        <div className="pulse-card"><span>Active outcomes</span><strong>{activeOutcomes.length}</strong><small>{activeOutcomes.filter((o) => o.confidence === "high").length} high confidence</small></div>
        <div className="pulse-card"><span>Actions in motion</span><strong>{activeTasks.filter((t) => t.status === "doing").length}</strong><small>{activeTasks.length} open in total</small></div>
        <div className={`pulse-card ${driftCount ? "pulse-alert" : "pulse-clear"}`}><span>Signals of drift</span><strong>{driftCount}</strong><small>{driftCount ? "Needs a decision" : "Operating cleanly"}</small></div>
        <div className={`pulse-card ${pendingProposals.length ? "pulse-waiting" : ""}`}><span>Decisions waiting</span><strong>{pendingProposals.length}</strong><small>{pendingProposals.length ? "Proposals need review" : "Nothing queued"}</small></div>
      </section>

      <div className="command-grid">
        <div className="command-main">
          <section className="panel next-actions" aria-labelledby="next-actions-h">
            <div className="panel-heading">
              <div><p className="eyebrow">Execution</p><h2 id="next-actions-h">Next actions</h2></div>
              <span className="panel-count">{now.data?.ordered.length ?? 0} active</span>
            </div>
            <p className="panel-description">Ordered by reality: overdue, deadline, then priority.</p>
            <ul className="action-list">
              {(now.data?.ordered ?? []).slice(0, 8).map(renderTask)}
              {(now.data?.ordered.length ?? 0) === 0 && <li className="empty-state"><strong>No active actions.</strong><span>Capture one and connect it to the outcome it advances.</span></li>}
            </ul>
            {(now.data?.ordered.length ?? 0) > 8 && <p className="list-footnote">Showing the first 8 of {now.data?.ordered.length}. Resolve the top before pulling more in.</p>}
          </section>

          <section className="panel outcome-map" aria-labelledby="outcome-map-h">
            <div className="panel-heading">
              <div><p className="eyebrow">Direction</p><h2 id="outcome-map-h">Outcome map</h2></div>
              <span className="panel-count">{activeOutcomes.length} active</span>
            </div>
            <p className="panel-description">Each outcome shows the bets behind it, its execution load, and where it is slipping.</p>
            <div className="outcome-list">
              {activeOutcomes.map((o) => {
                const outcomeTasks = (allTasks.data ?? []).filter((t) => t.outcome_id === o.id);
                const openTasks = outcomeTasks.filter((t) => t.status === "open" || t.status === "doing");
                const doneTasks = outcomeTasks.filter((t) => t.status === "done");
                const outcomeBets = (bets.data ?? []).filter((b) => b.outcome_id === o.id && b.status !== "archived");
                const slipped = openTasks.filter((t) => !!t.deadline && t.deadline < today);
                const stuck = openTasks.filter((t) => !!t.blocked);
                const next = (now.data?.ordered ?? []).find((t) => t.outcome_id === o.id);
                return (
                  <article className="outcome-card" key={o.id}>
                    <div className="outcome-card-top">
                      <div><span className={`confidence confidence-${o.confidence}`}>{o.confidence} confidence</span><h3>{o.title}</h3></div>
                      <span className={o.target_date && o.target_date < today ? "date-chip is-danger" : "date-chip"}>{o.target_date ? `Target ${o.target_date}` : "No target date"}</span>
                    </div>
                    {o.description && <p>{o.description}</p>}
                    <div className="outcome-facts">
                      <span><strong>{openTasks.length}</strong> open actions</span>
                      <span><strong>{doneTasks.length}</strong> completed</span>
                      <span><strong>{outcomeBets.length}</strong> tracked bets</span>
                    </div>
                    {(slipped.length > 0 || stuck.length > 0 || outcomeBets.some((b) => b.status === "refuted")) && (
                      <div className="drift-tags">
                        {slipped.length > 0 && <span>{slipped.length} overdue</span>}
                        {stuck.length > 0 && <span>{stuck.length} blocked</span>}
                        {outcomeBets.some((b) => b.status === "refuted") && <span>assumption refuted</span>}
                      </div>
                    )}
                    <div className="outcome-next"><span>Next move</span><strong>{next?.title ?? "No action connected"}</strong></div>
                  </article>
                );
              })}
              {activeOutcomes.length === 0 && <div className="empty-state"><strong>No active outcomes.</strong><span>Define the result you are trying to create in Direction, then anchor work to it.</span></div>}
            </div>
          </section>
        </div>

        <aside className="command-aside" aria-label="Drift and incoming signals">
          <section className="panel attention-panel">
            <div className="panel-heading">
              <div><p className="eyebrow danger-text">Exceptions</p><h2>Drift radar</h2></div>
              <span className={driftCount ? "alert-count" : "clear-count"}>{driftCount}</span>
            </div>
            <div className="radar-sections">
              {(now.data?.overdue ?? []).length > 0 && <div className="radar-group"><h3>Went sideways</h3>{(now.data?.overdue ?? []).slice(0, 4).map((t) => <div className="radar-item danger" key={`late-${t.id}`}><span>Overdue</span><strong>{t.title}</strong><small>{outcomeName(t.outcome_id) ?? "No outcome"} · {t.deadline}</small></div>)}</div>}
              {(now.data?.blocked ?? []).length > 0 && <div className="radar-group"><h3>Stuck</h3>{(now.data?.blocked ?? []).slice(0, 4).map((t) => <div className="radar-item warning" key={`blocked-${t.id}`}><span>Blocked</span><strong>{t.title}</strong><small>{outcomeName(t.outcome_id) ?? "No outcome"}</small></div>)}</div>}
              {(reviewDueBets.length > 0 || refutedBets.length > 0 || atRiskOutcomes.length > 0) && <div className="radar-group"><h3>Strategy at risk</h3>{refutedBets.slice(0, 3).map((b) => <div className="radar-item danger" key={`refuted-${b.id}`}><span>Refuted bet</span><strong>{b.title}</strong><small>{outcomeName(b.outcome_id) ?? "Unlinked"}</small></div>)}{reviewDueBets.slice(0, 3).map((b) => <div className="radar-item warning" key={`review-${b.id}`}><span>Review due</span><strong>{b.title}</strong><small>{b.review_date}</small></div>)}{atRiskOutcomes.slice(0, 3).map((o) => <div className="radar-item warning" key={`risk-${o.id}`}><span>Outcome risk</span><strong>{o.title}</strong><small>{o.target_date && o.target_date < today ? `Target passed ${o.target_date}` : "Low confidence"}</small></div>)}</div>}
              {unlinkedTasks.length > 0 && <div className="radar-group"><h3>Losing alignment</h3>{unlinkedTasks.slice(0, 4).map((t) => <div className="radar-item neutral" key={`unlinked-${t.id}`}><span>Unlinked action</span><strong>{t.title}</strong><small>Connect it to an outcome or drop it.</small></div>)}</div>}
              {driftCount === 0 && <div className="clear-state"><span className="clear-mark" aria-hidden="true">✓</span><strong>No drift detected</strong><p>No overdue, blocked, unlinked, or strategically at-risk work.</p></div>}
            </div>
          </section>

          <section className="panel horizon-panel">
            <div className="panel-heading"><div><p className="eyebrow">Next 14 days</p><h2>On the horizon</h2></div></div>
            <ul className="timeline-list">
              {upcomingTasks.map((t) => <li key={`up-${t.id}`}><time>{t.deadline}</time><div><strong>{t.title}</strong><span>{outcomeName(t.outcome_id) ?? "No outcome"}</span></div></li>)}
              {upcomingReviews.map((b) => <li key={`up-bet-${b.id}`}><time>{b.review_date}</time><div><strong>Review: {b.title}</strong><span>Assumption checkpoint</span></div></li>)}
              {upcomingOutcomes.map((o) => <li key={`up-outcome-${o.id}`}><time>{o.target_date}</time><div><strong>{o.title}</strong><span>Outcome target</span></div></li>)}
              {upcomingTasks.length + upcomingReviews.length + upcomingOutcomes.length === 0 && <li className="quiet-state">No deadlines or reviews approaching.</li>}
            </ul>
          </section>

          <section className="panel reality-panel">
            <div className="panel-heading"><div><p className="eyebrow">Evidence</p><h2>Reality feed</h2></div><span className="panel-count">{signals.data?.length ?? 0}</span></div>
            <ul className="signal-list">
              {(signals.data ?? []).slice(0, 4).map((s) => <li key={s.id}><span className="signal-kind">{s.kind}</span><strong>{s.title}</strong><p>{s.evidence || "No evidence recorded."}</p></li>)}
              {!signals.loading && (signals.data ?? []).length === 0 && <li className="quiet-state">No signals captured yet. Record what reality is telling you in Review.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ---------------- Review ---------------- */
const JOB_LABELS: Record<string, string> = {
  "clarify-vision": "Clarify vision",
  "challenge-bet": "Challenge a bet",
  "assess-signal": "Assess a signal",
  "replan-work": "Replan work",
  "weekly-review": "Weekly review",
};

function ProposalItem({ p, onDecided }: { p: Proposal; onDecided: (msg: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => {
    try {
      return JSON.stringify({ changes: JSON.parse(p.changes_json), evidence: JSON.parse(p.evidence_json), affected: JSON.parse(p.affected_json) }, null, 2);
    } catch { return "(could not parse proposed changes)"; }
  }, [p.changes_json, p.evidence_json, p.affected_json]);
  async function decide(action: "accept" | "reject") {
    setBusy(true);
    try {
      await api(`/api/proposals/${p.id}/${action}`, { method: "POST", body: { note } });
      setNote(""); onDecided(`${action === "accept" ? "Accepted and applied." : "Rejected."}`);
    } catch (e) { onDecided(e instanceof Error ? e.message : "decision failed"); }
    finally { setBusy(false); }
  }
  return (
    <li>
      <strong>{JOB_LABELS[p.job_type] ?? p.job_type}</strong>{" "}
      <span className="pill">{p.status}</span>
      {p.cache_hit ? <span className="pill">cache hit</span> : <span className="pill">cache miss</span>}
      <span className="pill">~{p.token_estimate} tokens</span>
      <div className="small muted">{p.rationale}</div>
      <details>
        <summary>Exact proposed changes</summary>
        <pre className="json">{parsed}</pre>
      </details>
      {p.status === "pending" && (
        <div>
          <label htmlFor={`note-${p.id}`}>Decision note (optional)</label>
          <input id={`note-${p.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why accept or reject?" />
          <div className="actions">
            <button className="primary" onClick={() => decide("accept")} disabled={busy}>Accept and apply</button>
            <button className="danger" onClick={() => decide("reject")} disabled={busy}>Reject</button>
          </div>
        </div>
      )}
    </li>
  );
}

function Review() {
  const signals = useLoad<Signal[]>("/api/signals");
  const proposals = useLoad<Proposal[]>("/api/proposals");
  const decisions = useLoad<Decision[]>("/api/decisions");
  const outcomes = useLoad<Outcome[]>("/api/outcomes");
  const bets = useLoad<Bet[]>("/api/bets");
  const [title, setTitle] = useState("");
  const [evidence, setEvidence] = useState("");
  const [kind, setKind] = useState("note");
  const [outcomeId, setOutcomeId] = useState("");
  const [betId, setBetId] = useState("");
  // Job scope is separate from the signal-capture form above: sharing state
  // let a lingering capture selection silently narrow a weekly review.
  const [jobOutcomeId, setJobOutcomeId] = useState("");
  const [jobBetId, setJobBetId] = useState("");
  const [jobSignalId, setJobSignalId] = useState("");
  const [jobType, setJobType] = useState("assess-signal");
  const [adapter, setAdapter] = useState("codex");
  const [adapters, setAdapters] = useState<Adapter[] | null>(null);
  const [jobMsg, setJobMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Adapter[]>("/api/adapters").then((a) => {
      setAdapters(a);
      // Default to the first available adapter, not a hard-coded id that
      // may be missing on this machine.
      const first = a.find((x) => x.available);
      if (first) setAdapter((cur) => (a.some((x) => x.id === cur && x.available) ? cur : first.id));
    }).catch(() => setAdapters([]));
  }, []);

  async function addSignal(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try {
      await api("/api/signals", { method: "POST", body: { title, kind, evidence, outcome_id: outcomeId || null, bet_id: betId || null, occurred_at: new Date().toISOString() } });
      setTitle(""); setEvidence(""); signals.reload();
    } catch (e) { setError(e instanceof Error ? e.message : "failed"); }
  }

  async function runAgent(e: React.FormEvent) {
    e.preventDefault(); setJobMsg(""); setBusy(true);
    try {
      if (jobType === "challenge-bet" && !jobBetId) throw new Error("Pick a bet to challenge.");
      if (jobType === "assess-signal" && !jobSignalId) throw new Error("Pick a signal to assess.");
      const r = await api<{ proposalId: string; cacheHit: boolean; tokenEstimate: number }>("/api/jobs", {
        method: "POST",
        body: {
          adapter, job_type: jobType,
          refs: {
            ...(jobOutcomeId ? { outcomeId: jobOutcomeId } : {}),
            ...(jobBetId ? { betId: jobBetId } : {}),
            ...(jobSignalId ? { signalId: jobSignalId } : {}),
          },
        },
      });
      setJobMsg(`Proposal ready. Cache ${r.cacheHit ? "hit" : "miss"}. Estimated tokens: ${r.tokenEstimate}.`);
      proposals.reload();
    } catch (e) { setJobMsg(e instanceof Error ? e.message : "agent run failed"); }
    finally { setBusy(false); }
  }

  function onDecided(msg: string) {
    setJobMsg(msg); proposals.reload(); decisions.reload();
  }

  const pending = (proposals.data ?? []).filter((p) => p.status === "pending");
  const avail = (adapters ?? []).filter((a) => a.available);
  const checkingAdapters = adapters === null;
  const proposalById = useMemo(() => new Map((proposals.data ?? []).map((p) => [p.id, p])), [proposals.data]);

  return (
    <div>
      <section className="card" aria-labelledby="changed-h">
        <h2 id="changed-h">What changed?</h2>
        <p className="muted">Capture what you observed in reality first. Evidence beats opinion.</p>
        <Err msg={error} />
        <form onSubmit={addSignal}>
          <label htmlFor="sig-title">Signal</label>
          <input id="sig-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Two prospects asked for weekly reviews" />
          <label htmlFor="sig-ev">Evidence</label>
          <textarea id="sig-ev" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Who, when, exact words or numbers" />
          <div className="row">
            <div><label htmlFor="sig-kind">Kind<select id="sig-kind" value={kind} onChange={(e) => setKind(e.target.value)}><option value="note">note</option><option value="metric">metric</option><option value="quote">quote</option><option value="event">event</option></select></label></div>
            <div><label htmlFor="sig-oc">Outcome<select id="sig-oc" value={outcomeId} onChange={(e) => setOutcomeId(e.target.value)}><option value="">None</option>{(outcomes.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></label></div>
            <div><label htmlFor="sig-bet">Bet<select id="sig-bet" value={betId} onChange={(e) => setBetId(e.target.value)}><option value="">None</option>{(bets.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label></div>
          </div>
          <div className="actions"><button className="primary" type="submit">Save signal</button></div>
        </form>
        <h3>Recent signals</h3>
        <ul className="list">
          {(signals.data ?? []).slice(0, 10).map((s) => (
            <li key={s.id}><strong>{s.title}</strong> <span className="pill">{s.kind}</span><div className="small muted">{s.evidence || "No evidence recorded."}</div></li>
          ))}
          {!signals.loading && (signals.data ?? []).length === 0 && <li className="muted">No signals yet.</li>}
          {(signals.data ?? []).length > 10 && <li className="small muted">Showing 10 of {signals.data?.length}.</li>}
        </ul>
      </section>

      <section className="card" aria-labelledby="agent-h">
        <h2 id="agent-h">Ask an agent (optional)</h2>
        {checkingAdapters ? (
          <p className="muted">Checking for installed agent CLIs…</p>
        ) : avail.length === 0 ? (
          <p className="muted">No agent CLI detected. Install one of codex, agy, opencode, pi, or droid to enable scoped proposal jobs. Your data stays usable without agents.</p>
        ) : (
          <form onSubmit={runAgent}>
            <div className="row">
              <div><label htmlFor="job-type">Job<select id="job-type" value={jobType} onChange={(e) => setJobType(e.target.value)}>{Object.entries(JOB_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
              <div><label htmlFor="job-adapter">Agent<select id="job-adapter" value={adapter} onChange={(e) => setAdapter(e.target.value)}>{(adapters ?? []).map((a) => <option key={a.id} value={a.id} disabled={!a.available}>{a.id}{a.available ? "" : " (missing)"}</option>)}</select></label></div>
            </div>
            <div className="row">
              <div><label htmlFor="job-oc">Scope: outcome<select id="job-oc" value={jobOutcomeId} onChange={(e) => setJobOutcomeId(e.target.value)}><option value="">None</option>{(outcomes.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></label></div>
              <div><label htmlFor="job-bet">Scope: bet{(jobType === "challenge-bet") ? " (required)" : ""}<select id="job-bet" value={jobBetId} onChange={(e) => setJobBetId(e.target.value)}><option value="">None</option>{(bets.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label></div>
              <div><label htmlFor="job-sig">Scope: signal{(jobType === "assess-signal") ? " (required)" : ""}<select id="job-sig" value={jobSignalId} onChange={(e) => setJobSignalId(e.target.value)}><option value="">None</option>{(signals.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label></div>
            </div>
            <p className="small muted">Nerve sends one scoped job packet at a time (job type, linked outcome/bet/signal, active tasks, recent signals, last decisions). CLIs remain trusted local software under their own permissions. Never auto-run.</p>
            <div className="actions"><button className="primary" type="submit" disabled={busy}>{busy ? "Running…" : "Run job"}</button></div>
            {jobMsg && <p className="small muted" role="status">{jobMsg}</p>}
          </form>
        )}
        {avail.length === 0 && jobMsg && <p className="small muted">{jobMsg}</p>}
      </section>

      <section className="card" aria-labelledby="props-h">
        <h2 id="props-h">Proposals ({pending.length} pending)</h2>
        {jobMsg && avail.length > 0 && <p className="small muted" role="status">{jobMsg}</p>}
        <ul className="list">
          {(proposals.data ?? []).slice(0, 20).map((p) => (
            <ProposalItem key={p.id} p={p} onDecided={onDecided} />
          ))}
          {!proposals.loading && (proposals.data ?? []).length === 0 && <li className="muted">No proposals yet.</li>}
          {(proposals.data ?? []).length > 20 && <li className="small muted">Showing 20 of {proposals.data?.length}.</li>}
        </ul>
        <h3>Decision history</h3>
        <ul className="list">
          {(decisions.data ?? []).slice(0, 20).map((d) => {
            const prop = (d.proposal_id && proposalById.get(d.proposal_id)) || null;
            const label = prop ? (JOB_LABELS[prop.job_type] ?? prop.job_type) : null;
            return (
              <li key={d.id}><span className="pill">{d.action}</span>{" "}
                {label && <strong>{label} </strong>}
                {d.proposal_id && <span className="small muted">[{d.proposal_id.slice(0, 8)}] </span>}
                <span className="small muted">{d.created_at} {d.note}</span>
                {prop && <div className="small muted">Proposal: {prop.rationale.slice(0, 140)}{prop.rationale.length > 140 ? "…" : ""}</div>}
              </li>
            );
          })}
          {!decisions.loading && (decisions.data ?? []).length === 0 && <li className="muted">No decisions yet. Accept or reject a proposal to start the audit trail.</li>}
          {(decisions.data ?? []).length > 20 && <li className="small muted">Showing 20 of {decisions.data?.length}.</li>}
        </ul>
      </section>
    </div>
  );
}

/* ---------------- Agents ---------------- */
function Agents() {
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Adapter[]>("/api/adapters").then(setAdapters).catch((e: Error) => setError(e.message));
    api<Run[]>("/api/runs").then(setRuns).catch(() => undefined);
  }, []);
  return (
    <div>
      <section className="card" aria-labelledby="ag-h">
        <h2 id="ag-h">Agents and runs</h2>
        <p className="muted">Adapters are detected locally. Configure via NERVE_* environment variables (see README). Agents never run on their own.</p>
        <Err msg={error} />
        <ul className="list">
          {adapters.map((a) => (
            <li key={a.id}><strong>{a.id}</strong> <span className="pill">{a.available ? "available" : "not installed"}</span>
              <div className="small muted">{a.bin}{a.model ? ` · model ${a.model}` : ""} — {a.notes}</div>
            </li>
          ))}
        </ul>
        <h3>Recent runs</h3>
        <ul className="list">
          {runs.map((r) => (
            <li key={r.id}><span className="pill">{r.status}</span><strong>{r.adapter}</strong> <span className="small muted">{r.job_type} · est ~{r.est_tokens} tokens{r.reported_tokens ? ` · reported ${r.reported_tokens}` : ""} · {r.started_at}{r.error ? ` · ${r.error}` : ""}</span></li>
          ))}
          {runs.length === 0 && <li className="muted">No runs yet.</li>}
        </ul>
      </section>
    </div>
  );
}
