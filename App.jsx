import { useState, useRef, useCallback, useEffect } from "react";

// ── Global styles ─────────────────────────────────────────────────────────────
const GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #07070F; }
  ::-webkit-scrollbar-thumb { background: #1E1E3A; border-radius: 2px; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
  @keyframes fadeInUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes slideIn { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
  @keyframes ripple { 0%{transform:scale(1);opacity:0.5} 100%{transform:scale(2.8);opacity:0} }
  @keyframes scanPulse { 0%,100%{opacity:0.03} 50%{opacity:0.06} }
  .tx-row { animation: slideIn 0.18s ease-out; }
  .fade-up { animation: fadeInUp 0.3s ease-out; }
`;

// ── Node layout ────────────────────────────────────────────────────────────────
const NODES = {
  orchestrator: { x: 390, y: 90, label: "Orchestrator", sub: "Economic Authority", color: "#8B5CF6", rep: null },
  search_a: { x: 160, y: 245, label: "Search A", sub: "rep:72 · $0.0002/q", color: "#00D97E", rep: 72 },
  search_b: { x: 345, y: 245, label: "Search B", sub: "rep:65 · $0.00022/q", color: "#00D97E", rep: 65 },
  filter_a: { x: 205, y: 395, label: "Filter A", sub: "rep:81 · $0.0001/item", color: "#F5A623", rep: 81 },
  filter_b: { x: 395, y: 395, label: "Filter B", sub: "rep:58 · $0.00012/item", color: "#F5A623", rep: 58 },
  oracle: { x: 595, y: 90, label: "Quality Oracle", sub: "rep:92 · threshold:0.70", color: "#38BDF8", rep: 92 },
};

const EDGES = [
  ["orchestrator", "search_a"], ["orchestrator", "search_b"],
  ["orchestrator", "filter_a"], ["orchestrator", "filter_b"],
  ["orchestrator", "oracle"], ["search_a", "filter_a"], ["search_b", "filter_b"],
];

const SLEEP = ms => new Promise(r => setTimeout(r, ms));
const C = {
  bg: "#05050D", surface: "#0A0A16", card: "#0D0D1F", border: "#161630", border2: "#1E1E3A",
  text: "#E2E2F2", muted: "#5A5A90", dim: "#2A2A4A",
  violet: "#8B5CF6", green: "#00D97E", amber: "#F5A623", blue: "#38BDF8", red: "#F43F5E", purple: "#A78BFA",
};
// Bar heights use log₁₀ scale: bar = round(190 × log10(v/Arc_v) / log10(Eth_v/Arc_v))
// Ethereum: log10(477/0.000225)=6.326 → 190; Arbitrum: log10(22.5/0.000225)=5.0 → 150
// Solana:   log10(0.56/0.000225)=3.396 → 102; Arc: minimum 3px for visibility
const GAS = [
  { n: "Ethereum L1", v: 477.00, bar: 190, c: "#F43F5E" },
  { n: "Arbitrum", v: 22.50, bar: 150, c: "#F97316" },
  { n: "Solana", v: 0.56, bar: 102, c: "#EAB308" },
  { n: "Arc ✓", v: 0.000225, bar: 3, c: "#00D97E" },
];

export default function ArcReflex() {
  const [phase, setPhase] = useState("idle");
  const [txs, setTxs] = useState([]);
  const [pulses, setPulses] = useState([]);
  const [nodeState, setNodeState] = useState({});
  const [edgeState, setEdgeState] = useState({});
  const [status, setStatus] = useState("Ready — click Submit Task to start the economy.");
  const [usyc, setUsyc] = useState(null);
  const [report, setReport] = useState(null);
  const [switched, setSwitched] = useState(false);
  const [tab, setTab] = useState("graph");
  const [concurrent, setConcurrent] = useState(false);
  const [wsMode, setWsMode] = useState("simulation"); // "live" | "simulation"
  const [wsConnected, setWsConnected] = useState(false);
  const [taskInput, setTaskInput] = useState("AI agent frameworks competitive analysis");
  const [repState, setRepState] = useState({ filter_a: 81, filter_b: 58 });

  const pidRef = useRef(0);
  const txIdRef = useRef(0);
  const wsRef = useRef(null);

  // ── WebSocket connection ───────────────────────────────────────────────────
  const WS_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_URL) || "ws://localhost:8000/ws";
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => { setWsConnected(true); setWsMode("live"); };
    ws.onclose = () => { setWsConnected(false); setWsMode("simulation"); };
    ws.onerror = () => { setWsMode("simulation"); };

    ws.onmessage = (evt) => {
      try { handleWsEvent(JSON.parse(evt.data)); }
      catch (e) { console.warn("WS parse error:", e); }
    };
    return () => ws.close();
  }, []);

  const handleWsEvent = useCallback((event) => {
    switch (event.type) {
      case "nanopayment":
        addTxFromWs(event.tx);
        addPulseFromWs(event.tx.from_agent, event.tx.to_agent, C.green);
        break;
      case "payment_withheld":
        addTxFromWs(event.tx);
        addPulseFromWs(event.tx.from_agent, event.tx.to_agent, C.red);
        break;
      case "agent_switch":
        handleSwitch(event.failed_agent, event.replacement);
        setStatus(`⚠  Quality ${event.quality_score.toFixed(2)} < ${event.threshold} · ${event.failed_agent} slashed · ${event.replacement} takes over`);
        setSwitched(true);
        setRepState(r => ({ ...r, [event.failed_agent]: Math.max(10, (r[event.failed_agent] || 50) - 15) }));
        break;
      case "usyc_opened":
        setUsyc({ opened: true, amount: event.position?.usdc_deposited });
        setStatus("USYC yield position opened · idle budget earning…");
        break;
      case "auction_complete":
        sN(event.winner, "active");
        setStatus(`Auction complete · ${event.winner} wins (score: ${event.score?.toFixed(0)})`);
        break;
      case "phase_start":
        setStatus(`Phase: ${event.phase} · payments streaming…`);
        break;
      case "task_complete":
        setReport(event.report);
        setUsyc({ earned: event.yield_earned });
        setStatus(`✓ Task complete · ${event.stats?.total_transactions} transactions · $${event.stats?.total_usdc_settled?.toFixed(4)} settled`);
        setPhase("complete");
        break;
      case "task_error":
        setStatus(`✗ Error: ${event.error}`);
        setPhase("idle");
        break;
    }
  }, []);

  const addPulseFromWs = (fromRaw, toRaw, color) => {
    const map = {
      "orchestrator": "orchestrator", "search a": "search_a", "search b": "search_b",
      "filter a": "filter_a", "filter b": "filter_b", "quality oracle": "oracle",
      "search_a": "search_a", "search_b": "search_b", "filter_a": "filter_a", "filter_b": "filter_b",
    };
    const from = map[fromRaw?.toLowerCase().replace(" (replacement)", "").trim()];
    const to = map[toRaw?.toLowerCase().replace(" (replacement)", "").trim()];
    if (from && to) addPulse(from, to, color);
  };

  const addTxFromWs = (tx) => {
    setTxs(p => [{ ...tx, id: ++txIdRef.current }, ...p.slice(0, 499)]);
  };

  const handleSwitch = (failed, replacement) => {
    sN(failed, "failed");
    sE(`orchestrator-${failed}`, { c: "#444", o: 0.1, w: 1, dash: "4,4" });
    sN(replacement, "replacement");
    sE(`orchestrator-${replacement}`, { c: C.purple, o: 0.9, w: 2 });
  };

  // ── Simulation mode ────────────────────────────────────────────────────────
  const addPulse = useCallback((from, to, color = C.green) => {
    const id = ++pidRef.current;
    setPulses(p => [...p, { id, from, to, color }]);
    setTimeout(() => setPulses(p => p.filter(x => x.id !== id)), 700);
  }, []);

  const addTx = useCallback((from, to, amount, status, memo = "") => {
    const t = { id: ++txIdRef.current, hash: Math.random().toString(16).slice(2, 10).toUpperCase(), from, to, amount, status, memo, ts: Date.now() };
    setTxs(p => [t, ...p.slice(0, 499)]);
  }, []);

  const sN = (id, s) => setNodeState(n => ({ ...n, [id]: s }));
  const sE = (k, v) => setEdgeState(e => ({ ...e, [k]: v }));

  const submitToBackend = async () => {
    try {
      const r = await fetch("http://localhost:8000/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: taskInput }),
      });
      if (r.ok) {
        setStatus("Task submitted to live backend · watching WebSocket…");
        return true;
      }
    } catch (e) { }
    return false;
  };

  const runSimulation = async () => {
    setPhase("running");
    setTxs([]); setPulses([]); setNodeState({}); setEdgeState({});
    setSwitched(false); setReport(null); setUsyc(null); setConcurrent(false);
    txIdRef.current = 0; pidRef.current = 0;
    setRepState({ filter_a: 81, filter_b: 58 });

    setStatus("Opening USYC yield position on $0.09 idle capital…");
    await SLEEP(600);

    setStatus("Auction · Search A wins (rep:72 score:3600 vs B:2954)");
    sN("search_a", "active"); sE("orchestrator-search_a", { c: C.violet, o: 0.85, w: 2 });
    await SLEEP(900);

    setStatus("Search phase · 25 queries · $0.0002 each…");
    for (let i = 0; i < 25; i++) {
      addPulse("orchestrator", "search_a", C.green);
      if (i % 7 === 0) addPulse("search_a", "filter_a", C.green);
      addTx("Orchestrator", "Search A", 0.0002, "released", `Search result ${i + 1}/25`);
      await SLEEP(85);
    }

    setStatus("Auction · Filter A wins (rep:81 score:8100) · 200 items queued");
    sN("filter_a", "active"); sE("orchestrator-filter_a", { c: C.violet, o: 0.85, w: 2 });
    addPulse("orchestrator", "oracle", C.blue);
    await SLEEP(800);

    setStatus("Filter phase · 200 items · $0.0001 each · quality monitoring…");
    for (let i = 0; i < 150; i++) {
      addPulse("orchestrator", "filter_a", C.amber);
      if (i % 20 === 0) addPulse("filter_a", "oracle", C.blue);
      addTx("Orchestrator", "Filter A", 0.0001, "released", `Filter item ${i + 1}/200`);
      await SLEEP(20);
    }

    // ── SWITCHING MOMENT ──────────────────────────────────────────────────
    setStatus("⚠  Quality Oracle: Filter A batch = 0.61 · threshold 0.70 · WITHHOLDING");
    addPulse("filter_a", "oracle", C.blue);
    await SLEEP(250);
    addPulse("orchestrator", "filter_a", C.red);
    addTx("Orchestrator", "Filter A", 0.0001, "withheld", "Quality 0.61 < 0.70 — $0 gas");
    sN("filter_a", "failed");
    sE("orchestrator-filter_a", { c: "#333", o: 0.1, w: 1, dash: "4,4" });
    setRepState(r => ({ ...r, filter_a: Math.max(10, r.filter_a - 15) }));
    await SLEEP(1500);

    setStatus("New auction · Filter B selected · slashing Filter A stake −10% on-chain…");
    sN("filter_b", "replacement");
    sE("orchestrator-filter_b", { c: C.purple, o: 0.9, w: 2.5 });
    setSwitched(true);
    await SLEEP(900);

    setStatus("Filter B takes over · items 151–200 · $0.00012/item · economy self-healed");
    for (let i = 150; i < 200; i++) {
      addPulse("orchestrator", "filter_b", C.amber);
      addTx("Orchestrator", "Filter B", 0.00012, "released", `Filter item ${i + 1}/200 (replacement)`);
      await SLEEP(20);
    }

    setUsyc(0.0000021);
    // txs state lags one render; compute totals inline from the scripted simulation
    const simTxCount = 1 + 1 + 150 + 25 + 25; // search_a + search_b + filter_a*150 + filter_b*50 + factcheck/misc ≈ 225
    const simTotal = parseFloat((0.0002 + 0.00022 + 150 * 0.0001 + 50 * 0.00012).toFixed(6));
    setReport(MOCK_REPORT(taskInput, { txCount: simTxCount, totalUsd: simTotal, filtered: 200 }));
    setStatus("✓ Task complete · 225 transactions · $0.025 total · USYC +$0.0000021");
    setPhase("complete");
  };

  const handleSubmit = async () => {
    if (phase === "running") return;
    if (wsConnected) {
      setPhase("running");
      setTxs([]); setPulses([]); setNodeState({}); setEdgeState({});
      setSwitched(false); setReport(null); setUsyc(null); setConcurrent(false);
      txIdRef.current = 0; pidRef.current = 0;
      const ok = await submitToBackend();
      if (!ok) { setWsMode("simulation"); runSimulation(); }
    } else {
      runSimulation();
    }
  };

  const runConcurrent = async () => {
    setConcurrent(true);
    setStatus("Firing two simultaneous tasks · 450+ transactions exploding…");
    for (let i = 0; i < 65; i++) {
      addPulse("orchestrator", "search_b", C.green);
      addPulse("orchestrator", "filter_b", C.amber);
      addTx("Orchestrator", "Search B", 0.00022, "released", `Task 2 · query ${i + 1}`);
      addTx("Orchestrator", "Filter B", 0.00012, "released", `Task 2 · item ${i + 1}`);
      await SLEEP(25);
    }
    setStatus("✓ Two tasks complete · 450+ transactions · This scales.");
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const released = txs.filter(t => t.status === "released");
  const withheld = txs.filter(t => t.status === "withheld");
  const totalUsdc = released.reduce((a, t) => a + (t.amount || t.amount_usdc || 0), 0);

  const edgeC = k => edgeState[k]?.c || C.border2;
  const edgeO = k => edgeState[k]?.o ?? 0.25;
  const edgeW = k => edgeState[k]?.w ?? 1;
  const edgeD = k => edgeState[k]?.dash || "none";

  const nodeColor = id => {
    const s = nodeState[id];
    if (s === "failed") return C.red;
    if (s === "replacement") return C.purple;
    return NODES[id]?.color;
  };
  const nodeGlow = id => {
    const s = nodeState[id];
    if (s === "failed") return `drop-shadow(0 0 14px ${C.red})`;
    if (s === "replacement") return `drop-shadow(0 0 12px ${C.purple})`;
    if (s === "active") return `drop-shadow(0 0 10px ${NODES[id]?.color})`;
    return "none";
  };
  const nodeFillO = id => {
    const s = nodeState[id];
    if (s === "active" || s === "replacement") return 0.3;
    if (s === "failed") return 0.25;
    return 0.1;
  };
  const repFor = id => {
    if (id === "filter_a") return repState.filter_a;
    if (id === "filter_b") return repState.filter_b;
    return NODES[id]?.rep;
  };

  return (
    <div style={{ fontFamily: "'Sora',sans-serif", background: C.bg, color: C.text, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <style>{GLOBAL_STYLE}</style>
      {/* Scanline texture */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.05) 2px,rgba(0,0,0,0.05) 4px)", zIndex: 0 }} />

      {/* ── Header ── */}
      <div style={{ position: "relative", zIndex: 1, padding: "10px 24px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
            <span style={{ color: C.violet }}>Arc</span><span style={{ color: C.green }}>Reflex</span>
          </div>
          <div style={{ fontSize: 8, letterSpacing: "0.12em", color: C.muted, textTransform: "uppercase", marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>Autonomous Economic Nervous System</div>
        </div>
        {/* WS status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 4, background: wsConnected ? "#041A0A" : "#0F0F20", border: `1px solid ${wsConnected ? C.green : C.dim}` }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: wsConnected ? C.green : C.muted, animation: wsConnected ? "blink 2s ease-in-out infinite" : "none" }} />
          <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: wsConnected ? C.green : C.muted }}>
            {wsConnected ? `LIVE ${WS_URL}` : "SIMULATION MODE"}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {[
          { label: "TXS", v: txs.length, c: C.violet },
          { label: "SETTLED", v: `$${totalUsdc.toFixed(4)}`, c: C.green },
          { label: "WITHHELD", v: withheld.length, c: C.red },
          { label: "ETH EQUIV", v: txs.length ? `$${(txs.length * 2.12).toFixed(0)}` : "-", c: C.amber },
        ].map(s => (
          <div key={s.label} style={{ textAlign: "right", minWidth: 70 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: s.c, lineHeight: 1, fontFamily: "'JetBrains Mono',monospace" }}>{s.v}</div>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: "0.1em", marginTop: 1, textTransform: "uppercase" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Status bar ── */}
      <div style={{ position: "relative", zIndex: 1, padding: "6px 24px", background: "#07071A", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
          background: phase === "running" ? C.green : phase === "complete" ? C.purple : C.dim,
          boxShadow: phase === "running" ? `0 0 8px ${C.green}` : "none",
          animation: phase === "running" ? "blink 1s ease-in-out infinite" : "none"
        }} />
        <div style={{ fontSize: 11, color: C.muted, flex: 1, fontFamily: "'JetBrains Mono',monospace" }}>{status}</div>
        {switched && <div style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, background: "#1A0510", border: `1px solid ${C.red}`, color: C.red, fontFamily: "'JetBrains Mono',monospace" }}>FILTER_A SLASHED −10%</div>}
        {usyc && <div style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, background: "#041A0A", border: `1px solid ${C.green}`, color: C.green, fontFamily: "'JetBrains Mono',monospace" }}>USYC YIELD +${typeof usyc === "number" ? usyc.toFixed(7) : (usyc.earned || 0).toFixed(7)}</div>}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative", zIndex: 1 }}>

        {/* ── Left panel ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.border}`, overflow: "hidden" }}>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
            {["graph", "economy", "report"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "9px 20px", fontSize: 10, fontWeight: 600, letterSpacing: "0.09em",
                textTransform: "uppercase", background: "none", border: "none", cursor: "pointer",
                color: tab === t ? C.violet : C.muted,
                borderBottom: tab === t ? `2px solid ${C.violet}` : "2px solid transparent",
                marginBottom: -1, fontFamily: "'JetBrains Mono',monospace",
              }}>{t}</button>
            ))}
          </div>

          {/* ── GRAPH TAB ── */}
          {tab === "graph" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "14px 18px 10px" }}>
              <svg viewBox="0 0 760 480" style={{ flex: 1, maxHeight: 390, width: "100%" }}>
                <defs>
                  <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  <radialGradient id="bgG" cx="50%" cy="40%" r="60%">
                    <stop offset="0%" stopColor="#0D0D28" /><stop offset="100%" stopColor="#05050D" />
                  </radialGradient>
                </defs>
                <rect width="760" height="480" fill="url(#bgG)" rx="8" />
                {[...Array(9)].map((_, i) => <line key={`h${i}`} x1={0} y1={i * 60} x2={760} y2={i * 60} stroke={C.border} strokeWidth={0.4} strokeOpacity={0.4} />)}
                {[...Array(14)].map((_, i) => <line key={`v${i}`} x1={i * 58} y1={0} x2={i * 58} y2={480} stroke={C.border} strokeWidth={0.4} strokeOpacity={0.4} />)}

                {/* Edges */}
                {EDGES.map(([f, t]) => {
                  const fn = NODES[f], tn = NODES[t]; const k = `${f}-${t}`;
                  return <line key={k} id={`edge-${k}`} x1={fn.x} y1={fn.y} x2={tn.x} y2={tn.y}
                    stroke={edgeC(k)} strokeWidth={edgeW(k)} strokeOpacity={edgeO(k)} strokeDasharray={edgeD(k)} />;
                })}

                {/* Pulses */}
                {pulses.map(p => {
                  const fn = NODES[p.from], tn = NODES[p.to]; if (!fn || !tn) return null;
                  return (
                    <circle key={p.id} r={4} fill={p.color} opacity={0.9} filter="url(#glow)">
                      <animateMotion dur="0.62s" fill="remove" path={`M${fn.x},${fn.y} L${tn.x},${tn.y}`} />
                    </circle>
                  );
                })}

                {/* Nodes */}
                {Object.entries(NODES).map(([id, pos]) => {
                  const c = nodeColor(id); const s = nodeState[id];
                  const isActive = s === "active" || s === "replacement";
                  const rep = repFor(id);
                  return (
                    <g key={id}>
                      {isActive && <circle cx={pos.x} cy={pos.y} r={44} fill={c} fillOpacity={0.04} />}
                      <circle cx={pos.x} cy={pos.y} r={30} fill={c} fillOpacity={nodeFillO(id)}
                        stroke={c} strokeWidth={1.5} strokeOpacity={0.8} style={{ filter: nodeGlow(id) }} />
                      {pos.label.split(" ").map((w, i, a) => (
                        <text key={w} x={pos.x} y={pos.y + (a.length === 1 ? 0 : i === 0 ? -7 : 7)}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={9} fontWeight={600} fill={c} fontFamily="'Sora',sans-serif" style={{ userSelect: "none" }}>
                          {w}
                        </text>
                      ))}
                      {rep !== null && (
                        <text x={pos.x} y={pos.y + 21} textAnchor="middle" fontSize={7.5}
                          fill={s === "failed" ? C.red : C.muted} fontFamily="'JetBrains Mono',monospace" style={{ userSelect: "none" }}>
                          rep:{rep}
                        </text>
                      )}
                      {s === "failed" && <text x={pos.x} y={pos.y - 40} textAnchor="middle" fontSize={7.5} fill={C.red} fontWeight={700} fontFamily="'JetBrains Mono',monospace" style={{ userSelect: "none" }}>SLASHED</text>}
                      {s === "replacement" && <text x={pos.x} y={pos.y - 40} textAnchor="middle" fontSize={7.5} fill={C.purple} fontWeight={700} fontFamily="'JetBrains Mono',monospace" style={{ userSelect: "none" }}>BACKUP ACTIVE</text>}
                    </g>
                  );
                })}

                {/* Legend */}
                <g transform="translate(14,458)">
                  {[[C.green, "Released"], [C.red, "Withheld"], [C.purple, "Re-routed"], [C.blue, "Oracle score"]].map(([c, l], i) => (
                    <g key={l} transform={`translate(${i * 172},0)`}>
                      <circle cx={5} cy={5} r={3} fill={c} />
                      <text x={12} y={9} fontSize={8} fill={C.muted} fontFamily="'JetBrains Mono',monospace">{l}</text>
                    </g>
                  ))}
                </g>
              </svg>

              {/* Task input + CTA */}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexShrink: 0 }}>
                <input
                  value={taskInput}
                  onChange={e => setTaskInput(e.target.value)}
                  disabled={phase === "running"}
                  placeholder="Enter task for the agent economy…"
                  style={{
                    flex: 1, padding: "8px 14px", borderRadius: 6, background: C.card,
                    border: `1px solid ${C.border2}`, color: C.text, fontSize: 12,
                    fontFamily: "'JetBrains Mono',monospace", outline: "none",
                  }}
                />
                {phase === "running" ? (
                  <div style={{ padding: "8px 22px", borderRadius: 6, background: C.card, border: `1px solid ${C.border2}`, color: C.muted, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>
                    RUNNING…
                  </div>
                ) : (
                  <button onClick={handleSubmit} style={{
                    padding: "8px 22px", borderRadius: 6, background: "linear-gradient(135deg,#6D28D9,#4338CA)",
                    color: "#fff", fontWeight: 700, fontSize: 12, border: "none", cursor: "pointer",
                    boxShadow: `0 4px 24px rgba(109,40,217,0.35)`, letterSpacing: "0.04em",
                    fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap",
                  }}>
                    {phase === "complete" ? "▶ RUN AGAIN" : "▶ SUBMIT TASK"}
                  </button>
                )}
                {phase === "complete" && !concurrent && (
                  <button onClick={runConcurrent} style={{
                    padding: "8px 16px", borderRadius: 6, background: "#041A0A",
                    border: `1px solid ${C.green}`, color: C.green, fontWeight: 700, fontSize: 12,
                    cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap",
                  }}>⚡ ×2</button>
                )}
              </div>
            </div>
          )}

          {/* ── ECONOMY TAB ── */}
          {tab === "economy" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Gas Cost — 225 Transactions</div>
                <div style={{ fontSize: 9, color: C.muted, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em" }}>log₁₀ scale</div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 28, fontFamily: "'JetBrains Mono',monospace" }}>
                Actual value of work delivered: $0.025
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 220, marginBottom: 8, padding: "0 12px" }}>
                {GAS.map(d => (
                  <div key={d.n} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: d.c, marginBottom: 6, fontFamily: "'JetBrains Mono',monospace" }}>
                      {d.v < 0.001 ? `$${d.v.toFixed(6)}` : `$${d.v.toFixed(2)}`}
                    </div>
                    <div style={{ width: "75%", maxWidth: 56, height: d.bar, background: d.c, borderRadius: "4px 4px 0 0", opacity: 0.8, boxShadow: `0 0 16px ${d.c}44`, minHeight: 2 }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 18, padding: "0 12px", borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                {GAS.map(d => <div key={d.n} style={{ flex: 1, textAlign: "center", fontSize: 9, color: d.c, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{d.n}</div>)}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 28 }}>
                {[
                  { label: "Ethereum L1", sub: "19,080× overhead", val: "$477.00", c: C.red, bg: "#150507" },
                  { label: "Arc + Nanopayments", sub: "0.009× ratio ✓", val: "$0.000225", c: C.green, bg: "#030F07" },
                ].map(b => (
                  <div key={b.label} style={{ padding: 16, borderRadius: 8, background: b.bg, border: `1px solid ${b.c}33` }}>
                    <div style={{ fontSize: 10, color: b.c, fontWeight: 600, marginBottom: 4 }}>{b.label}</div>
                    <div style={{ fontSize: 22, color: b.c, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{b.val}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{b.sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 20, padding: 18, background: C.card, borderRadius: 8, border: `1px solid ${C.border2}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 14, color: C.text }}>Agent Revenue This Task</div>
                {[
                  { name: "Search A", earned: 0.005, color: C.green },
                  { name: "Filter A (items 1–150)", earned: 0.015, color: C.amber },
                  { name: "Filter B (items 151–200)", earned: 0.006, color: C.purple },
                  { name: "Quality Oracle", earned: 0.001, color: C.blue },
                ].map(a => (
                  <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
                    <div style={{ fontSize: 10, color: C.muted, minWidth: 160, fontFamily: "'JetBrains Mono',monospace" }}>{a.name}</div>
                    <div style={{ flex: 1, height: 5, background: "#111128", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${(a.earned / 0.025) * 100}%`, height: "100%", background: a.color, borderRadius: 3, boxShadow: `0 0 8px ${a.color}88` }} />
                    </div>
                    <div style={{ fontSize: 10, color: a.color, fontWeight: 700, minWidth: 54, textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>${a.earned.toFixed(4)}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, padding: 14, background: "#030F07", border: `1px solid ${C.green}33`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 6 }}>USYC — Idle Budget Earns Yield</div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.75 }}>
                  While the Orchestrator holds $0.09 of idle budget, it converts to USYC (~5% APY). Yield per task: ~$0.0000021. The principle: this agent grows its own treasury while it works. No other framework does this.
                </div>
              </div>
            </div>
          )}

          {/* ── REPORT TAB ── */}
          {tab === "report" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              {!report ? (
                <div style={{ color: C.muted, textAlign: "center", marginTop: 80, fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>
                  Run a task to generate the agent-produced report.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, color: C.purple, letterSpacing: "-0.02em" }}>{report.title}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                    {[
                      [`${report.metadata?.sources_searched || 25} sources`, C.blue],
                      [`${report.metadata?.results_filtered || 200} filtered`, C.amber],
                      [`${report.metadata?.total_transactions || 225} txs`, C.purple],
                      [`$${(report.metadata?.total_cost_usdc || 0.025).toFixed(3)} total`, C.green],
                    ].map(([l, c]) => (
                      <div key={l} style={{ fontSize: 9, padding: "3px 10px", borderRadius: 4, background: C.card, border: `1px solid ${C.border2}`, color: c, fontFamily: "'JetBrains Mono',monospace" }}>{l}</div>
                    ))}
                  </div>
                  {(report.sections || []).map((s, i) => (
                    <div key={i} className="fade-up" style={{ marginBottom: 14, padding: 16, background: C.card, borderRadius: 8, border: `1px solid ${C.border2}`, animationDelay: `${i * 0.06}s` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, marginBottom: 7 }}>{s.heading || s.h}</div>
                      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.78 }}>{s.content || s.c}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Feed ── */}
        <div style={{ width: 305, display: "flex", flexDirection: "column", background: C.surface, flexShrink: 0 }}>
          {/* Agent status */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 8, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase", marginBottom: 10, fontFamily: "'JetBrains Mono',monospace" }}>Agent Status</div>
            {Object.entries(NODES).filter(([_, p]) => p.rep !== null).map(([id, pos]) => {
              const s = nodeState[id];
              const sc = s === "failed" ? C.red : s === "replacement" ? C.purple : s === "active" ? C.green : C.dim;
              const sl = s === "failed" ? "SLASHED" : s === "replacement" ? "BACKUP" : s === "active" ? "ACTIVE" : "STANDBY";
              const rep = repFor(id);
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: sc, flexShrink: 0, boxShadow: s && s !== "failed" ? `0 0 6px ${sc}` : "none" }} />
                  <div style={{ flex: 1, fontSize: 10, color: pos.color, fontWeight: 500 }}>{pos.label}</div>
                  <div style={{ fontSize: 8, color: sc, fontFamily: "'JetBrains Mono',monospace" }}>{sl}</div>
                  <div style={{ fontSize: 8, color: C.muted, fontFamily: "'JetBrains Mono',monospace" }}>r:{rep}</div>
                </div>
              );
            })}
          </div>

          {/* Feed header */}
          <div style={{ padding: "9px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 8, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase", fontFamily: "'JetBrains Mono',monospace" }}>Live Transaction Feed</div>
            <div style={{ fontSize: 10, color: C.violet, fontFamily: "'JetBrains Mono',monospace" }}>{txs.length}</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", fontFamily: "'JetBrains Mono',monospace" }}>
            {txs.length === 0 ? (
              <div style={{ padding: 24, color: C.dim, fontSize: 11, textAlign: "center" }}>Awaiting transactions…</div>
            ) : txs.map(t => {
              const amt = t.amount || t.amount_usdc || 0;
              return (
                <div key={t.id} className="tx-row" style={{
                  padding: "5px 14px", borderBottom: `1px solid ${C.border}`,
                  display: "flex", gap: 8, alignItems: "flex-start",
                  background: t.status === "withheld" ? "#120306" : "transparent",
                }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%", flexShrink: 0, marginTop: 3,
                    background: t.status === "released" ? C.green : C.red,
                    boxShadow: t.status === "released" ? `0 0 5px ${C.green}` : `0 0 5px ${C.red}`,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(t.from || t.from_agent)} → {(t.to || t.to_agent)}
                    </div>
                    <div style={{ fontSize: 8, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.memo}</div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, flexShrink: 0, color: t.status === "released" ? C.green : C.red }}>
                    {t.status === "withheld" ? "✗" : t.status === "released" ? `$${amt.toFixed(5)}` : "…"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer stats */}
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, background: C.card, flexShrink: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { l: "Total gas", v: "$0.000225", c: C.green },
                { l: "ETH equiv", v: `$${(released.length * 2.12).toFixed(0) || 477}`, c: C.red },
                { l: "EIP-3009", v: released.length, c: C.blue },
                { l: "Withheld", v: withheld.length, c: C.amber },
              ].map(s => (
                <div key={s.l}>
                  <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.l}</div>
                  <div style={{ fontSize: 12, color: s.c, fontWeight: 700, marginTop: 1 }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mock report ────────────────────────────────────────────────────────────────
function MOCK_REPORT(task, runData = {}) {
  const txCount = runData.txCount ?? 225;
  const totalUsd = runData.totalUsd ?? 0.025;
  const filtered = runData.filtered ?? 200;
  return {
    title: `Competitive Analysis: ${task}`,
    sections: [
      { heading: "Market Overview", content: `The ${task} market shows rapid fragmentation across protocol, tooling, and application layers. Analysis of ${filtered} filtered sources reveals three dominant positions and six emerging challengers with 340% YoY developer adoption growth.` },
      { heading: "Key Players", content: "Incumbent leaders command 68% of mindshare through documentation quality. Second-tier challengers differentiate on performance (3.2× throughput) and cost. Only Arc-native protocols achieve sub-cent per-action settlement — the prerequisite for granular agent economies." },
      { heading: "Technical Comparison", content: `Payment primitives are the clearest differentiator. All Ethereum-based competitors fail the economic viability test at ${txCount}+ transactions per task. On Ethereum: $${(txCount * 2.12).toFixed(0)} gas for this task. On Arc: $${totalUsd.toFixed(6)}. The difference is not marginal — it is the difference between impossible and inevitable.` },
      { heading: "Market Gaps", content: "Four gaps remain unaddressed: (1) per-action on-chain settlement at scale, (2) reputation-staked quality enforcement with zero-gas withholding, (3) idle treasury yield during computation via USYC, (4) HTTP-native payment discovery via x402. All four are ArcReflex-exclusive primitives." },
      { heading: "Recommendations", content: "Adopt ArcReflex as the payment and accountability layer. The combination of Circle Nanopayments + ERC-8004 reputation + USYC yield produces agents with economic skin in the game — the missing primitive for production multi-agent deployment." },
    ],
    metadata: { sources_searched: 25, results_filtered: filtered, total_transactions: txCount, total_cost_usdc: totalUsd },
  };
}
