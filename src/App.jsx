import { useState, useRef, useCallback, useEffect } from "react";

// ── Pulse circle with auto-cleanup (SVG animateMotion doesn't fire onAnimationEnd) ──
function PulseCircle({ pulse, edge, onDone }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(pulse.id), 700);
    return () => clearTimeout(t);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <circle r={5} fill={pulse.color} opacity={0.9}>
      <animateMotion
        dur="0.62s"
        repeatCount="1"
        fill="freeze"
        path={`M${edge.x1},${edge.y1} L${edge.x2},${edge.y2}`}
      />
    </circle>
  );
}

// ── Premium cursor — mix-blend-mode dot + spring ring ────────────────────────
function CustomCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const mouse = useRef({ x: -200, y: -200 });
  const pos = useRef({ x: -200, y: -200 });
  const vel = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);
  const [hot, setHot] = useState(false);

  useEffect(() => {
    const onMove = (e) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (dotRef.current) {
        dotRef.current.style.left = `${e.clientX}px`;
        dotRef.current.style.top = `${e.clientY}px`;
      }
      setHot(!!e.target.closest("button,input,a,[role='button']"));
    };

    const tick = () => {
      const stiffness = 0.11;
      const damping = 0.76;
      vel.current.x = vel.current.x * damping + (mouse.current.x - pos.current.x) * stiffness;
      vel.current.y = vel.current.y * damping + (mouse.current.y - pos.current.y) * stiffness;
      pos.current.x += vel.current.x;
      pos.current.y += vel.current.y;
      if (ringRef.current) {
        ringRef.current.style.left = `${pos.current.x}px`;
        ringRef.current.style.top = `${pos.current.y}px`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      {/* Dot: mix-blend-mode difference — inverts whatever's beneath it */}
      <div ref={dotRef} style={{
        position: "fixed", pointerEvents: "none", zIndex: 99999,
        width: hot ? 12 : 7,
        height: hot ? 12 : 7,
        borderRadius: "50%",
        background: "#ffffff",
        mixBlendMode: "difference",
        transform: "translate(-50%,-50%)",
        transition: "width 0.18s ease, height 0.18s ease",
        willChange: "left, top",
      }} />
      {/* Ring: spring-physics follower, ghost-thin stroke */}
      <div ref={ringRef} style={{
        position: "fixed", pointerEvents: "none", zIndex: 99998,
        width: hot ? 52 : 36,
        height: hot ? 52 : 36,
        borderRadius: "50%",
        border: hot
          ? `1px solid rgba(0,217,126,0.6)`
          : `1px solid rgba(255,255,255,0.22)`,
        transform: "translate(-50%,-50%)",
        transition: "width 0.28s cubic-bezier(0.23,1,0.32,1), height 0.28s cubic-bezier(0.23,1,0.32,1), border-color 0.28s ease",
        willChange: "left, top",
      }} />
    </>
  );
}

// ── Magnetic button ───────────────────────────────────────────────────────────
function MagneticButton({ children, onClick, disabled, style }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMove = (e) => {
      if (disabled) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const max = 90;
      if (dist < max) {
        const pull = (1 - dist / max) * 0.38;
        el.style.transform = `translate(${dx * pull}px,${dy * pull}px)`;
      } else {
        el.style.transform = "translate(0px,0px)";
      }
    };

    const onLeave = () => { el.style.transform = "translate(0px,0px)"; };

    window.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [disabled]);

  return (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      style={{ ...style, transition: "transform 0.35s cubic-bezier(0.23,1,0.32,1)", willChange: "transform" }}
    >
      {children}
    </button>
  );
}

const COLORS = {
  bg: "#030405",   // near-pure black, cold tint
  surface: "#06080F",   // dark navy-black
  card: "#0A0D18",   // card surfaces
  border: "#111828",   // subtle borders
  violet: "#FF6B00",   // electric orange — Orchestrator
  green: "#00D97E",   // mint green — Search, settled
  amber: "#FFD60A",   // electric yellow — Filter agents
  blue: "#2DD4F7",   // electric cyan — Quality Oracle
  red: "#FF2C52",   // vivid red — errors, withheld
  purple: "#C084FC",   // fuchsia — replacement agents
  text: "#EFF1F8",   // cool near-white
  muted: "#4E6278",   // steel gray
};

const EDGES = {
  orchToSearchA: { x1: 380, y1: 80, x2: 160, y2: 200 },
  orchToSearchB: { x1: 380, y1: 80, x2: 260, y2: 200 },
  searchAToFilterA: { x1: 160, y1: 200, x2: 160, y2: 340 },
  searchBToFilterB: { x1: 260, y1: 200, x2: 260, y2: 340 },
  filterAToOracle: { x1: 160, y1: 340, x2: 580, y2: 160 },
  filterBToOracle: { x1: 260, y1: 340, x2: 580, y2: 160 },
  orchToOracle: { x1: 380, y1: 80, x2: 580, y2: 160 },
};

const NODE_DEFS = {
  orchestrator: { cx: 380, cy: 80, label: "Orchestrator", color: COLORS.violet, rep: null },
  searchA: { cx: 160, cy: 200, label: "Search A", color: COLORS.green, rep: null },
  searchB: { cx: 260, cy: 200, label: "Search B", color: COLORS.green, rep: null },
  filterA: { cx: 160, cy: 340, label: "Filter A", color: COLORS.amber, rep: "filterA" },
  filterB: { cx: 260, cy: 340, label: "Filter B", color: COLORS.purple, rep: "filterB" },
  oracle: { cx: 580, cy: 160, label: "Oracle", color: COLORS.blue, rep: null },
};

const AGENTS_LIST = [
  { id: "orchestrator", label: "Orchestrator", color: COLORS.violet },
  { id: "searchA", label: "Search A", color: COLORS.green },
  { id: "searchB", label: "Search B", color: COLORS.green },
  { id: "filterA", label: "Filter A", color: COLORS.amber },
  { id: "filterB", label: "Filter B", color: COLORS.purple },
  { id: "oracle", label: "Oracle", color: COLORS.blue },
];

const CHAINS = [
  { name: "Ethereum L1", cost: 477, color: "#627EEA" },
  { name: "Arbitrum", cost: 22.50, color: "#28A0F0" },
  { name: "Solana", cost: 0.56, color: "#9945FF" },
  { name: "Arc", cost: 0.000225, color: COLORS.green },
];

const AGENT_REVENUE = [
  { name: "Orchestrator", earned: 0.003, color: COLORS.violet },
  { name: "Search A", earned: 0.0056, color: COLORS.green },
  { name: "Filter A", earned: 0.0225, color: COLORS.amber },
  { name: "Filter B", earned: 0.0112, color: COLORS.purple },
  { name: "Oracle", earned: 0.0034, color: COLORS.blue },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function App() {
  const [phase, setPhase] = useState("idle");
  const [txs, setTxs] = useState([]);
  const [pulses, setPulses] = useState([]);
  const [nodeState, setNodeState] = useState({
    orchestrator: "default", searchA: "default", searchB: "default",
    filterA: "default", filterB: "default", oracle: "default",
  });
  const [edgeState, setEdgeState] = useState({});
  const [status, setStatus] = useState("Awaiting task...");
  const [usyc, setUsyc] = useState(null);
  const [report, setReport] = useState(null);
  const [switched, setSwitched] = useState(false);
  const [tab, setTab] = useState("graph");
  const [concurrent, setConcurrent] = useState(false);
  const [wsMode, setWsMode] = useState("simulation");
  const [wsConnected, setWsConnected] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [repState, setRepState] = useState({ filterA: 0.92, filterB: 0.88 });
  const [dotOpacity, setDotOpacity] = useState(1);
  const [judgeStatus, setJudgeStatus] = useState(null);
  const [judgeLoading, setJudgeLoading] = useState(false);
  const [judgeError, setJudgeError] = useState("");
  const [judgeSummary, setJudgeSummary] = useState(null);

  const pidRef = useRef(0);
  const txIdRef = useRef(0);
  const wsRef = useRef(null);
  const txFeedRef = useRef(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      *, *::before, *::after { cursor: none !important; }
      html, body { overflow: hidden; margin: 0; padding: 0; background: #030405; }
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #111828; border-radius: 2px; }
      ::-webkit-scrollbar-thumb:hover { background: #1e2d40; }
      * { scrollbar-width: thin; scrollbar-color: #111828 transparent; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchJudgeSummary = async () => {
      try {
        const res = await fetch("http://localhost:8000/judge/summary");
        if (!res.ok) {
          if (!cancelled) setJudgeSummary(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setJudgeSummary(data?.summary || null);
        }
      } catch {
        if (!cancelled) setJudgeSummary(null);
      }
    };

    fetchJudgeSummary();
    const timer = setInterval(fetchJudgeSummary, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "running") { setDotOpacity(1); return; }
    const interval = setInterval(() => {
      setDotOpacity(o => o === 1 ? 0.3 : 1);
    }, 600);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (txFeedRef.current) {
      txFeedRef.current.scrollTop = txFeedRef.current.scrollHeight;
    }
  }, [txs]);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws");
    wsRef.current = ws;
    ws.onopen = () => { setWsConnected(true); setWsMode("live"); };
    ws.onerror = () => { setWsMode("simulation"); setWsConnected(false); };
    ws.onclose = () => { setWsConnected(false); };
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      switch (data.type) {
        case "nanopayment":
          addTx({ ...data.payload, withheld: false });
          addPulse({ edge: data.payload.edge, color: COLORS.green });
          break;
        case "payment_withheld":
          addTx({ ...data.payload, withheld: true });
          addPulse({ edge: data.payload.edge, color: COLORS.red });
          break;
        case "agent_switch":
          setNodeState(s => ({ ...s, [data.payload.from]: "failed", [data.payload.to]: "replacement" }));
          setRepState(s => ({
            ...s,
            [data.payload.from]: data.payload.newRep ?? s[data.payload.from],
          }));
          break;
        case "usyc_opened":
          setUsyc(data.payload);
          break;
        case "auction_complete":
          setNodeState(s => ({ ...s, [data.payload.winner]: "active" }));
          break;
        case "task_complete":
          setReport(data.payload.report);
          setPhase("complete");
          break;
        case "task_error":
          setPhase("idle");
          setStatus("Error — resetting");
          break;
      }
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    let timer = null;
    const pollJudgeStatus = async () => {
      try {
        const res = await fetch("http://localhost:8000/judge/status");
        if (!res.ok) return;
        const data = await res.json();
        setJudgeStatus(data);
      } catch {
        // Keep dashboard functional when backend judge APIs are unavailable.
      }
    };

    pollJudgeStatus();
    timer = setInterval(pollJudgeStatus, 2000);
    return () => clearInterval(timer);
  }, []);

  const addTx = useCallback((tx) => {
    setTxs(prev => {
      const newTx = { ...tx, id: ++txIdRef.current, ts: Date.now() };
      const next = [...prev, newTx];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }, []);

  const addPulse = useCallback((pulse) => {
    const id = ++pidRef.current;
    setPulses(prev => [...prev, { ...pulse, id }]);
  }, []);

  const removePulse = useCallback((id) => {
    setPulses(prev => prev.filter(p => p.id !== id));
  }, []);

  const runSimulation = async () => {
    if (phase !== "idle" && phase !== "complete") return;
    setPhase("running");
    setTxs([]);
    setPulses([]);
    setSwitched(false);
    setReport(null);
    setUsyc(null);
    setConcurrent(false);
    setNodeState({ orchestrator: "default", searchA: "default", searchB: "default", filterA: "default", filterB: "default", oracle: "default" });
    setEdgeState({});
    setRepState({ filterA: 0.92, filterB: 0.88 });

    await sleep(600);

    setUsyc({ apy: "5.2%", balance: "$1,247.50" });
    setStatus("USYC yield position opened — earning 5.2% APY");
    addTx({ from: "Treasury", to: "USYC", memo: "Yield position opened", amount: 1247.50, withheld: false });

    await sleep(400);

    setStatus("Auction complete — Search A selected (rep: 0.94)");
    setNodeState(s => ({ ...s, orchestrator: "active", searchA: "active" }));
    setEdgeState(s => ({ ...s, orchToSearchA: { color: COLORS.violet, opacity: 1, width: 2.5 } }));
    addPulse({ edge: "orchToSearchA", color: COLORS.violet });

    await sleep(300);

    for (let i = 0; i < 25; i++) {
      await sleep(85);
      addPulse({ edge: "searchAToFilterA", color: COLORS.green });
      addTx({ from: "SearchA", to: "FilterA", memo: `Query ${i + 1}: competitor data fetched`, amount: 0.000225, withheld: false });
      setStatus(`Search phase: ${i + 1}/25 queries processed`);
    }

    await sleep(200);

    setStatus("Auction complete — Filter A selected (rep: 0.92)");
    setNodeState(s => ({ ...s, filterA: "active" }));
    addPulse({ edge: "filterAToOracle", color: COLORS.blue });

    let localSwitched = false;

    for (let i = 0; i < 150; i++) {
      await sleep(20);

      if (i === 100 && !localSwitched) {
        localSwitched = true;
        setSwitched(true);
        setStatus("⚠ Filter A quality score 0.61 < threshold 0.70 — SLASHING");
        setRepState(s => ({ ...s, filterA: 0.61 }));
        addPulse({ edge: "filterAToOracle", color: COLORS.red });
        setNodeState(s => ({ ...s, filterA: "failed" }));
        setEdgeState(s => ({ ...s, filterAToOracle: { color: COLORS.red, opacity: 0.7, width: 1.5, dash: "6,4" } }));
        addTx({ from: "FilterA", to: "Orchestrator", memo: "SLASHED: quality below threshold", amount: 0, withheld: true });

        await sleep(500);

        setStatus("New auction — Filter B activated as replacement");
        setNodeState(s => ({ ...s, filterB: "replacement" }));
        setEdgeState(s => ({ ...s, filterBToOracle: { color: COLORS.purple, opacity: 1, width: 2.5 } }));
        addPulse({ edge: "orchToOracle", color: COLORS.purple });

        await sleep(300);
      }

      const useFilterB = localSwitched && i >= 100;
      addPulse({ edge: useFilterB ? "filterBToOracle" : "filterAToOracle", color: useFilterB ? COLORS.purple : COLORS.amber });
      addTx({
        from: useFilterB ? "FilterB" : "FilterA",
        to: "Oracle",
        memo: `Filter ${i + 1}/150: ${Math.random() > 0.15 ? "item processed" : "item rejected"}`,
        amount: 0.000225, withheld: false,
      });

      if (i % 10 === 0) setStatus(`Filter phase: ${i + 1}/150 items processed`);
    }

    await sleep(300);
    setNodeState(s => ({ ...s, oracle: "active" }));

    const generatedReport = {
      title: taskInput || "Arc Protocol Competitive Analysis",
      sections: [
        { title: "Market Position", body: "Arc Protocol occupies a unique position in the Web3 infrastructure stack. With sub-cent transaction costs enabling 225 discrete micro-payments per task, Arc unlocks economic coordination that is impossible on any competing chain. Developer adoption is accelerating as the cost-per-action model proves viable at scale." },
        { title: "Technical Differentiation", body: "The nanopayment architecture—built on EIP-3009 off-chain authorizations with batched on-chain settlement—eliminates the gas overhead that makes Ethereum unsuitable for per-action economics. Each payment costs $0.000225 versus $2.12 on Ethereum L1, a 9,422× improvement that changes the feasibility calculus entirely." },
        { title: "Economic Model", body: "USYC integration enables idle treasury capital to earn yield at 5.2% APY while agents process tasks. This transforms the Orchestrator from a cost center into a yield-generating entity. The compound effect across thousands of concurrent tasks creates a self-sustaining economic flywheel." },
        { title: "Competitive Threats", body: "Primary threats include Solana's low-fee environment ($0.56 per 225 txs vs $0.000225 on Arc), emerging L2 solutions reducing Ethereum costs, and centralized off-chain payment rails that sacrifice verifiability for throughput. Arc's verifiable on-chain reputation staking is a durable moat." },
        { title: "Strategic Recommendations", body: "Focus developer relations on the agent orchestration vertical — the $50B+ AI infrastructure market is the primary expansion vector. Prioritize SDK tooling, WebSocket streaming infrastructure, and USYC yield optimization. The reputation staking system should be productized as a standalone primitive for any multi-party coordination problem." },
      ],
      sources: 847, filtered: 203,
    };
    setReport(generatedReport);
    setStatus("Task complete — competitive analysis generated");
    setPhase("complete");
    setTab("report");
  };

  const runConcurrent = async () => {
    if (concurrent) return;
    setConcurrent(true);
    setStatus("Firing 2 concurrent tasks — 300+ transactions exploding...");
    for (let i = 0; i < 60; i++) {
      await sleep(30);
      addPulse({ edge: "orchToSearchB", color: COLORS.green });
      addPulse({ edge: "searchBToFilterB", color: COLORS.amber });
      addTx({ from: "SearchB", to: "FilterB", memo: `Task 2 · query ${i + 1}`, amount: 0.000225, withheld: false });
      addTx({ from: "FilterB", to: "Oracle", memo: `Task 2 · filter ${i + 1}`, amount: 0.000225, withheld: false });
    }
    setStatus("2 concurrent tasks complete — 300+ transactions settled");
  };

  const runJudgeMode = async () => {
    if (judgeLoading) return;
    setJudgeLoading(true);
    setJudgeError("");
    setStatus("Judge mode run in progress...");
    try {
      const res = await fetch("http://localhost:8000/judge/run-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: (taskInput || "ArcReflex deterministic judge run").trim(),
          red_team: true,
          red_team_degrade_at: 120,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Judge run failed");
      }
      setJudgeStatus({
        current_task_state: "complete",
        current_task_id: data?.compact?.task_id,
        current_task_text: taskInput,
        last_compact: data?.compact,
        last_bundle: data?.bundle,
        last_artifact_path: data?.compact?.artifact_path,
      });
      try {
        const summaryRes = await fetch("http://localhost:8000/judge/summary");
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          setJudgeSummary(summaryData?.summary || null);
        }
      } catch {
        // Ignore summary refresh errors so judge run UX remains responsive.
      }
      setStatus("Judge mode run complete — compact checks ready");
      setTab("judge");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Judge run failed";
      setJudgeError(msg);
      setStatus(`Judge run error: ${msg}`);
    } finally {
      setJudgeLoading(false);
    }
  };

  const exportJudgeEvidence = async () => {
    try {
      const res = await fetch("http://localhost:8000/judge/export/latest");
      if (!res.ok) {
        throw new Error("No exported evidence available yet");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "judge_bundle_latest.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      setJudgeError(msg);
    }
  };

  const settled = txs.filter(t => !t.withheld);
  const withheld = txs.filter(t => t.withheld);
  const ethEquiv = settled.length ? `$${(settled.length * 2.12).toFixed(0)}` : "$0";

  const getNodeColor = (id) => {
    const s = nodeState[id];
    if (s === "failed") return COLORS.red;
    if (s === "replacement") return COLORS.purple;
    return NODE_DEFS[id]?.color || COLORS.muted;
  };

  const getEdgeStyle = (edgeId) => {
    const override = edgeState[edgeId];
    if (override) return {
      stroke: override.color,
      strokeWidth: override.width || 1.5,
      strokeOpacity: override.opacity ?? 0.5,
      strokeDasharray: override.dash || "none",
    };
    return { stroke: COLORS.border, strokeWidth: 1.5, strokeOpacity: 0.5, strokeDasharray: "none" };
  };

  const getStatusBadge = (agentId) => {
    const s = nodeState[agentId];
    const agent = AGENTS_LIST.find(a => a.id === agentId);
    if (!agent) return null;
    if (s === "failed") {
      return { label: "SLASHED", bg: "rgba(244,63,94,0.15)", color: COLORS.red, border: `1px solid ${COLORS.red}` };
    }
    if (s === "replacement") {
      return { label: "BACKUP", bg: "rgba(167,139,250,0.15)", color: COLORS.purple, border: `1px solid ${COLORS.purple}` };
    }
    if (s === "active") {
      const c = agent.color;
      return { label: "ACTIVE", bg: `rgba(${hexToRgb(c)},0.15)`, color: c, border: `1px solid ${c}` };
    }
    return { label: "STANDBY", bg: "transparent", color: COLORS.muted, border: "none" };
  };

  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
  };

  const dotColor = phase === "running" ? COLORS.green : phase === "complete" ? COLORS.violet : COLORS.muted;

  const maxCost = CHAINS[0].cost;

  return (
    <div style={{ fontFamily: "'Sora', sans-serif", background: COLORS.bg, color: COLORS.text, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", cursor: "none" }}>
      <CustomCursor />

      {/* ── ZONE 1: HEADER ── */}
      <div style={{ background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`, padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 18, color: COLORS.violet }}>ARC</span>
            <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 400, fontSize: 18, color: COLORS.text }}>REFLEX</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: wsConnected ? COLORS.green : COLORS.red }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: COLORS.muted }}>
              {wsConnected ? "LIVE" : "SIM"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {[
            { label: "TXS", value: txs.length },
            { label: "SETTLED", value: settled.length },
            { label: "WITHHELD", value: withheld.length },
            { label: "ETH EQUIV", value: ethEquiv },
          ].map(chip => (
            <div key={chip.label} style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{chip.label}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: COLORS.text, fontWeight: 500 }}>{chip.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ZONE 2: STATUS BAR ── */}
      <div style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}`, padding: "8px 24px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, opacity: dotOpacity, transition: "opacity 0.4s ease", flexShrink: 0 }} />
        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, color: COLORS.text, flex: 1 }}>{status}</div>
        {nodeState.filterA === "failed" && (
          <div style={{ background: "rgba(244,63,94,0.15)", border: `1px solid ${COLORS.red}`, color: COLORS.red, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontFamily: "'JetBrains Mono',monospace", fontWeight: 500 }}>
            FILTER A SLASHED
          </div>
        )}
        {usyc !== null && (
          <div style={{ background: "rgba(0,217,126,0.1)", border: `1px solid ${COLORS.green}`, color: COLORS.green, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
            USYC YIELD ACTIVE
          </div>
        )}
      </div>

      {/* ── ZONE 3: MAIN AREA ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", flex: 1, overflow: "hidden" }}>

        {/* LEFT PANEL */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Tab bar */}
          <div style={{ display: "flex", background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`, padding: "0 24px", flexShrink: 0 }}>
            {["graph", "economy", "report", "judge"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 500,
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: tab === t ? COLORS.violet : COLORS.muted,
                borderBottom: tab === t ? `2px solid ${COLORS.violet}` : "2px solid transparent",
                padding: "12px 16px",
                marginBottom: -1,
              }}>
                {t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>

            {/* ── GRAPH TAB ── */}
            {tab === "graph" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <svg viewBox="0 0 760 480" style={{ width: "100%", height: "auto", display: "block" }}>
                  <defs>
                    {[
                      { id: "glow-violet", color: COLORS.violet },
                      { id: "glow-green", color: COLORS.green },
                      { id: "glow-amber", color: COLORS.amber },
                      { id: "glow-blue", color: COLORS.blue },
                      { id: "glow-red", color: COLORS.red },
                      { id: "glow-purple", color: COLORS.purple },
                    ].map(f => (
                      <filter key={f.id} id={f.id}>
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    ))}
                  </defs>

                  {/* Edges */}
                  {Object.entries(EDGES).map(([edgeId, e]) => {
                    const es = getEdgeStyle(edgeId);
                    return (
                      <line key={edgeId}
                        x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                        stroke={es.stroke}
                        strokeWidth={es.strokeWidth}
                        strokeOpacity={es.strokeOpacity}
                        strokeDasharray={es.strokeDasharray}
                      />
                    );
                  })}

                  {/* Pulses */}
                  {pulses.map(pulse => {
                    const edge = EDGES[pulse.edge];
                    if (!edge) return null;
                    return <PulseCircle key={pulse.id} pulse={pulse} edge={edge} onDone={removePulse} />;
                  })}

                  {/* Nodes */}
                  {Object.entries(NODE_DEFS).map(([id, node]) => {
                    const s = nodeState[id];
                    const c = getNodeColor(id);
                    const isActive = s === "active" || s === "replacement";
                    const isFailed = s === "failed";
                    const glowId = c === COLORS.violet ? "glow-violet"
                      : c === COLORS.green ? "glow-green"
                        : c === COLORS.amber ? "glow-amber"
                          : c === COLORS.blue ? "glow-blue"
                            : c === COLORS.red ? "glow-red"
                              : "glow-purple";

                    const repKey = node.rep;
                    const repValue = repKey ? repState[repKey] : null;

                    return (
                      <g key={id}>
                        {/* Aura ring when active */}
                        {isActive && (
                          <circle cx={node.cx} cy={node.cy} r={40} fill="none"
                            stroke={c} strokeWidth={1} opacity={0.3} />
                        )}
                        {/* Status badge above */}
                        {isFailed && (
                          <text x={node.cx} y={node.cy - 38} textAnchor="middle"
                            fontSize={9} fontWeight={700} fill={COLORS.red}
                            fontFamily="'JetBrains Mono',monospace">
                            SLASHED
                          </text>
                        )}
                        {s === "replacement" && (
                          <text x={node.cx} y={node.cy - 38} textAnchor="middle"
                            fontSize={9} fontWeight={700} fill={COLORS.purple}
                            fontFamily="'JetBrains Mono',monospace">
                            BACKUP ACTIVE
                          </text>
                        )}
                        {/* Node circle */}
                        <circle cx={node.cx} cy={node.cy} r={28}
                          fill={isFailed ? "rgba(244,63,94,0.15)" : `${c}26`}
                          stroke={c}
                          strokeWidth={2}
                          filter={isActive ? `url(#${glowId})` : "none"}
                        />
                        {/* Label */}
                        <text x={node.cx} y={node.cy + 46} textAnchor="middle"
                          fontSize={11} fill={COLORS.text}
                          fontFamily="'Sora',sans-serif">
                          {node.label}
                        </text>
                        {/* Rep score */}
                        {repValue !== null && (
                          <text x={node.cx} y={node.cy + 60} textAnchor="middle"
                            fontSize={10} fill={COLORS.muted}
                            fontFamily="'JetBrains Mono',monospace">
                            {repValue.toFixed(2)}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Legend */}
                  <g transform="translate(160, 455)">
                    {[
                      { label: "Orchestrator", color: COLORS.violet },
                      { label: "Search", color: COLORS.green },
                      { label: "Filter", color: COLORS.amber },
                      { label: "Oracle", color: COLORS.blue },
                    ].map((item, i) => (
                      <g key={item.label} transform={`translate(${i * 140}, 0)`}>
                        <circle r={5} cx={5} cy={0} fill={item.color} />
                        <text x={16} y={4} fontSize={10} fill={COLORS.muted}
                          fontFamily="'Sora',sans-serif">
                          {item.label}
                        </text>
                      </g>
                    ))}
                  </g>
                </svg>

                {/* Input + CTA */}
                <div style={{ padding: "16px 0", borderTop: `1px solid ${COLORS.border}`, marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={taskInput}
                      onChange={e => setTaskInput(e.target.value)}
                      disabled={phase === "running"}
                      placeholder="Analyze competitive landscape for Arc Protocol..."
                      style={{
                        flex: 1, background: COLORS.card, border: `1px solid ${COLORS.border}`,
                        color: COLORS.text, fontFamily: "'Sora',sans-serif", fontSize: 13,
                        padding: "10px 14px", borderRadius: 6, outline: "none",
                        opacity: phase === "running" ? 0.5 : 1,
                      }}
                    />
                    <MagneticButton
                      onClick={runSimulation}
                      disabled={phase === "running"}
                      style={{
                        background: COLORS.violet, color: "#fff",
                        fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 600,
                        padding: "10px 20px", borderRadius: 6, border: "none", cursor: "none",
                        opacity: phase === "running" ? 0.6 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {phase === "running" ? "RUNNING..." : phase === "complete" ? "RUN AGAIN" : "SUBMIT TASK"}
                    </MagneticButton>
                  </div>
                  {phase === "complete" && (
                    <div style={{ marginTop: 8 }}>
                      <MagneticButton
                        onClick={runConcurrent}
                        disabled={concurrent}
                        style={{
                          background: COLORS.amber, color: "#030405",
                          fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 600,
                          padding: "10px 20px", borderRadius: 6, border: "none", cursor: "none",
                          opacity: concurrent ? 0.5 : 1,
                        }}
                      >
                        FIRE 2 CONCURRENT
                      </MagneticButton>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ECONOMY TAB ── */}
            {tab === "economy" && (
              <div>
                {/* Section 1: Cost comparison */}
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                  Transaction Cost Comparison
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
                  {CHAINS.map(chain => (
                    <div key={chain.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.text, width: 100, flexShrink: 0 }}>
                        {chain.name}
                      </div>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: COLORS.surface, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 4, background: chain.color,
                          width: `${Math.max((chain.cost / maxCost) * 100, 0.5)}%`,
                        }} />
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: COLORS.muted, minWidth: 72, textAlign: "right" }}>
                        {chain.cost < 0.001 ? `$${chain.cost.toFixed(6)}` : `$${chain.cost.toFixed(2)}`}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Section 2: Callout cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 32 }}>
                  <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted, marginBottom: 8 }}>Ethereum Overhead</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, color: COLORS.red, fontWeight: 600 }}>$477 per task</div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 4 }}>225 txs · $2.12 each</div>
                  </div>
                  <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted, marginBottom: 8 }}>Cost Ratio</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, color: COLORS.green, fontWeight: 600 }}>2.1M×</div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 4 }}>cheaper on Arc</div>
                  </div>
                </div>

                {/* Section 3: Agent Revenue */}
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                  Agent Revenue
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
                  {(() => {
                    const maxEarned = Math.max(...AGENT_REVENUE.map(a => a.earned));
                    return AGENT_REVENUE.map(agent => (
                      <div key={agent.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.text, width: 120, flexShrink: 0 }}>
                          {agent.name}
                        </div>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: COLORS.surface, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 3, background: agent.color,
                            width: `${(agent.earned / maxEarned) * 100}%`,
                          }} />
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: COLORS.muted, minWidth: 60, textAlign: "right" }}>
                          ${agent.earned.toFixed(4)}
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                {/* Section 4: USYC */}
                <div style={{ border: `1px solid ${COLORS.green}`, background: "rgba(0,217,126,0.05)", borderRadius: 8, padding: 16 }}>
                  <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, color: COLORS.green, fontWeight: 600, marginBottom: 8 }}>
                    USYC Yield Integration
                  </div>
                  <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.muted, lineHeight: 1.6 }}>
                    ArcReflex integrates USYC — a yield-bearing stablecoin backed by US Treasury bills — as the settlement layer for idle orchestrator capital. Rather than holding raw USDC between task batches, the Orchestrator converts treasury reserves to USYC, earning 5.2% APY continuously. Each task cycle opens and closes a yield position, with accrued interest automatically reinvested. This means every second agents are processing, the treasury is also growing — a compounding economic advantage unavailable in any competing framework.
                  </div>
                </div>
              </div>
            )}

            {/* ── REPORT TAB ── */}
            {tab === "report" && (
              <div>
                {report === null ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, color: COLORS.muted, textAlign: "center" }}>
                      Run a task to generate a competitive analysis report.
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 18, color: COLORS.text, fontWeight: 700, marginBottom: 8 }}>
                      {report.title}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                      {[
                        `Sources: ${report.sources}`,
                        `Filtered: ${report.filtered}`,
                        `TXs: ${txs.length}`,
                        `Cost: $0.000225`,
                      ].map(pill => (
                        <div key={pill} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 100, padding: "4px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: COLORS.muted }}>
                          {pill}
                        </div>
                      ))}
                    </div>
                    {report.sections.map((section, i) => (
                      <div key={i} style={{
                        background: COLORS.card, border: `1px solid ${COLORS.border}`,
                        borderRadius: 8, padding: 20, marginBottom: 12,
                        animation: "fadeUp 0.4s ease forwards",
                        animationDelay: `${i * 0.08}s`,
                        opacity: 0,
                      }}>
                        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, color: COLORS.violet, fontWeight: 600, marginBottom: 8 }}>
                          {section.title}
                        </div>
                        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.muted, lineHeight: 1.7 }}>
                          {section.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── JUDGE TAB ── */}
            {tab === "judge" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                      Current Task State
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: COLORS.text }}>
                      {judgeStatus?.current_task_state || "idle"}
                    </div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 6 }}>
                      {judgeStatus?.current_task_id || "no task"}
                    </div>
                  </div>

                  <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                      Payment Events
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: COLORS.text }}>
                      TX {judgeStatus?.last_compact?.summary?.total_transactions ?? 0}
                    </div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 6 }}>
                      released {judgeStatus?.last_compact?.summary?.released ?? 0} · withheld {judgeStatus?.last_compact?.summary?.withheld ?? 0}
                    </div>
                  </div>
                </div>

                <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                    Quality Gate Decisions
                  </div>
                  {(judgeStatus?.last_bundle?.quality_decisions || []).length === 0 ? (
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.muted }}>
                      No quality withhold decisions recorded yet.
                    </div>
                  ) : (
                    (judgeStatus?.last_bundle?.quality_decisions || []).slice(-5).map((d, idx) => (
                      <div key={`${d.item_index}-${idx}`} style={{ borderBottom: `1px solid ${COLORS.border}20`, padding: "8px 0" }}>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: COLORS.red }}>
                          item {d.item_index} · {d.agent} · quality {d.quality_score} {'<'} {d.threshold}
                        </div>
                        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted }}>
                          {d.reason}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                    Compact Checks
                  </div>
                  {(judgeStatus?.last_compact?.checks || []).length === 0 ? (
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.muted }}>
                      Run Judge Mode to populate pass/fail checks.
                    </div>
                  ) : (
                    (judgeStatus?.last_compact?.checks || []).map((c, idx) => (
                      <div key={`${c.name}-${idx}`} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${COLORS.border}20`, padding: "8px 0" }}>
                        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.text }}>{c.name}</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: c.passed ? COLORS.green : COLORS.red }}>
                          {c.passed ? "PASS" : "FAIL"}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Benchmark Table (Median / P95)
                    </div>
                    {typeof judgeSummary?.pass === "boolean" && (
                      <div style={{
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        border: `1px solid ${judgeSummary.pass ? COLORS.green : COLORS.red}`,
                        color: judgeSummary.pass ? COLORS.green : COLORS.red,
                        background: judgeSummary.pass ? "rgba(0,217,126,0.1)" : "rgba(255,44,82,0.1)",
                      }}>
                        {judgeSummary.pass ? "OVERALL PASS" : "OVERALL FAIL"}
                      </div>
                    )}
                  </div>
                  {!judgeSummary?.hard_numbers ? (
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.muted }}>
                      Run npm run judge:run to generate artifacts/judge/judge_summary.json.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted }}>Metric</div>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted }}>Median</div>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.muted }}>P95</div>

                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.text }}>Total latency (ms)</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: COLORS.text }}>{judgeSummary.hard_numbers.total_latency_ms?.median ?? 0}</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: COLORS.text }}>{judgeSummary.hard_numbers.total_latency_ms?.p95 ?? 0}</div>

                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.text }}>Wall clock (ms)</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: COLORS.text }}>{judgeSummary.hard_numbers.wall_clock_ms?.median ?? 0}</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: COLORS.text }}>{judgeSummary.hard_numbers.wall_clock_ms?.p95 ?? 0}</div>

                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.text }}>Transactions</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: COLORS.text }}>{judgeSummary.hard_numbers.total_transactions?.median ?? 0}</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: COLORS.text }}>{judgeSummary.hard_numbers.total_transactions?.p95 ?? 0}</div>

                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.text }}>Withheld payments</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: COLORS.text }}>{judgeSummary.hard_numbers.withheld_payments?.median ?? 0}</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: COLORS.text }}>{judgeSummary.hard_numbers.withheld_payments?.p95 ?? 0}</div>

                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.text }}>Settled USDC</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: COLORS.text }}>{judgeSummary.hard_numbers.total_usdc_settled?.median ?? 0}</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: COLORS.text }}>{judgeSummary.hard_numbers.total_usdc_settled?.p95 ?? 0}</div>
                    </div>
                  )}
                </div>

                {judgeError && (
                  <div style={{ color: COLORS.red, fontFamily: "'Sora',sans-serif", fontSize: 12 }}>{judgeError}</div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <MagneticButton
                    onClick={runJudgeMode}
                    disabled={judgeLoading}
                    style={{
                      background: COLORS.violet, color: "#fff", border: "none", borderRadius: 6,
                      padding: "10px 14px", fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 600,
                      opacity: judgeLoading ? 0.6 : 1,
                    }}
                  >
                    {judgeLoading ? "RUNNING..." : "RUN JUDGE MODE"}
                  </MagneticButton>

                  <MagneticButton
                    onClick={exportJudgeEvidence}
                    disabled={!judgeStatus?.last_bundle}
                    style={{
                      background: COLORS.green, color: "#03110a", border: "none", borderRadius: 6,
                      padding: "10px 14px", fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 600,
                      opacity: judgeStatus?.last_bundle ? 1 : 0.5,
                    }}
                  >
                    EXPORT EVIDENCE
                  </MagneticButton>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ borderLeft: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Agent Status */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.1em", padding: "16px 16px 8px", borderBottom: `1px solid ${COLORS.border}` }}>
              Agent Status
            </div>
            {AGENTS_LIST.map(agent => {
              const s = nodeState[agent.id];
              const badge = getStatusBadge(agent.id);
              const dotC = s === "active" ? agent.color
                : s === "failed" ? COLORS.red
                  : s === "replacement" ? COLORS.purple
                    : COLORS.muted;
              const dotO = s === "default" ? 0.3 : 1;
              const hasRep = agent.id === "filterA" || agent.id === "filterB";
              const repKey = agent.id === "filterA" ? "filterA" : "filterB";

              return (
                <div key={agent.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${COLORS.border}20`, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotC, opacity: dotO, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.text, fontWeight: 500 }}>
                      {agent.label}
                    </div>
                    {hasRep && (
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: COLORS.muted }}>
                        {repState[repKey].toFixed(2)}
                      </div>
                    )}
                  </div>
                  {badge && (
                    <div style={{ background: badge.bg, color: badge.color, border: badge.border, padding: "2px 6px", borderRadius: 3, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, whiteSpace: "nowrap" }}>
                      {badge.label}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* TX Feed header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Live Transactions
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: COLORS.violet }}>
              {txs.length}
            </div>
          </div>

          {/* TX Feed list */}
          <div ref={txFeedRef} style={{ flex: 1, overflowY: "auto" }}>
            {txs.length === 0 ? (
              <div style={{ padding: 24, fontFamily: "'Sora',sans-serif", fontSize: 12, color: COLORS.muted, textAlign: "center" }}>
                Awaiting transactions...
              </div>
            ) : (
              txs.map(tx => (
                <div key={tx.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "8px 16px",
                  background: tx.withheld ? "rgba(244,63,94,0.05)" : "transparent",
                  borderBottom: `1px solid ${COLORS.border}15`,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 4, flexShrink: 0, background: tx.withheld ? COLORS.red : COLORS.green }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: COLORS.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {tx.from} → {tx.to}
                    </div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: COLORS.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {tx.memo}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 500, flexShrink: 0, color: tx.withheld ? COLORS.red : COLORS.green }}>
                    {tx.withheld ? "✗" : tx.amount >= 1 ? `$${Number(tx.amount).toFixed(2)}` : `$${Number(tx.amount).toFixed(6)}`}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer stats */}
          <div style={{ background: COLORS.surface, borderTop: `1px solid ${COLORS.border}`, padding: "12px 16px", flexShrink: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "GAS PER TX", value: "$0.000225" },
                { label: "ETH EQUIV", value: ethEquiv },
                { label: "EIP-3009", value: settled.length },
                { label: "WITHHELD", value: withheld.length },
              ].map(stat => (
                <div key={stat.label}>
                  <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {stat.label}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: COLORS.text, fontWeight: 500, marginTop: 2 }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
