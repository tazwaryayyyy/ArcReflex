import { useState, useRef, useCallback, useEffect } from "react";

// ── Fonts & Global Styles ────────────────────────────────────────────────────
const GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sora', sans-serif; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #07070F; }
  ::-webkit-scrollbar-thumb { background: #1E1E3A; border-radius: 2px; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
  @keyframes fadeInUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ripple { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(2.5);opacity:0} }
  @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
  @keyframes slideIn { from{opacity:0;transform:translateX(8px)} to{opacity:1;transform:translateX(0)} }
  @keyframes glowPulse { 0%,100%{filter:drop-shadow(0 0 6px currentColor)} 50%{filter:drop-shadow(0 0 18px currentColor)} }
  .tx-row { animation: slideIn 0.2s ease-out; }
`;

// ── Layout Constants ──────────────────────────────────────────────────────────
const NODES = {
  orchestrator: { x:390, y:88,  label:"Orchestrator",   sub:null,           color:"#8B5CF6", rep:null },
  search_a:     { x:155, y:240, label:"Search A",       sub:"rep:72 · $0.0002/q",  color:"#00D97E", rep:72 },
  search_b:     { x:335, y:240, label:"Search B",       sub:"rep:65 · $0.00022/q", color:"#00D97E", rep:65 },
  filter_a:     { x:200, y:390, label:"Filter A",       sub:"rep:81 · $0.0001/item",color:"#F5A623", rep:81 },
  filter_b:     { x:380, y:390, label:"Filter B",       sub:"rep:58 · $0.00012/item",color:"#F5A623", rep:58 },
  oracle:       { x:590, y:88,  label:"Quality Oracle", sub:"rep:92 · $0.00005/score",color:"#38BDF8", rep:92 },
};

const EDGES = [
  ["orchestrator","search_a"],["orchestrator","search_b"],
  ["orchestrator","filter_a"],["orchestrator","filter_b"],
  ["orchestrator","oracle"],["search_a","filter_a"],["search_b","filter_a"],
];

const SLEEP = ms => new Promise(r => setTimeout(r, ms));

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  bg:       "#05050D",
  surface:  "#0A0A16",
  card:     "#0D0D1F",
  border:   "#161630",
  border2:  "#1E1E3A",
  text:     "#E2E2F2",
  muted:    "#6060A0",
  dim:      "#2A2A4A",
  violet:   "#8B5CF6",
  green:    "#00D97E",
  amber:    "#F5A623",
  blue:     "#38BDF8",
  red:      "#F43F5E",
  purple:   "#A78BFA",
};

// ── Gas comparison data ───────────────────────────────────────────────────────
const GAS = [
  { n:"Ethereum L1", v:477.00,   bar:180, c:"#F43F5E" },
  { n:"Arbitrum",    v:22.50,    bar:80,  c:"#F97316" },
  { n:"Solana",      v:0.56,     bar:24,  c:"#EAB308" },
  { n:"Arc ✓",       v:0.000225, bar:3,   c:"#00D97E" },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function ArcReflex() {
  const [phase, setPhase]         = useState("idle"); // idle | running | complete
  const [txs, setTxs]             = useState([]);
  const [pulses, setPulses]       = useState([]);
  const [nodeState, setNodeState] = useState({});     // id → "active"|"failed"|"replacement"
  const [edgeState, setEdgeState] = useState({});     // "a-b" → {c,o,w,dash}
  const [status, setStatus]       = useState("Ready — submit a task to start the economy.");
  const [usyc, setUsyc]           = useState(null);
  const [report, setReport]       = useState(null);
  const [switched, setSwitched]   = useState(false);
  const [tab, setTab]             = useState("graph");
  const [concurrent, setConcurrent] = useState(false);

  const pidRef  = useRef(0);
  const txIdRef = useRef(0);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const addPulse = useCallback((from, to, color = C.green) => {
    const id = ++pidRef.current;
    setPulses(p => [...p, { id, from, to, color }]);
    setTimeout(() => setPulses(p => p.filter(x => x.id !== id)), 700);
  }, []);

  const addTx = useCallback((from, to, amount, status, memo = "") => {
    const t = {
      id: ++txIdRef.current,
      hash: Math.random().toString(16).slice(2, 10).toUpperCase(),
      from, to, amount, status, memo, ts: Date.now(),
    };
    setTxs(p => [t, ...p.slice(0, 499)]);
  }, []);

  const sN = (id, s) => setNodeState(n => ({ ...n, [id]: s }));
  const sE = (k, v) => setEdgeState(e => ({ ...e, [k]: v }));

  // ── Simulation ─────────────────────────────────────────────────────────────
  const run = async () => {
    setPhase("running");
    setTxs([]); setPulses([]); setNodeState({}); setEdgeState({});
    setSwitched(false); setReport(null); setUsyc(null); setConcurrent(false);
    txIdRef.current = 0; pidRef.current = 0;

    // USYC position
    setStatus("Opening USYC yield position on $0.09 idle capital…");
    await SLEEP(700);

    // Search auction
    setStatus("Reputation-weighted auction → Search A wins (score 3600 vs B: 2954)");
    sN("search_a", "active");
    sE("orchestrator-search_a", { c: C.violet, o: 0.85, w: 2 });
    await SLEEP(900);

    // 25 searches
    setStatus("Search phase · 25 queries · $0.0002 each · payments streaming…");
    for (let i = 0; i < 25; i++) {
      addPulse("orchestrator", "search_a", C.green);
      if (i % 7 === 0) addPulse("search_a", "filter_a", C.green);
      addTx("Orchestrator", "Search A", 0.0002, "released", `Search result ${i + 1}/25`);
      await SLEEP(90);
    }

    // Filter auction
    setStatus("Auction → Filter A wins (rep:81 · score:8100) · 200 items queued");
    sN("filter_a", "active");
    sE("orchestrator-filter_a", { c: C.violet, o: 0.85, w: 2 });
    addPulse("orchestrator", "oracle", C.blue);
    await SLEEP(800);

    // 150 filter items
    setStatus("Filter phase · 200 items · $0.0001 each · quality monitoring active…");
    for (let i = 0; i < 150; i++) {
      addPulse("orchestrator", "filter_a", C.amber);
      if (i % 18 === 0) addPulse("filter_a", "oracle", C.blue);
      addTx("Orchestrator", "Filter A", 0.0001, "released", `Filter item ${i + 1}/200`);
      await SLEEP(22);
    }

    // ── THE SWITCHING MOMENT ───────────────────────────────────────────────
    setStatus("⚠  Quality Oracle: Filter A batch = 0.61 · threshold = 0.70 · WITHHOLDING PAYMENT");
    addPulse("filter_a", "oracle", C.blue);
    await SLEEP(200);
    addPulse("orchestrator", "filter_a", C.red);
    addTx("Orchestrator", "Filter A", 0.0001, "withheld", "Quality 0.61 < 0.70 — withheld, $0 gas");
    sN("filter_a", "failed");
    sE("orchestrator-filter_a", { c: "#444", o: 0.12, w: 1, dash: "4,4" });
    await SLEEP(1400);

    setStatus("New auction · Filter B wins · Slashing Filter A stake −10% on-chain…");
    sN("filter_b", "replacement");
    sE("orchestrator-filter_b", { c: C.purple, o: 0.9, w: 2 });
    setSwitched(true);
    await SLEEP(900);

    // 50 remaining at filter_b
    setStatus("Filter B takes over · items 151–200 · economy self-healed");
    for (let i = 150; i < 200; i++) {
      addPulse("orchestrator", "filter_b", C.amber);
      addTx("Orchestrator", "Filter B", 0.00012, "released", `Filter item ${i + 1}/200 (replacement)`);
      await SLEEP(22);
    }

    // Complete
    setUsyc(0.0000021);
    setReport({
      title: "Competitive Analysis: AI Agent Frameworks",
      sections: [
        { h: "Market Overview", c: "The AI agent framework market is experiencing rapid expansion. LangChain, AutoGen, CrewAI, and emerging protocols establish distinct positioning across autonomy, cost, and integration depth. ArcReflex occupies a unique position: the only protocol where agent quality is enforced through economic incentives verified on-chain." },
        { h: "Key Players", c: "LangChain leads in developer adoption (80k+ GitHub stars) but lacks payment primitives. AutoGen (Microsoft) enables multi-agent conversation without economic accountability. CrewAI simplifies role-based orchestration. None implement per-action settlement or reputation staking — the primitives that create real economic alignment." },
        { h: "Technical Comparison", c: "All major frameworks treat inter-agent communication as cost-free software calls. ArcReflex introduces EIP-3009 off-chain authorization as the coordination primitive — payment is the signal. Quality failure means no payment, at zero gas cost. This creates real economic skin-in-the-game that software assertions cannot replicate." },
        { h: "Market Gaps", c: "No framework currently provides: (1) per-action on-chain settlement, (2) reputation-staked quality enforcement, (3) idle treasury yield via USYC, or (4) HTTP-native payment discovery via x402. All four are exclusive to ArcReflex — and all four are critical for production agent economies." },
        { h: "Recommendations", c: "Adopt ArcReflex as the payment and accountability layer; integrate existing LLM orchestration frameworks as the reasoning layer. The combination yields agents with both intelligence and economic skin in the game — the missing primitive for production multi-agent deployments." },
      ],
      meta: { sources: 25, filtered: 200, txCount: 225, cost: 0.025 },
    });

    setStatus("✓ Task complete · 225 transactions · $0.025 total · USYC +$0.0000021 earned");
    setPhase("complete");
  };

  const runConcurrent = async () => {
    setConcurrent(true);
    setStatus("Firing two simultaneous tasks · 450+ transactions exploding…");
    for (let i = 0; i < 60; i++) {
      addPulse("orchestrator", "search_b", C.green);
      addPulse("orchestrator", "filter_b", C.amber);
      addTx("Orchestrator", "Search B", 0.00022, "released", `Task 2 · query ${i + 1}`);
      addTx("Orchestrator", "Filter B", 0.00012, "released", `Task 2 · item ${i + 1}`);
      await SLEEP(28);
    }
    setStatus("✓ Two tasks complete · 450+ transactions · This scales.");
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const released = txs.filter(t => t.status === "released");
  const withheld = txs.filter(t => t.status === "withheld");
  const totalUsdc = released.reduce((a, t) => a + t.amount, 0);

  const edgeC = k => edgeState[k]?.c || C.border2;
  const edgeO = k => edgeState[k]?.o ?? 0.28;
  const edgeW = k => edgeState[k]?.w ?? 1;
  const edgeDash = k => edgeState[k]?.dash || "none";

  const nodeColor = id => {
    const s = nodeState[id];
    const base = NODES[id]?.color;
    if (s === "failed") return C.red;
    if (s === "replacement") return C.purple;
    return base;
  };
  const nodeGlow = id => {
    const s = nodeState[id];
    if (s === "failed") return `drop-shadow(0 0 12px ${C.red})`;
    if (s === "replacement") return `drop-shadow(0 0 12px ${C.purple})`;
    if (s === "active") return `drop-shadow(0 0 10px ${NODES[id]?.color})`;
    return "none";
  };
  const nodeFillO = id => {
    const s = nodeState[id];
    if (s === "active" || s === "replacement") return 0.32;
    if (s === "failed") return 0.28;
    return 0.12;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Sora', sans-serif", background: C.bg, color: C.text, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <style>{GLOBAL_STYLE}</style>

      {/* Subtle scanline overlay */}
      <div style={{ position:"absolute",inset:0,pointerEvents:"none",background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)",zIndex:0 }} />

      {/* ── Header ── */}
      <div style={{ position:"relative",zIndex:1, padding:"12px 24px", borderBottom:`1px solid ${C.border}`, background:C.surface, display:"flex", alignItems:"center", gap:20, flexShrink:0 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800, letterSpacing:"-0.03em", lineHeight:1 }}>
            <span style={{ color:C.violet }}>Arc</span><span style={{ color:C.green }}>Reflex</span>
          </div>
          <div style={{ fontSize:9, letterSpacing:"0.12em", color:C.muted, textTransform:"uppercase", marginTop:3, fontFamily:"'JetBrains Mono', monospace" }}>
            Autonomous Economic Nervous System
          </div>
        </div>
        <div style={{ flex:1 }} />

        {/* Live stat pills */}
        {[
          { label:"TXS", v: txs.length, c: C.violet },
          { label:"SETTLED", v:`$${totalUsdc.toFixed(4)}`, c: C.green },
          { label:"WITHHELD", v: withheld.length, c: C.red },
          { label:"vs ETH GAS", v: txs.length ? "2,120,000×" : "—", c: C.amber },
        ].map(s => (
          <div key={s.label} style={{ textAlign:"right", minWidth:72 }}>
            <div style={{ fontSize:17, fontWeight:700, color:s.c, lineHeight:1, fontFamily:"'JetBrains Mono', monospace" }}>{s.v}</div>
            <div style={{ fontSize:8, color:C.muted, letterSpacing:"0.1em", marginTop:2, textTransform:"uppercase" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Status bar ── */}
      <div style={{ position:"relative",zIndex:1, padding:"7px 24px", background:"#07071A", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <div style={{
          width:7, height:7, borderRadius:"50%", flexShrink:0,
          background: phase==="running" ? C.green : phase==="complete" ? C.purple : C.dim,
          boxShadow: phase==="running" ? `0 0 10px ${C.green}` : "none",
          animation: phase==="running" ? "blink 1s ease-in-out infinite" : "none",
        }} />
        <div style={{ fontSize:11, color:C.muted, flex:1, fontFamily:"'JetBrains Mono', monospace" }}>{status}</div>
        {switched && (
          <div style={{ fontSize:10, padding:"2px 10px", borderRadius:3, background:"#1A0510", border:`1px solid ${C.red}`, color:C.red, fontFamily:"'JetBrains Mono', monospace" }}>
            FILTER_A SLASHED −10%
          </div>
        )}
        {usyc && (
          <div style={{ fontSize:10, padding:"2px 10px", borderRadius:3, background:"#041A0A", border:`1px solid ${C.green}`, color:C.green, fontFamily:"'JetBrains Mono', monospace" }}>
            USYC YIELD +${usyc.toFixed(7)}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative", zIndex:1 }}>

        {/* ── Left: Graph + tabs ── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", borderRight:`1px solid ${C.border}`, overflow:"hidden" }}>

          {/* Tabs */}
          <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, background:C.surface, flexShrink:0 }}>
            {["graph","economy","report"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding:"10px 20px", fontSize:11, fontWeight:600, letterSpacing:"0.08em",
                textTransform:"uppercase", background:"none", border:"none", cursor:"pointer",
                color: tab===t ? C.violet : C.muted,
                borderBottom: tab===t ? `2px solid ${C.violet}` : "2px solid transparent",
                marginBottom:-1, fontFamily:"'JetBrains Mono', monospace",
              }}>
                {t}
              </button>
            ))}
          </div>

          {/* ── GRAPH TAB ── */}
          {tab==="graph" && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", padding:"16px 20px 12px" }}>
              <svg viewBox="0 0 750 470" style={{ flex:1, maxHeight:400, width:"100%" }}>
                <defs>
                  <filter id="glow-sm">
                    <feGaussianBlur stdDeviation="3" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                  <filter id="glow-lg">
                    <feGaussianBlur stdDeviation="8" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                  <radialGradient id="bgGrad" cx="50%" cy="40%" r="60%">
                    <stop offset="0%" stopColor="#0D0D28" />
                    <stop offset="100%" stopColor="#05050D" />
                  </radialGradient>
                </defs>

                {/* Background */}
                <rect width="750" height="470" fill="url(#bgGrad)" rx="8" />
                {/* Grid */}
                {[...Array(8)].map((_,i) => <line key={`gh${i}`} x1={0} y1={i*60} x2={750} y2={i*60} stroke={C.border} strokeWidth={0.5} strokeOpacity={0.4}/>)}
                {[...Array(13)].map((_,i) => <line key={`gv${i}`} x1={i*62} y1={0} x2={i*62} y2={470} stroke={C.border} strokeWidth={0.5} strokeOpacity={0.4}/>)}

                {/* Edges */}
                {EDGES.map(([f,t]) => {
                  const fn = NODES[f], tn = NODES[t];
                  const k = `${f}-${t}`;
                  return (
                    <line key={k} id={`edge-${k}`}
                      x1={fn.x} y1={fn.y} x2={tn.x} y2={tn.y}
                      stroke={edgeC(k)} strokeWidth={edgeW(k)}
                      strokeOpacity={edgeO(k)} strokeDasharray={edgeDash(k)}
                    />
                  );
                })}

                {/* Pulses */}
                {pulses.map(p => {
                  const fn = NODES[p.from], tn = NODES[p.to];
                  if (!fn || !tn) return null;
                  return (
                    <circle key={p.id} r={4} fill={p.color} opacity={0.95} filter="url(#glow-sm)">
                      <animateMotion dur="0.65s" fill="remove"
                        path={`M${fn.x},${fn.y} L${tn.x},${tn.y}`} />
                    </circle>
                  );
                })}

                {/* Nodes */}
                {Object.entries(NODES).map(([id, pos]) => {
                  const c = nodeColor(id);
                  const fo = nodeFillO(id);
                  const glow = nodeGlow(id);
                  const s = nodeState[id];
                  const isActive = s === "active" || s === "replacement";
                  const repDisplay = s === "failed" ? Math.max(10, (pos.rep||0) - 15) : pos.rep;
                  return (
                    <g key={id} style={{ cursor:"default" }}>
                      {/* Aura */}
                      {isActive && <circle cx={pos.x} cy={pos.y} r={42} fill={c} fillOpacity={0.05}/>}
                      {/* Node body */}
                      <circle cx={pos.x} cy={pos.y} r={28}
                        fill={c} fillOpacity={fo}
                        stroke={c} strokeWidth={1.5} strokeOpacity={0.8}
                        style={{ filter:glow }}
                      />
                      {/* Label */}
                      {pos.label.split(" ").map((w,i,a) => (
                        <text key={w} x={pos.x} y={pos.y + (a.length===1 ? 0 : i===0 ? -7 : 7)}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={9.5} fontWeight={600} fill={c} fontFamily="'Sora', sans-serif"
                          style={{ userSelect:"none" }}>
                          {w}
                        </text>
                      ))}
                      {/* Reputation */}
                      {pos.rep !== null && (
                        <text x={pos.x} y={pos.y + 20} textAnchor="middle"
                          fontSize={8} fill={s==="failed" ? C.red : C.muted}
                          fontFamily="'JetBrains Mono', monospace"
                          style={{ userSelect:"none" }}>
                          rep:{repDisplay}
                        </text>
                      )}
                      {/* Status badge */}
                      {s === "failed" && (
                        <text x={pos.x} y={pos.y - 36} textAnchor="middle"
                          fontSize={8} fill={C.red} fontWeight={700}
                          fontFamily="'JetBrains Mono', monospace"
                          style={{ userSelect:"none" }}>
                          SLASHED
                        </text>
                      )}
                      {s === "replacement" && (
                        <text x={pos.x} y={pos.y - 36} textAnchor="middle"
                          fontSize={8} fill={C.purple} fontWeight={700}
                          fontFamily="'JetBrains Mono', monospace"
                          style={{ userSelect:"none" }}>
                          BACKUP ACTIVE
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Legend */}
                <g transform="translate(16, 445)">
                  {[[C.green,"Payment released"],[C.red,"Payment withheld"],[C.purple,"Re-routed (new auction)"],[C.blue,"Quality oracle score"]].map(([c,l],i)=>(
                    <g key={l} transform={`translate(${i*172},0)`}>
                      <circle cx={5} cy={5} r={3.5} fill={c} />
                      <text x={13} y={9} fontSize={8.5} fill={C.muted} fontFamily="'JetBrains Mono', monospace">{l}</text>
                    </g>
                  ))}
                </g>
              </svg>

              {/* CTAs */}
              <div style={{ display:"flex", gap:10, justifyContent:"center", marginTop:8, flexShrink:0 }}>
                {phase === "running" ? (
                  <div style={{ padding:"10px 28px", borderRadius:6, background:C.card, border:`1px solid ${C.border2}`, color:C.muted, fontSize:13, fontFamily:"'JetBrains Mono', monospace" }}>
                    ECONOMY RUNNING…
                  </div>
                ) : (
                  <button onClick={run} style={{
                    padding:"10px 32px", borderRadius:6, background:`linear-gradient(135deg, #6D28D9, #4338CA)`,
                    color:"#fff", fontWeight:700, fontSize:13, border:"none", cursor:"pointer",
                    boxShadow:`0 4px 28px rgba(109,40,217,0.35)`, letterSpacing:"0.04em",
                    fontFamily:"'JetBrains Mono', monospace",
                  }}>
                    {phase === "complete" ? "▶ RUN AGAIN" : "▶ SUBMIT TASK"}
                  </button>
                )}
                {phase === "complete" && !concurrent && (
                  <button onClick={runConcurrent} style={{
                    padding:"10px 24px", borderRadius:6, background:"#041A0A",
                    border:`1px solid ${C.green}`, color:C.green, fontWeight:700, fontSize:13,
                    cursor:"pointer", fontFamily:"'JetBrains Mono', monospace", letterSpacing:"0.04em",
                  }}>
                    ⚡ FIRE 2 CONCURRENT
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── ECONOMY TAB ── */}
          {tab==="economy" && (
            <div style={{ flex:1, overflowY:"auto", padding:24 }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Gas Cost — 225 Transactions</div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:28, fontFamily:"'JetBrains Mono', monospace" }}>
                Actual value of work delivered: $0.025
              </div>

              {/* Bar chart */}
              <div style={{ display:"flex", alignItems:"flex-end", gap:20, height:220, marginBottom:8, padding:"0 12px" }}>
                {GAS.map(d => (
                  <div key={d.n} style={{ display:"flex", flexDirection:"column", alignItems:"center", flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:d.c, marginBottom:6, fontFamily:"'JetBrains Mono', monospace" }}>
                      {d.v < 0.001 ? `$${d.v.toFixed(6)}` : `$${d.v.toFixed(2)}`}
                    </div>
                    <div style={{
                      width:"80%", maxWidth:60, height:d.bar, background:d.c,
                      borderRadius:"4px 4px 0 0", opacity:0.8,
                      boxShadow:`0 0 16px ${d.c}44`, minHeight:2,
                    }} />
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:20, padding:"0 12px", borderTop:`1px solid ${C.border}`, paddingTop:8 }}>
                {GAS.map(d => (
                  <div key={d.n} style={{ flex:1, textAlign:"center", fontSize:9.5, color:d.c, fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>{d.n}</div>
                ))}
              </div>

              {/* Callout boxes */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:28 }}>
                {[
                  { label:"Ethereum L1", sub:"19,080× overhead", val:"$477.00", c:C.red, bg:"#150507" },
                  { label:"Arc + Nanopayments", sub:"0.009× ratio ✓", val:"$0.000225", c:C.green, bg:"#030F07" },
                ].map(b => (
                  <div key={b.label} style={{ padding:16, borderRadius:8, background:b.bg, border:`1px solid ${b.c}33` }}>
                    <div style={{ fontSize:11, color:b.c, fontWeight:600, marginBottom:4 }}>{b.label}</div>
                    <div style={{ fontSize:22, color:b.c, fontWeight:800, fontFamily:"'JetBrains Mono', monospace" }}>{b.val}</div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>{b.sub}</div>
                  </div>
                ))}
              </div>

              {/* Agent margins */}
              <div style={{ marginTop:24, padding:20, background:C.card, borderRadius:8, border:`1px solid ${C.border2}` }}>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:16, color:C.text }}>Agent Revenue This Task</div>
                {[
                  { name:"Search A",         earned:0.005,  color:C.green },
                  { name:"Filter A (active)", earned:0.0150, color:C.amber },
                  { name:"Filter B (backup)", earned:0.006,  color:C.purple },
                  { name:"Quality Oracle",    earned:0.001,  color:C.blue },
                ].map(a => (
                  <div key={a.name} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
                    <div style={{ fontSize:11, color:C.muted, minWidth:130, fontFamily:"'JetBrains Mono', monospace" }}>{a.name}</div>
                    <div style={{ flex:1, height:5, background:"#111128", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ width:`${(a.earned/0.025)*100}%`, height:"100%", background:a.color, borderRadius:3, boxShadow:`0 0 8px ${a.color}88` }} />
                    </div>
                    <div style={{ fontSize:11, color:a.color, fontWeight:700, minWidth:54, textAlign:"right", fontFamily:"'JetBrains Mono', monospace" }}>
                      ${a.earned.toFixed(4)}
                    </div>
                  </div>
                ))}
              </div>

              {/* USYC explanation */}
              <div style={{ marginTop:16, padding:16, background:"#030F07", border:`1px solid ${C.green}33`, borderRadius:8 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.green, marginBottom:8 }}>USYC — Yield on Idle Capital</div>
                <div style={{ fontSize:11, color:C.muted, lineHeight:1.7 }}>
                  While the Orchestrator holds the task budget, it converts $0.09 to USYC. The yield per task is microscopic (~$0.0000021). The architectural principle is enormous: this agent grows its own treasury autonomously.
                </div>
              </div>
            </div>
          )}

          {/* ── REPORT TAB ── */}
          {tab==="report" && (
            <div style={{ flex:1, overflowY:"auto", padding:24 }}>
              {!report ? (
                <div style={{ color:C.muted, textAlign:"center", marginTop:100, fontSize:12, fontFamily:"'JetBrains Mono', monospace" }}>
                  Run a task first to generate the report.
                </div>
              ) : (
                <>
                  <div style={{ fontSize:16, fontWeight:800, marginBottom:12, color:C.purple, letterSpacing:"-0.02em" }}>
                    {report.title}
                  </div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:24 }}>
                    {[
                      [`${report.meta.sources} sources searched`, C.blue],
                      [`${report.meta.filtered} results filtered`, C.amber],
                      [`${report.meta.txCount} transactions`, C.purple],
                      [`$${report.meta.cost.toFixed(3)} total cost`, C.green],
                    ].map(([l,c]) => (
                      <div key={l} style={{ fontSize:10, padding:"3px 10px", borderRadius:4, background:C.card, border:`1px solid ${C.border2}`, color:c, fontFamily:"'JetBrains Mono', monospace" }}>{l}</div>
                    ))}
                  </div>
                  {report.sections.map((s,i) => (
                    <div key={i} style={{ marginBottom:16, padding:16, background:C.card, borderRadius:8, border:`1px solid ${C.border2}`, animation:"fadeInUp 0.3s ease-out" }}>
                      <div style={{ fontSize:12, fontWeight:700, color:C.purple, marginBottom:8 }}>{s.h}</div>
                      <div style={{ fontSize:12, color:C.muted, lineHeight:1.75 }}>{s.c}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Transaction feed ── */}
        <div style={{ width:310, display:"flex", flexDirection:"column", background:C.surface, flexShrink:0 }}>

          {/* Agent status */}
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
            <div style={{ fontSize:9, letterSpacing:"0.1em", color:C.muted, textTransform:"uppercase", marginBottom:10, fontFamily:"'JetBrains Mono', monospace" }}>
              Agent Status
            </div>
            {Object.entries(NODES).filter(([_,p]) => p.rep !== null).map(([id,pos]) => {
              const s = nodeState[id];
              const sc = s==="failed" ? C.red : s==="replacement" ? C.purple : s==="active" ? C.green : C.dim;
              const sl = s==="failed" ? "SLASHED" : s==="replacement" ? "BACKUP" : s==="active" ? "ACTIVE" : "STANDBY";
              const repD = s==="failed" ? Math.max(10,(pos.rep||0)-15) : pos.rep;
              return (
                <div key={id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:sc, flexShrink:0, boxShadow: s&&s!=="failed" ? `0 0 6px ${sc}` : "none" }} />
                  <div style={{ flex:1, fontSize:11, color:pos.color, fontWeight:500 }}>{pos.label}</div>
                  <div style={{ fontSize:9, color:sc, fontFamily:"'JetBrains Mono', monospace" }}>{sl}</div>
                  <div style={{ fontSize:9, color:C.muted, fontFamily:"'JetBrains Mono', monospace" }}>r:{repD}</div>
                </div>
              );
            })}
          </div>

          {/* Feed header */}
          <div style={{ padding:"10px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
            <div style={{ fontSize:9, letterSpacing:"0.1em", color:C.muted, textTransform:"uppercase", fontFamily:"'JetBrains Mono', monospace" }}>Live Transaction Feed</div>
            <div style={{ fontSize:10, color:C.violet, fontFamily:"'JetBrains Mono', monospace" }}>{txs.length}</div>
          </div>

          {/* Transactions */}
          <div style={{ flex:1, overflowY:"auto", fontFamily:"'JetBrains Mono', monospace" }}>
            {txs.length === 0 ? (
              <div style={{ padding:24, color:C.dim, fontSize:11, textAlign:"center" }}>Awaiting transactions…</div>
            ) : txs.map(t => (
              <div key={t.id} className="tx-row" style={{
                padding:"6px 14px", borderBottom:`1px solid ${C.border}`,
                display:"flex", gap:8, alignItems:"flex-start",
                background: t.status==="withheld" ? "#120306" : "transparent",
              }}>
                <div style={{ width:5, height:5, borderRadius:"50%", flexShrink:0, marginTop:3,
                  background: t.status==="released" ? C.green : C.red,
                  boxShadow: t.status==="released" ? `0 0 5px ${C.green}` : `0 0 5px ${C.red}`,
                }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:10, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {t.from} → {t.to}
                  </div>
                  <div style={{ fontSize:9, color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.memo}</div>
                </div>
                <div style={{ fontSize:10, fontWeight:600, flexShrink:0,
                  color: t.status==="released" ? C.green : C.red }}>
                  {t.status==="withheld" ? "WITHHELD" : `$${t.amount.toFixed(5)}`}
                </div>
              </div>
            ))}
          </div>

          {/* Footer stats */}
          <div style={{ padding:"10px 16px", borderTop:`1px solid ${C.border}`, background:C.card, flexShrink:0 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[
                { l:"Total gas cost", v:"$0.000225", c:C.green },
                { l:"ETH equivalent", v:"$477.00", c:C.red },
                { l:"Protocol margin", v:"~$0.003", c:C.purple },
                { l:"EIP-3009 auths", v:released.length, c:C.blue },
              ].map(s => (
                <div key={s.l}>
                  <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>{s.l}</div>
                  <div style={{ fontSize:12, color:s.c, fontWeight:700, marginTop:1 }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
