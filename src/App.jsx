import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchLive } from "./data.js";

/* ============================== MODEL ============================== */
const COLUMNS = [
  { id: "backlog", name: "Backlog", wip: 0, flow: false },
  { id: "todo", name: "To Do", wip: 0, flow: false },
  { id: "inprogress", name: "In Progress", wip: 2, flow: true },
  { id: "review", name: "Code Review", wip: 3, flow: true },
  { id: "testing", name: "QA / Testing", wip: 3, flow: true },
  { id: "done", name: "Done", wip: 0, flow: false },
];
const FLOW_COLS = ["inprogress", "review", "testing"];
const WAIT_COLS = ["review", "testing"]; // queue/wait stages (vs active work)
const ROLES = ["Backend", "Frontend", "Android", "iOS", "QA", "DevOps", "—"];
const PRIORITIES = [
  { id: "urgent", label: "Срочно", color: "#F0584F", rank: 0 },
  { id: "high", label: "Высокий", color: "#F0A93C", rank: 1 },
  { id: "medium", label: "Средний", color: "#4F9DF0", rank: 2 },
  { id: "low", label: "Низкий", color: "#5C6470", rank: 3 },
];
const ROLE_COLOR = { Backend: "#4F9DF0", Frontend: "#9A8CF5", Android: "#3FBF8F", iOS: "#E86A9A", QA: "#F0A93C", DevOps: "#E8714A", "—": "#7A7975" };
const DAY = 86400000;
const now = () => Date.now();
const ago = (n) => now() - n * DAY;
const daysIn = (ts) => Math.floor((now() - ts) / DAY);
const r1 = (n) => Math.round(n * 10) / 10;

/* Build a card with a realistic per-stage history so stage-time metrics work.
   stages = array like [["inprogress",3],["review",6],["testing",2]] meaning
   spent N days in each, ending in current `col`. */
function mk(id, title, role, col, assignee, prio, stagePlan, opts = {}) {
  const history = [];
  let t = ago(stagePlan.reduce((s, [, d]) => s + d, 0));
  const created = t - 4 * DAY;
  for (const [c, d] of stagePlan) {
    history.push({ col: c, at: t });
    t += d * DAY;
  }
  const enteredAt = history[history.length - 1].at;
  const startedAt = history.find((h) => FLOW_COLS.includes(h.col))?.at ?? null;
  const finishedAt = col === "done" ? enteredAt : null;
  return {
    id, title, role, col, assignee, priority: prio,
    createdAt: created, enteredAt, startedAt, finishedAt, history,
    due: opts.due ?? null, blocked: opts.blocked ?? null,
    subtasks: opts.subtasks ?? [], comments: opts.comments ?? [],
    deps: opts.deps ?? [], sprint: opts.sprint ?? null,
  };
}

const SPRINT = { id: "S-12", name: "Спринт 12 — Платежи и договоры", start: ago(7), end: ago(-7), goal: "Закрыть модуль платежей и раздел договоров", committed: 8 };

const SEED = [
  mk("DMS-46", "ТТН га пдф оркали отказиб олиш", "—", "backlog", "", "low", [["backlog", 6]]),
  mk("DMS-47", "С/Ф да багни тогирлаш", "—", "backlog", "", "medium", [["backlog", 6]]),
  mk("DMS-24", "Добавление контрагента", "—", "todo", "", "medium", [["backlog", 4], ["todo", 4]]),
  mk("DMS-14", "Согласование: технический баг", "Backend", "todo", "Shaxriyor", "high", [["todo", 3]]),
  mk("DMS-9", "Add Synchronization inside Document", "Frontend", "todo", "Oyatillo", "medium", [["todo", 4]]),
  mk("DMS-31", "Фильтр «Не запущен»", "Backend", "todo", "Oyatillo", "low", [["todo", 2]]),
  mk("DMS-6", "Re-design карточки документа", "Frontend", "inprogress", "Oyatillo", "high", [["todo", 1], ["inprogress", 2]],
    { due: ago(-2), sprint: "S-12", subtasks: [{ t: "Макет", done: true }, { t: "Вёрстка", done: false }, { t: "Адаптив", done: false }] }),
  mk("DMS-5", "Role based access control", "Backend", "review", "Shaxriyor", "urgent", [["inprogress", 2], ["review", 9]],
    { due: ago(1), sprint: "S-12", comments: [{ a: "ПМ", t: "Ждём ревью 9 дней — критично", at: ago(1) }] }),
  mk("DMS-52", "Платежи: отдельный раздел", "Backend", "review", "Shaxriyor", "high", [["inprogress", 3], ["review", 7]], { sprint: "S-12", deps: ["DMS-18"] }),
  mk("DMS-42", "Баг: не виден акцизный налог", "Backend", "review", "Shaxriyor", "high", [["inprogress", 2], ["review", 6]]),
  mk("DMS-18", "Платёжка (API)", "Backend", "review", "Shaxriyor", "medium", [["inprogress", 4], ["review", 11]], { sprint: "S-12", blocked: "Ждём решение по формату интеграции" }),
  mk("DMS-56", "Waybill PDF генерация", "Backend", "review", "Shaxriyor", "medium", [["inprogress", 2], ["review", 5]]),
  mk("DMS-40", "Исправление: просмотр документа", "Backend", "review", "Shaxriyor", "low", [["inprogress", 1], ["review", 4]]),
  mk("DMS-30", "Mobile API: контрагент/договор/платежи", "Backend", "review", "Shaxriyor", "high", [["inprogress", 3], ["review", 8]]),
  mk("DMS-17", "Раздел «Договор» (API)", "Backend", "review", "Shaxriyor", "medium", [["inprogress", 2], ["review", 10]], { sprint: "S-12" }),
  mk("DMS-16", "«Контрагент 2» в карточках", "Backend", "review", "Shaxriyor", "low", [["inprogress", 2], ["review", 7]]),
  mk("DMS-19", "Mobile DMS интеграция", "—", "review", "mironshox", "medium", [["inprogress", 2], ["review", 12]], { blocked: "Нет назначенного ревьюера" }),
  mk("DMS-13", "Fix free-form create", "Backend", "testing", "Shaxriyor", "medium", [["inprogress", 2], ["review", 2], ["testing", 5]]),
  mk("DMS-43", "Баг: не виден уровень риска в СФ", "Backend", "testing", "Shaxriyor", "high", [["inprogress", 1], ["review", 2], ["testing", 6]]),
  mk("DMS-4", "Didox интеграция", "Backend", "testing", "Shaxriyor", "urgent", [["inprogress", 3], ["review", 3], ["testing", 9]], { due: ago(2) }),
  mk("DMS-12", "Доп. статистика в Dashboard", "Backend", "testing", "Shaxriyor", "low", [["inprogress", 2], ["review", 1], ["testing", 4]]),
  mk("DMS-15", "deletedAt=null при регистрации", "Backend", "testing", "Shaxriyor", "medium", [["inprogress", 1], ["review", 2], ["testing", 7]]),
  mk("DMS-58", "Invoice Scoring", "—", "testing", "Oyatillo", "high", [["inprogress", 2], ["review", 1], ["testing", 3]]),
  mk("DMS-22", "Платёжка (Frontend)", "Frontend", "testing", "Oyatillo", "medium", [["inprogress", 2], ["review", 1], ["testing", 5]]),
  mk("DMS-34", "Script: permissions для роли", "Backend", "done", "Shaxriyor", "medium", [["inprogress", 2], ["review", 1], ["testing", 1], ["done", 1]]),
  mk("DMS-53", "API: данные о банке", "Backend", "done", "Shaxriyor", "low", [["inprogress", 1], ["review", 1], ["testing", 1], ["done", 1]]),
  mk("DMS-44", "Fix TTN bug", "Backend", "done", "Shaxriyor", "high", [["inprogress", 2], ["review", 2], ["testing", 2], ["done", 2]]),
  mk("DMS-21", "Раздел «Договор» (Frontend)", "Frontend", "done", "Oyatillo", "medium", [["inprogress", 2], ["review", 1], ["testing", 2], ["done", 2]], { deps: ["DMS-17"] }),
  mk("DMS-35", "Role & permissions UI", "Frontend", "done", "Oyatillo", "high", [["inprogress", 3], ["review", 2], ["testing", 2], ["done", 3]]),
  mk("DMS-55", "Contragent balance history", "Frontend", "done", "Oyatillo", "low", [["inprogress", 2], ["review", 1], ["testing", 1], ["done", 4]]),
  mk("DMS-41", "Check user permissions", "Frontend", "done", "Oyatillo", "medium", [["inprogress", 2], ["review", 2], ["testing", 1], ["done", 3]]),
  mk("DMS-57", "Fix sync documents", "Frontend", "done", "Oyatillo", "medium", [["inprogress", 1], ["review", 1], ["testing", 2], ["done", 2]]),
];

/* ============================== METRICS ENGINES ============================== */
function stageDays(card, stageId) {
  // total days a card spent in a given stage from history
  let sum = 0;
  for (let i = 0; i < card.history.length; i++) {
    const h = card.history[i];
    const end = i + 1 < card.history.length ? card.history[i + 1].at : now();
    if (h.col === stageId) sum += (end - h.at) / DAY;
  }
  return sum;
}

function computeMetrics(cards) {
  const done = cards.filter((c) => c.col === "done" && c.startedAt && c.finishedAt);
  const cycle = done.map((c) => Math.max(1, Math.round((c.finishedAt - c.startedAt) / DAY)));
  const lead = done.map((c) => Math.max(1, Math.round((c.finishedAt - c.createdAt) / DAY)));
  const avg = (a) => (a.length ? r1(a.reduce((s, x) => s + x, 0) / a.length) : 0);
  const p = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
  const throughput = cards.filter((c) => c.col === "done" && c.finishedAt && c.finishedAt > ago(7)).length;
  const wip = cards.filter((c) => FLOW_COLS.includes(c.col)).length;
  const tpDay = throughput / 7;
  const forecast = tpDay > 0 ? r1(wip / tpDay) : null;

  // flow efficiency = active work time / total cycle time (wait stages count as wait)
  let activeSum = 0, totalSum = 0;
  done.forEach((c) => {
    const active = stageDays(c, "inprogress");
    const total = FLOW_COLS.reduce((s, st) => s + stageDays(c, st), 0);
    activeSum += active; totalSum += total;
  });
  const flowEff = totalSum > 0 ? Math.round((activeSum / totalSum) * 100) : 0;

  // per-stage average time (for done cards)
  const stageAvg = {};
  FLOW_COLS.forEach((st) => { stageAvg[st] = done.length ? r1(done.reduce((s, c) => s + stageDays(c, st), 0) / done.length) : 0; });

  return { avgCycle: avg(cycle), p50: p(cycle, 0.5), p85: p(cycle, 0.85), p95: p(cycle, 0.95), avgLead: avg(lead), throughput, wip, forecast, flowEff, stageAvg, doneCount: done.length };
}

function buildCFD(cards) {
  const days = 14, series = [];
  for (let d = days - 1; d >= 0; d--) {
    const t = now() - d * DAY;
    const counts = {}; COLUMNS.forEach((c) => (counts[c.id] = 0));
    cards.forEach((card) => {
      if (card.createdAt > t) return;
      let colAt = card.history[0]?.col;
      for (const h of card.history) if (h.at <= t) colAt = h.col;
      if (colAt === "done" && card.finishedAt && card.finishedAt > t) colAt = "testing";
      if (colAt) counts[colAt]++;
    });
    series.push({ t, counts, label: new Date(t).toLocaleDateString("ru", { day: "numeric", month: "short" }) });
  }
  return series;
}

function cycleScatter(cards) {
  return cards.filter((c) => c.col === "done" && c.startedAt && c.finishedAt)
    .map((c) => ({ id: c.id, role: c.role, x: c.finishedAt, y: Math.max(1, Math.round((c.finishedAt - c.startedAt) / DAY)) }))
    .sort((a, b) => a.x - b.x);
}

function throughputTrend(cards) {
  const weeks = [];
  for (let w = 3; w >= 0; w--) {
    const start = now() - (w + 1) * 7 * DAY, end = now() - w * 7 * DAY;
    weeks.push({ label: w === 0 ? "Эта" : `-${w}н`, n: cards.filter((c) => c.col === "done" && c.finishedAt && c.finishedAt > start && c.finishedAt <= end).length });
  }
  return weeks;
}

function agingData(cards) {
  // WIP items: age in current stage, grouped by stage
  return cards.filter((c) => FLOW_COLS.includes(c.col)).map((c) => ({
    id: c.id, col: c.col, age: daysIn(c.enteredAt), assignee: c.assignee, title: c.title, blocked: !!c.blocked,
  })).sort((a, b) => b.age - a.age);
}

/* ============================== THEME ============================== */
const T = {
  bg: "#0B0E13", panel: "#13171F", panel2: "#1A1F29", panel3: "#222835",
  line: "#242B38", line2: "#323B4C", txt: "#EAEDF2", txt2: "#959DAC", txt3: "#5C6470",
  accent: "#4F9DF0", accent2: "#7B5CF0", danger: "#F0584F", warn: "#F0A93C", ok: "#3FBF8F",
  dangerBg: "#22151A", warnBg: "#221C13", okBg: "#10211C", accentBg: "#101F33",
};
const mono = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const sans = "'Inter',-apple-system,system-ui,sans-serif";
const ease = "cubic-bezier(0.22,0.61,0.36,1)";
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
.fd *{box-sizing:border-box}
.fd ::-webkit-scrollbar{height:8px;width:8px}.fd ::-webkit-scrollbar-thumb{background:#2A3240;border-radius:4px}.fd ::-webkit-scrollbar-track{background:transparent}
@keyframes fdIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes fdPop{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}
@keyframes fdFade{from{opacity:0}to{opacity:1}}
@keyframes fdBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.fd-card{animation:fdIn .26s ${ease} both;transition:transform .14s ${ease},border-color .14s ${ease}}
.fd-card:hover{border-color:#3A4456 !important;transform:translateY(-1px)}
.fd-modal{animation:fdPop .2s ${ease} both}.fd-overlay{animation:fdFade .16s ease both}.fd-tabpane{animation:fdIn .24s ${ease} both}
.fd-btn{transition:filter .14s,transform .1s}.fd-btn:hover{filter:brightness(1.13)}.fd-btn:active{transform:scale(0.97)}
.fd-col{transition:background .18s ${ease},border-color .18s ${ease}}.fd-col.drop{background:#16202E !important;border-color:#4F9DF0 !important}
.fd-bar-fill{transform-origin:left;animation:fdBar .5s ${ease} both}
.fd-kpi{transition:transform .14s ${ease},border-color .14s}.fd-kpi:hover{transform:translateY(-2px);border-color:#3A4456}
.fd-row:hover{background:#161B24}
.fd input,.fd select,.fd textarea{outline:none}.fd input:focus,.fd select:focus,.fd textarea:focus{border-color:#4F9DF0 !important}
`;
const ST = {
  sel: { padding: "6px 9px", borderRadius: 7, background: T.panel2, color: T.txt, border: `1px solid ${T.line}`, fontSize: 12, fontFamily: sans },
};

/* ============================== ROOT ============================== */
export default function App() {
  const [cards, setCards] = useState(null);
  const [tab, setTab] = useState("board");
  const [q, setQ] = useState("");
  const [fRole, setFRole] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [fPrio, setFPrio] = useState("all");
  const [swim, setSwim] = useState("none");
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState(null);
  const [dropCol, setDropCol] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [help, setHelp] = useState(false);
  const [serverMetrics, setServerMetrics] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [waking, setWaking] = useState(false);
  const qRef = useRef(null);

  const loadLive = useCallback(async () => {
    try {
      setLoadErr(null);
      const { cards: c, serverMetrics: sm, lastSync: ls } = await fetchLive();
      setCards(c); setServerMetrics(sm); setLastSync(ls); setWaking(false);
    } catch (e) {
      setLoadErr(e.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (!loaded) setWaking(true); }, 3000);
    loadLive();
    const iv = setInterval(loadLive, 120000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [loadLive, loaded]);

  // edits are local-only (server is read-only); reset on next sync
  const persist = useCallback((next) => { setCards(next); }, []);

  useEffect(() => {
    const h = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) { if (e.key === "Escape") e.target.blur(); return; }
      if (e.key === "c" || e.key === "С") { e.preventDefault(); setAdding(true); }
      else if (e.key === "/") { e.preventDefault(); setTab("board"); setTimeout(() => qRef.current?.focus(), 50); }
      else if (e.key === "?") setHelp((v) => !v);
      else if (e.key === "x" || e.key === "ч") setCompact((v) => !v);
      else if (e.key === "Escape") { setOpen(null); setAdding(false); setHelp(false); }
      else if (e.key === "1") setTab("board");
      else if (e.key === "2") setTab("metrics");
      else if (e.key === "3") setTab("people");
      else if (e.key === "4") setTab("trends");
      else if (e.key === "5") setTab("mine");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!loaded || !cards) {
    const msg = waking ? "Сервер просыпается (~30 сек)…" : "Загрузка живых данных из Jira…";
    if (loadErr && !cards) return <div style={{ padding: 40, fontFamily: sans, background: T.bg, color: T.txt2, borderRadius: 14, textAlign: "center" }}><div style={{ color: T.danger, marginBottom: 12 }}>Ошибка связи: {loadErr}</div><button onClick={loadLive} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.accent}`, background: "transparent", color: T.accent, cursor: "pointer", fontFamily: sans }}>Повторить</button></div>;
    return <div style={{ padding: 40, fontFamily: sans, background: T.bg, color: T.txt2, borderRadius: 14 }}>{msg}</div>;
  }

  const assignees = [...new Set(cards.map((c) => c.assignee).filter(Boolean))];
  const filtered = cards.filter((c) => {
    if (q && !(`${c.id} ${c.title} ${c.assignee}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (fRole !== "all" && c.role !== fRole) return false;
    if (fAssignee !== "all" && c.assignee !== fAssignee) return false;
    if (fPrio !== "all" && c.priority !== fPrio) return false;
    return true;
  });

  const update = (id, patch) => { const next = cards.map((c) => (c.id === id ? { ...c, ...patch } : c)); persist(next); if (open && open.id === id) setOpen({ ...open, ...patch }); };
  const move = (card, toCol) => {
    if (card.col === toCol) return;
    const patch = { col: toCol, enteredAt: now(), history: [...card.history, { col: toCol, at: now() }] };
    if (toCol === "inprogress" && !card.startedAt) patch.startedAt = now();
    if (toCol === "done") patch.finishedAt = now();
    update(card.id, patch);
  };
  const remove = (id) => { persist(cards.filter((c) => c.id !== id)); setOpen(null); };
  const create = (f) => {
    const n = cards.length + 1;
    const c = mk(`DMS-${200 + n}`, f.title, f.role, "backlog", f.assignee, f.priority, [["backlog", 0]], { due: f.due, deps: f.deps });
    persist([...cards, c]); setAdding(false);
  };

  // prefer metrics computed on the server (full history); fall back to local
  const m = serverMetrics
    ? { ...computeMetrics(cards), ...serverMetrics, stageAvg: serverMetrics.stageAvg || computeMetrics(cards).stageAvg }
    : computeMetrics(cards);

  return (
    <div className="fd" style={{ fontFamily: sans, background: T.bg, color: T.txt, minHeight: 620, borderRadius: 14, border: `1px solid ${T.line}`, overflow: "hidden", position: "relative" }}>
      <style>{STYLE}</style>
      {loadErr && <div style={{ padding: "8px 16px", background: T.dangerBg, color: T.danger, fontSize: 12.5, borderBottom: `1px solid ${T.danger}` }}>Связь с сервером потеряна: {loadErr}. Показаны последние данные. <button className="fd-btn" onClick={loadLive} style={{ marginLeft: 8, background: "transparent", border: `1px solid ${T.danger}`, color: T.danger, borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>Повторить</button></div>}
      <TopBar {...{ tab, setTab, onAdd: () => setAdding(true), m, onHelp: () => setHelp(true), lastSync }} />
      {tab === "board" && (
        <div className="fd-tabpane" key="board">
          <FilterBar {...{ q, setQ, qRef, fRole, setFRole, fAssignee, setFAssignee, fPrio, setFPrio, swim, setSwim, assignees, count: filtered.length, compact, setCompact }} />
          <Board {...{ cards: filtered, allCards: cards, swim, onMove: move, onOpen: setOpen, setDrag, drag, dropCol, setDropCol, compact }} />
        </div>
      )}
      {tab === "metrics" && <div className="fd-tabpane" key="metrics"><Metrics cards={cards} m={m} /></div>}
      {tab === "people" && <div className="fd-tabpane" key="people"><People cards={cards} m={m} /></div>}
      {tab === "trends" && <div className="fd-tabpane" key="trends"><Trends cards={cards} /></div>}
      {tab === "mine" && <div className="fd-tabpane" key="mine"><Mine /></div>}
      {open && <Modal card={open} allCards={cards} onClose={() => setOpen(null)} onUpdate={update} onRemove={remove} onMove={move} onOpenDep={(id) => { const d = cards.find((c) => c.id === id); if (d) setOpen(d); }} />}
      {adding && <AddModal allCards={cards} onClose={() => setAdding(false)} onCreate={create} />}
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  );
}

function TopBar({ tab, setTab, onAdd, m, onHelp, lastSync }) {
  const tabs = [["board", "Доска", "1"], ["metrics", "Метрики", "2"], ["people", "Нагрузка", "3"], ["trends", "Тренды", "4"], ["mine", "Мои задачи", "5"]];
  const syncTxt = lastSync ? new Date(lastSync).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }) : "—";
  return (
    <div style={{ borderBottom: `1px solid ${T.line}`, background: T.panel }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.3, display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, background: `linear-gradient(135deg,${T.accent},${T.accent2})`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>◆</span>
          FlowDesk <span style={{ color: T.txt3, fontWeight: 500 }}>· DMS</span>
          <span style={{ fontSize: 10, fontFamily: mono, color: T.ok, background: T.okBg, padding: "2px 7px", borderRadius: 5, marginLeft: 4 }}>● live · {syncTxt}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MiniStat label="WIP" value={m.wip} tone={m.wip > 8 ? "danger" : "default"} />
          <MiniStat label="Cycle" value={m.avgCycle + "д"} />
          <MiniStat label="Flow eff" value={m.flowEff + "%"} tone={m.flowEff < 40 ? "danger" : "ok"} />
          <MiniStat label="Tput" value={m.throughput} tone="ok" />
          <button className="fd-btn" onClick={onHelp} title="Горячие клавиши (?)" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.line2}`, background: "transparent", color: T.txt2, cursor: "pointer" }}>?</button>
        </div>
      </div>
      <div style={{ display: "flex", padding: "0 16px" }}>
        {tabs.map(([id, label, key]) => (
          <button key={id} className="fd-btn" onClick={() => setTab(id)} style={{ padding: "9px 0", marginRight: 18, border: "none", background: "transparent", cursor: "pointer", color: tab === id ? T.txt : T.txt3, fontWeight: 600, fontSize: 13, fontFamily: sans, borderBottom: tab === id ? `2px solid ${T.accent}` : "2px solid transparent", display: "flex", alignItems: "center", gap: 6 }}>{label}<span style={{ fontFamily: mono, fontSize: 10, color: T.txt3, border: `1px solid ${T.line}`, borderRadius: 4, padding: "0 4px" }}>{key}</span></button>
        ))}
      </div>
    </div>
  );
}
function MiniStat({ label, value, tone }) {
  const c = tone === "danger" ? T.danger : tone === "ok" ? T.ok : T.txt;
  return <div style={{ padding: "4px 11px", borderRadius: 8, background: T.bg, border: `1px solid ${T.line}`, textAlign: "center", minWidth: 56 }}><div style={{ fontSize: 9.5, color: T.txt3, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: mono, color: c }}>{value}</div></div>;
}
function FilterBar({ q, setQ, qRef, fRole, setFRole, fAssignee, setFAssignee, fPrio, setFPrio, swim, setSwim, assignees, count, compact, setCompact }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap", alignItems: "center", borderBottom: `1px solid ${T.line}`, background: T.bg }}>
      <input ref={qRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск… (/)" style={{ ...ST.sel, width: 160, cursor: "text" }} />
      <select value={fRole} onChange={(e) => setFRole(e.target.value)} style={{ ...ST.sel, cursor: "pointer" }}><option value="all">Все роли</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
      <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} style={{ ...ST.sel, cursor: "pointer" }}><option value="all">Все исполнители</option>{assignees.map((a) => <option key={a}>{a}</option>)}</select>
      <select value={fPrio} onChange={(e) => setFPrio(e.target.value)} style={{ ...ST.sel, cursor: "pointer" }}><option value="all">Все приоритеты</option>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
      <div style={{ width: 1, height: 22, background: T.line }} />
      <select value={swim} onChange={(e) => setSwim(e.target.value)} style={{ ...ST.sel, cursor: "pointer" }}><option value="none">Без группировки</option><option value="assignee">По исполнителю</option><option value="role">По роли</option><option value="priority">По приоритету</option></select>
      <button className="fd-btn" onClick={() => setCompact(!compact)} style={{ ...ST.sel, cursor: "pointer", color: compact ? T.accent : T.txt2, borderColor: compact ? T.accent : T.line }}>▤ Compact <span style={{ fontFamily: mono, fontSize: 10 }}>X</span></button>
      <span style={{ marginLeft: "auto", fontSize: 12, color: T.txt3, fontFamily: mono }}>{count} задач</span>
    </div>
  );
}

/* ============================== BOARD ============================== */
function Board({ cards, allCards, swim, onMove, onOpen, setDrag, drag, dropCol, setDropCol, compact }) {
  let groups;
  if (swim === "none") groups = [{ key: "__all", label: null, cards }];
  else {
    const map = {};
    cards.forEach((c) => { let k = swim === "assignee" ? (c.assignee || "Не назначено") : swim === "role" ? c.role : c.priority; (map[k] = map[k] || []).push(c); });
    groups = Object.entries(map).map(([key, cs]) => ({ key, label: swim === "priority" ? (PRIORITIES.find((p) => p.id === key)?.label || key) : key, cards: cs }));
    if (swim === "priority") groups.sort((a, b) => (PRIORITIES.find((p) => p.id === a.key)?.rank ?? 9) - (PRIORITIES.find((p) => p.id === b.key)?.rank ?? 9));
  }
  return (
    <div style={{ overflowX: "auto", padding: 14 }}>
      <div style={{ minWidth: 1060 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: 10, marginBottom: 8 }}>
          {COLUMNS.map((col) => {
            const n = cards.filter((c) => c.col === col.id).length;
            const over = col.wip > 0 && n > col.wip;
            const pct = col.wip > 0 ? Math.min(100, (n / col.wip) * 100) : 0;
            return (
              <div key={col.id} style={{ padding: "0 4px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: over ? T.danger : T.txt2, textTransform: "uppercase", letterSpacing: 0.4 }}>{col.name} <span style={{ fontFamily: mono, color: T.txt3 }}>{n}</span></span>
                  {col.wip > 0 && <span style={{ fontSize: 9.5, fontFamily: mono, padding: "2px 6px", borderRadius: 5, fontWeight: 700, background: over ? T.danger : T.line, color: over ? "#fff" : T.txt3 }}>{n}/{col.wip}</span>}
                </div>
                {col.wip > 0 && <div style={{ height: 3, background: T.line, borderRadius: 3, marginTop: 5, overflow: "hidden" }}><div className="fd-bar-fill" style={{ height: "100%", width: `${pct}%`, background: over ? T.danger : pct > 80 ? T.warn : T.ok, borderRadius: 3 }} /></div>}
              </div>
            );
          })}
        </div>
        {groups.map((g) => (
          <div key={g.key} style={{ marginBottom: g.label ? 6 : 0 }}>
            {g.label && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 4px 5px" }}><span style={{ fontSize: 10.5, fontWeight: 700, color: T.txt2, textTransform: "uppercase", letterSpacing: 0.5 }}>{g.label}</span><span style={{ fontSize: 10, fontFamily: mono, color: T.txt3 }}>{g.cards.length}</span><div style={{ flex: 1, height: 1, background: T.line }} /></div>}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: 10, alignItems: "start" }}>
              {COLUMNS.map((col) => {
                const items = g.cards.filter((c) => c.col === col.id);
                const totalInCol = cards.filter((c) => c.col === col.id).length;
                const over = col.wip > 0 && totalInCol > col.wip;
                const isDrop = dropCol === col.id + g.key;
                return (
                  <div key={col.id} className={`fd-col ${isDrop ? "drop" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setDropCol(col.id + g.key); }} onDragLeave={() => setDropCol(null)}
                    onDrop={() => { if (drag) { onMove(drag, col.id); setDrag(null); setDropCol(null); } }}
                    style={{ background: over ? T.dangerBg : T.panel, borderRadius: 9, padding: 7, minHeight: 56, border: `1px solid ${over ? "#3D2225" : T.line}` }}>
                    {items.map((c) => <Card key={c.id} card={c} allCards={allCards} onOpen={onOpen} setDrag={setDrag} compact={compact} />)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function Card({ card, allCards, onOpen, setDrag, compact }) {
  const prio = PRIORITIES.find((p) => p.id === card.priority);
  const d = daysIn(card.enteredAt);
  const aged = d >= 7 && !["done", "backlog", "todo"].includes(card.col);
  const overdue = card.due && card.due < now() && card.col !== "done";
  const subDone = card.subtasks.filter((s) => s.done).length;
  const depBlocked = card.deps.some((id) => { const dc = allCards.find((c) => c.id === id); return dc && dc.col !== "done"; });
  if (compact) return (
    <div className="fd-card" draggable onDragStart={() => setDrag(card)} onClick={() => onOpen(card)} style={{ background: T.panel2, borderRadius: 6, padding: "5px 8px", marginBottom: 4, cursor: "pointer", borderLeft: `3px solid ${ROLE_COLOR[card.role]}`, border: `1px solid ${card.blocked ? T.danger : T.line}`, display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: prio?.color, flexShrink: 0 }} />
      <span style={{ fontSize: 9.5, fontFamily: mono, color: T.txt3, flexShrink: 0 }}>{card.id.split("-")[1]}</span>
      <span style={{ fontSize: 11.5, color: T.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.title}</span>
      {card.assignee && <span style={{ marginLeft: "auto", flexShrink: 0 }}><Avatar name={card.assignee} size={14} /></span>}
      {aged && <span style={{ fontSize: 9, color: T.warn, fontFamily: mono, flexShrink: 0 }}>{d}д</span>}
    </div>
  );
  return (
    <div className="fd-card" draggable onDragStart={() => setDrag(card)} onClick={() => onOpen(card)} style={{ background: T.panel2, borderRadius: 7, padding: "8px 9px", marginBottom: 6, cursor: "pointer", border: `1px solid ${card.blocked ? T.danger : aged ? "#4A2F1A" : T.line}`, borderLeft: `3px solid ${ROLE_COLOR[card.role]}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontFamily: mono, color: T.txt3 }}>{card.id}</span>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: prio?.color }} title={prio?.label} />
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.35, color: T.txt, marginBottom: 7 }}>{card.title}</div>
      {card.blocked && <div style={{ fontSize: 10, color: T.danger, background: T.dangerBg, padding: "3px 6px", borderRadius: 4, marginBottom: 6 }}>⛔ {card.blocked}</div>}
      {!card.blocked && depBlocked && <div style={{ fontSize: 10, color: T.warn, background: T.warnBg, padding: "3px 6px", borderRadius: 4, marginBottom: 6 }}>⏳ ждёт {card.deps.join(", ")}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: ROLE_COLOR[card.role], textTransform: "uppercase", letterSpacing: 0.3 }}>{card.role}</span>
        {card.assignee ? <Avatar name={card.assignee} /> : <span style={{ fontSize: 9.5, color: T.danger }}>не назначен</span>}
        {card.subtasks.length > 0 && <span style={{ fontSize: 10, fontFamily: mono, color: subDone === card.subtasks.length ? T.ok : T.txt3 }}>☑{subDone}/{card.subtasks.length}</span>}
        {card.comments.length > 0 && <span style={{ fontSize: 10, color: T.txt3 }}>💬{card.comments.length}</span>}
        {card.sprint && <span style={{ fontSize: 9, fontFamily: mono, color: T.accent2, background: "#191433", padding: "1px 5px", borderRadius: 4 }}>{card.sprint}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>{overdue && <span style={{ fontSize: 9.5, color: T.danger }}>⚑</span>}{aged && <span style={{ fontSize: 9.5, color: T.warn, fontFamily: mono }}>{d}д</span>}</span>
      </div>
    </div>
  );
}
function Avatar({ name, size = 17 }) {
  const init = name.slice(0, 2).toUpperCase();
  const hue = [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 360;
  return <span style={{ width: size, height: size, borderRadius: "50%", background: `hsl(${hue},42%,44%)`, color: "#fff", fontSize: size * 0.42, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: sans, flexShrink: 0 }}>{init}</span>;
}

/* ============================== METRICS (10x) ============================== */
function Metrics({ cards, m }) {
  const cfd = useMemo(() => buildCFD(cards), [cards]);
  const scatter = useMemo(() => cycleScatter(cards), [cards]);
  const trend = useMemo(() => throughputTrend(cards), [cards]);
  const aging = useMemo(() => agingData(cards), [cards]);
  const stuck = aging.filter((a) => a.age >= 7);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(128px,1fr))", gap: 10, marginBottom: 14 }}>
        <Kpi label="Cycle time" value={m.avgCycle} unit="дн" hint="старт → done" />
        <Kpi label="p50 / медиана" value={m.p50} unit="дн" hint="половина быстрее" />
        <Kpi label="p85" value={m.p85} unit="дн" hint="обещать клиенту" warn />
        <Kpi label="p95" value={m.p95} unit="дн" hint="худший случай" warn />
        <Kpi label="Lead time" value={m.avgLead} unit="дн" hint="создание → done" />
        <Kpi label="Flow eff." value={m.flowEff} unit="%" hint="работа / ожидание" warn={m.flowEff < 40} />
        <Kpi label="Throughput" value={m.throughput} unit="/нед" ok />
        <Kpi label="WIP" value={m.wip} unit="" />
      </div>

      <Panel title="Flow efficiency — сколько времени задача реально в работе">
        <FlowEffBar pct={m.flowEff} />
        <p style={{ fontSize: 11.5, color: T.txt3, marginTop: 10, lineHeight: 1.55 }}>
          Из всего времени в потоке только <b style={{ color: m.flowEff < 40 ? T.danger : T.ok }}>{m.flowEff}%</b> задача реально дорабатывается — остальное лежит в очередях (Review, Testing). У здоровых команд 40%+. Низкий процент = проблема не в скорости работы, а в ожидании. Это прямое доказательство, что узкое место — очередь к проверке/тесту, а не «медленные разработчики».
        </p>
      </Panel>

      <Panel title="Разбивка cycle time по этапам — где задача проводит дни">
        <StageBreakdown stageAvg={m.stageAvg} />
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginBottom: 14 }}>
        <Panel title="Cumulative Flow — 14 дней"><CFD series={cfd} /><Legend /></Panel>
        <Panel title="Throughput по неделям"><TrendBars trend={trend} /></Panel>
      </div>

      <Panel title="Aging — возраст задач в работе (раннее предупреждение)">
        <AgingChart aging={aging} />
        <p style={{ fontSize: 11, color: T.txt3, marginTop: 8, lineHeight: 1.5 }}>Каждая точка — задача в работе. Чем правее, тем дольше висит. Точки в красной зоне (≥7д) надо разбирать первыми — они не двигаются.</p>
      </Panel>

      <Panel title="Cycle time — распределение и предсказуемость">
        <Scatter pts={scatter} avg={m.avgCycle} />
      </Panel>

      <Panel title="Где затор — задачи в работе по колонкам"><ColBars cards={cards} /></Panel>

      <Panel title="Прогноз и план — на основе данных">
        <Forecast m={m} stuck={stuck} cards={cards} />
        <button className="fd-btn" onClick={() => { const txt = `Метрики DMS: cycle ${m.avgCycle}д, p85 ${m.p85}д, flow efficiency ${m.flowEff}%, WIP ${m.wip}, throughput ${m.throughput}/нед, ${stuck.length} залежавшихся задач.`; navigator.clipboard?.writeText(txt); }} style={{ marginTop: 12, padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.accent}`, background: "transparent", color: T.accent, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: sans }}>Скопировать сводку метрик</button>
      </Panel>
    </div>
  );
}

function Kpi({ label, value, unit, hint, warn, ok }) {
  return <div className="fd-kpi" style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: T.txt3, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{label}</div><div style={{ display: "flex", alignItems: "baseline", gap: 4 }}><span style={{ fontSize: 24, fontWeight: 700, fontFamily: mono, color: warn ? T.warn : ok ? T.ok : T.txt }}>{value}</span><span style={{ fontSize: 12, color: T.txt3, fontFamily: mono }}>{unit}</span></div>{hint && <div style={{ fontSize: 10, color: T.txt3, marginTop: 3 }}>{hint}</div>}</div>;
}
function Panel({ title, children, right }) {
  return <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: 14, marginBottom: 14 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><span style={{ fontSize: 12, fontWeight: 700, color: T.txt2, textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</span>{right}</div>{children}</div>;
}
function cfdColor(i) { return ["#39414F", "#4C5870", "#4F9DF0", "#F0A93C", "#F0584F", "#3FBF8F"][i] || T.line; }
function Legend() { return <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>{COLUMNS.map((c, i) => <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.txt2 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: cfdColor(i) }} />{c.name}</span>)}</div>; }

function FlowEffBar({ pct }) {
  return (
    <div style={{ display: "flex", height: 30, borderRadius: 7, overflow: "hidden", background: T.bg }}>
      <div className="fd-bar-fill" style={{ width: `${pct}%`, background: pct < 40 ? T.danger : T.ok, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 40 }}><span style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: mono }}>{pct}% работа</span></div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 12, fontWeight: 700, color: T.txt2, fontFamily: mono }}>{100 - pct}% ожидание</span></div>
    </div>
  );
}
function StageBreakdown({ stageAvg }) {
  const stages = FLOW_COLS.map((id) => ({ id, name: COLUMNS.find((c) => c.id === id).name, v: stageAvg[id] || 0 }));
  const total = stages.reduce((s, x) => s + x.v, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 34, borderRadius: 7, overflow: "hidden", marginBottom: 12 }}>
        {stages.map((s, i) => (
          <div key={s.id} className="fd-bar-fill" title={`${s.name}: ${s.v}д`} style={{ width: `${(s.v / total) * 100}%`, background: cfdColor(COLUMNS.findIndex((c) => c.id === s.id)), display: "flex", alignItems: "center", justifyContent: "center", animationDelay: `${i * 0.1}s`, minWidth: 30 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: mono }}>{s.v}д</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        {stages.map((s) => {
          const wait = WAIT_COLS.includes(s.id);
          return <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.txt2 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: cfdColor(COLUMNS.findIndex((c) => c.id === s.id)) }} />{s.name} {wait && <span style={{ color: T.warn, fontSize: 10 }}>← очередь</span>}</div>;
        })}
      </div>
      <p style={{ fontSize: 11, color: T.txt3, marginTop: 10, lineHeight: 1.5 }}>Самый длинный сегмент = ваше узкое место. Если Review и Testing вместе занимают больше, чем In Progress — задачи больше ждут, чем делаются.</p>
    </div>
  );
}
function CFD({ series }) {
  const W = 520, H = 190, pad = 4;
  const max = Math.max(1, ...series.map((s) => Object.values(s.counts).reduce((a, b) => a + b, 0)));
  const order = ["done", "testing", "review", "inprogress", "todo", "backlog"];
  const cc = {}; COLUMNS.forEach((c, i) => (cc[c.id] = cfdColor(i)));
  const x = (i) => pad + (i * (W - 2 * pad)) / (series.length - 1);
  const y = (v) => H - pad - (v / max) * (H - 2 * pad);
  const bands = order.map((colId) => { const pts = series.map((s, i) => { let cum = 0; for (const oc of order) { cum += s.counts[oc] || 0; if (oc === colId) break; } return { x: x(i), yTop: y(cum), yBase: y(cum - (s.counts[colId] || 0)) }; }); return { colId, path: pts.map((p) => `${p.x},${p.yTop}`).join(" ") + " " + [...pts].reverse().map((p) => `${p.x},${p.yBase}`).join(" ") }; });
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>{bands.map((b) => <polygon key={b.colId} points={b.path} fill={cc[b.colId]} fillOpacity="0.88" stroke={cc[b.colId]} strokeWidth="0.5" />)}{series.map((s, i) => i % 3 === 0 && <text key={i} x={x(i)} y={H - 1} fontSize="8" fill={T.txt3} textAnchor="middle" fontFamily={mono}>{s.label}</text>)}</svg>;
}
function TrendBars({ trend }) {
  const max = Math.max(1, ...trend.map((t) => t.n));
  return <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 170, padding: "10px 0" }}>{trend.map((t, i) => <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}><span style={{ fontSize: 13, fontWeight: 700, fontFamily: mono, color: i === trend.length - 1 ? T.ok : T.txt2 }}>{t.n}</span><div className="fd-bar-fill" style={{ width: "100%", maxWidth: 48, height: `${(t.n / max) * 100}%`, minHeight: 4, background: i === trend.length - 1 ? `linear-gradient(${T.ok},#2D8F6A)` : T.accent, borderRadius: 6, animationDelay: `${i * 0.08}s` }} /><span style={{ fontSize: 9.5, color: T.txt3 }}>{t.label}</span></div>)}</div>;
}
function AgingChart({ aging }) {
  const W = 700, H = 150, pad = 28;
  if (!aging.length) return <div style={{ color: T.txt3, fontSize: 12.5, padding: 16 }}>Нет задач в работе</div>;
  const maxAge = Math.max(10, ...aging.map((a) => a.age));
  const stages = FLOW_COLS;
  const x = (age) => pad + (age / maxAge) * (W - 2 * pad);
  const yOf = (col) => pad + stages.indexOf(col) * ((H - 2 * pad) / Math.max(1, stages.length - 1));
  const warnX = x(7);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      <rect x={warnX} y={0} width={W - warnX} height={H} fill={T.danger} fillOpacity="0.06" />
      <line x1={warnX} y1={0} x2={warnX} y2={H} stroke={T.danger} strokeWidth="0.8" strokeDasharray="4 3" />
      <text x={warnX + 4} y={11} fontSize="8.5" fill={T.danger} fontFamily={mono}>7д — порог</text>
      {stages.map((s) => <text key={s} x={2} y={yOf(s) + 3} fontSize="8.5" fill={T.txt3} fontFamily={mono}>{COLUMNS.find((c) => c.id === s).name.slice(0, 8)}</text>)}
      {aging.map((a, i) => <circle key={i} cx={x(a.age)} cy={yOf(a.col)} r="5" fill={a.blocked ? T.danger : a.age >= 7 ? T.warn : T.accent} fillOpacity="0.85" stroke={T.bg} strokeWidth="1"><title>{a.id}: {a.age}д{a.blocked ? " (заблок.)" : ""}</title></circle>)}
    </svg>
  );
}
function Scatter({ pts, avg }) {
  const W = 700, H = 170, pad = 28;
  if (!pts.length) return <div style={{ color: T.txt3, fontSize: 12.5, padding: 20, textAlign: "center" }}>Нет завершённых задач</div>;
  const maxY = Math.max(5, ...pts.map((p) => p.y));
  const minX = pts[0].x, maxX = pts[pts.length - 1].x || minX + DAY;
  const x = (v) => pad + ((v - minX) / (maxX - minX || 1)) * (W - 2 * pad);
  const y = (v) => H - pad - (v / maxY) * (H - 2 * pad);
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>{[0, Math.round(maxY / 2), maxY].map((g) => <g key={g}><line x1={pad} y1={y(g)} x2={W - pad} y2={y(g)} stroke={T.line} strokeWidth="0.5" /><text x={2} y={y(g) + 3} fontSize="8" fill={T.txt3} fontFamily={mono}>{g}д</text></g>)}<line x1={pad} y1={y(avg)} x2={W - pad} y2={y(avg)} stroke={T.accent} strokeWidth="1" strokeDasharray="4 3" /><text x={W - pad} y={y(avg) - 4} fontSize="8.5" fill={T.accent} textAnchor="end" fontFamily={mono}>среднее {avg}д</text>{pts.map((p, i) => <circle key={i} cx={x(p.x)} cy={y(p.y)} r="4.5" fill={ROLE_COLOR[p.role]} fillOpacity="0.85" stroke={T.bg} strokeWidth="1"><title>{p.id}: {p.y}д</title></circle>)}</svg>;
}
function ColBars({ cards }) {
  const active = COLUMNS.filter((c) => c.id !== "done" && c.id !== "backlog");
  const max = Math.max(1, ...active.map((c) => cards.filter((k) => k.col === c.id).length));
  return <div>{active.map((c) => { const n = cards.filter((k) => k.col === c.id).length; const over = c.wip > 0 && n > c.wip; return <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}><span style={{ width: 100, fontSize: 12, color: T.txt2, textAlign: "right" }}>{c.name}</span><div style={{ flex: 1, background: T.bg, borderRadius: 5, height: 24, position: "relative", overflow: "hidden" }}><div className="fd-bar-fill" style={{ width: `${(n / max) * 100}%`, height: "100%", background: over ? T.danger : T.accent, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8, minWidth: 28 }}><span style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: mono }}>{n}</span></div>{c.wip > 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(c.wip / max) * 100}%`, width: 2, background: T.warn }} title={`Лимит ${c.wip}`} />}</div>{c.wip > 0 && <span style={{ fontSize: 10, fontFamily: mono, color: T.txt3, width: 56 }}>лимит {c.wip}</span>}</div>; })}</div>;
}
function Forecast({ m, stuck, cards }) {
  const items = [];
  if (m.forecast) items.push({ k: "ok", t: `При текущем темпе (${m.throughput}/нед) очередь из ${m.wip} задач в работе разгребётся за ~${m.forecast} дн. (закон Литтла).` });
  if (m.flowEff < 40) items.push({ k: "danger", t: `Flow efficiency ${m.flowEff}% — задачи ждут в 2+ раза дольше, чем делаются. Это не проблема скорости команды, а проблема очередей на проверке.` });
  if (m.p85 > m.avgCycle * 1.6) items.push({ k: "warn", t: `Большой разброс: среднее ${m.avgCycle}д, но p85 ${m.p85}д. Сроки непредсказуемы — клиенту обещайте по p85, не по среднему.` });
  if (stuck.length) items.push({ k: "warn", t: `${stuck.length} задач висят ≥7 дней. Начните разбор с самых старых — они почти наверняка чего-то ждут.` });
  if (!items.length) items.push({ k: "ok", t: "Поток здоров." });
  return <div>{items.map((it, i) => <div key={i} style={{ display: "flex", gap: 9, padding: "9px 11px", borderRadius: 8, marginBottom: 7, background: it.k === "danger" ? T.dangerBg : it.k === "warn" ? T.warnBg : T.okBg, animation: `fdIn .3s ${ease} ${i * 0.04}s both` }}><span style={{ color: it.k === "danger" ? T.danger : it.k === "warn" ? T.warn : T.ok, fontWeight: 700 }}>{it.k === "danger" ? "▲" : it.k === "warn" ? "●" : "✓"}</span><span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{it.t}</span></div>)}</div>;
}

/* ============================== PEOPLE + SOLUTIONS ============================== */
function People({ cards, m }) {
  const map = {};
  cards.filter((c) => c.col !== "done").forEach((c) => {
    const a = c.assignee || "Не назначено";
    map[a] = map[a] || { total: 0, urgent: 0, blocked: 0, byCol: {}, review: 0, testing: 0 };
    const o = map[a]; o.total++; o.byCol[c.col] = (o.byCol[c.col] || 0) + 1;
    if (c.priority === "urgent") o.urgent++;
    if (c.blocked) o.blocked++;
    if (c.col === "review") o.review++;
    if (c.col === "testing") o.testing++;
  });
  const arr = Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  const max = Math.max(1, ...arr.map((x) => x[1].total));
  const top = arr[0];

  // situational solutions
  const solutions = [];
  if (top && top[1].total >= 6) {
    solutions.push({
      sev: "danger", title: `${top[0]} перегружен — ${top[1].total} активных задач`,
      body: `Это узкое место потока. ${top[1].review > 0 ? `${top[1].review} из них висят в Code Review` : ""}${top[1].review > 0 && top[1].testing > 0 ? " и " : ""}${top[1].testing > 0 ? `${top[1].testing} в Testing` : ""}. Пока он не разгрузится, скорость всей команды ограничена им.`,
      steps: [
        "Сегодня: остановите назначение новых задач на него — пусть закрывает текущие.",
        "Введите взаимное ревью: пусть часть Code Review делают другие, а не один человек.",
        "Самые старые его задачи разберите вручную — узнайте, что блокирует каждую.",
      ],
    });
  }
  const unassigned = map["Не назначено"];
  if (unassigned) solutions.push({
    sev: "warn", title: `${unassigned.total} задач без исполнителя`,
    body: "Задача без ответственного не двигается — её никто не считает своей.",
    steps: ["Назначьте каждой задаче конкретного человека.", "Правило: задача без исполнителя не выходит из Backlog."],
  });
  if (m.flowEff < 40) solutions.push({
    sev: "danger", title: `Flow efficiency ${m.flowEff}% — задачи больше ждут, чем делаются`,
    body: "Основная потеря времени — очереди на проверке и тесте, а не сама разработка.",
    steps: [
      "Снизьте WIP-лимиты на Review и Testing, чтобы заставить закрывать очередь.",
      "Разработчик прогоняет базовый тест перед передачей в QA — меньше возвратов.",
      "Заведите чёткий Definition of Done, чтобы QA не тратил время на выяснения.",
    ],
  });
  if (!solutions.length) solutions.push({ sev: "ok", title: "Нагрузка сбалансирована", body: "Нет перегруженных людей, поток ровный.", steps: [] });

  return (
    <div style={{ padding: 16 }}>
      <Panel title="Нагрузка по людям — активные задачи">
        {arr.map(([name, d], i) => {
          const heavy = d.total >= 6;
          return (
            <div key={name} className="fd-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 6px", borderRadius: 7, borderBottom: `1px solid ${T.line}`, animation: `fdIn .3s ${ease} ${i * 0.04}s both` }}>
              <Avatar name={name === "Не назначено" ? "?" : name} size={30} />
              <div style={{ width: 116 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: 10.5, color: T.txt3 }}>{d.urgent > 0 && <span style={{ color: T.danger }}>{d.urgent} срочн. </span>}{d.blocked > 0 && <span style={{ color: T.warn }}>{d.blocked} блок.</span>}{!d.urgent && !d.blocked && "норма"}</div>
              </div>
              <div style={{ flex: 1, display: "flex", gap: 2, height: 26, borderRadius: 5, overflow: "hidden", background: T.bg }}>
                {COLUMNS.filter((c) => c.id !== "done").map((col) => { const n = d.byCol[col.id] || 0; if (!n) return null; const idx = COLUMNS.findIndex((c) => c.id === col.id); return <div key={col.id} className="fd-bar-fill" title={`${col.name}: ${n}`} style={{ width: `${(n / max) * 100}%`, background: cfdColor(idx), display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", fontFamily: mono }}>{n}</span></div>; })}
              </div>
              <span style={{ width: 70, textAlign: "right", fontSize: 13, fontWeight: 700, fontFamily: mono, color: heavy ? T.danger : T.txt2 }}>{d.total} {heavy && "⚠"}</span>
            </div>
          );
        })}
      </Panel>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.txt2, textTransform: "uppercase", letterSpacing: 0.4, margin: "4px 0 12px" }}>Решения по ситуации — что делать прямо сейчас</div>
      {solutions.map((s, i) => (
        <div key={i} style={{ background: T.panel, border: `1px solid ${T.line}`, borderLeft: `3px solid ${s.sev === "danger" ? T.danger : s.sev === "warn" ? T.warn : T.ok}`, borderRadius: 10, padding: 14, marginBottom: 12, animation: `fdIn .3s ${ease} ${i * 0.05}s both` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: s.sev === "danger" ? T.danger : s.sev === "warn" ? T.warn : T.ok, fontWeight: 700 }}>{s.sev === "danger" ? "▲" : s.sev === "warn" ? "●" : "✓"}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{s.title}</span>
          </div>
          <div style={{ fontSize: 12.5, color: T.txt2, lineHeight: 1.55, marginBottom: s.steps.length ? 10 : 0, paddingLeft: 22 }}>{s.body}</div>
          {s.steps.map((st, j) => (
            <div key={j} style={{ display: "flex", gap: 9, paddingLeft: 22, marginBottom: 6, alignItems: "flex-start" }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, background: T.panel3, color: T.txt2, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, flexShrink: 0 }}>{j + 1}</span>
              <span style={{ fontSize: 12.5, color: T.txt, lineHeight: 1.5 }}>{st}</span>
            </div>
          ))}
        </div>
      ))}

      <Panel title="Мини-роадмеп расшивки — порядок действий">
        <Roadmap />
      </Panel>
    </div>
  );
}
function Roadmap() {
  const phases = [
    { when: "Сегодня", color: T.danger, items: ["Заморозить новые задачи в In Progress", "Разобрать все блокеры — назначить ответственного за каждый"] },
    { when: "Эта неделя", color: T.warn, items: ["Вся команда дочищает Review и Testing до ≤3", "Ввести взаимное ревью — снять зависимость от одного человека", "Назначить исполнителей всем задачам без них"] },
    { when: "Следующая неделя", color: T.accent, items: ["Снизить WIP-лимиты до значений выше очищенной очереди", "Внедрить Definition of Done", "Ввести правило «не тащим в красный столбец»"] },
    { when: "Через месяц", color: T.ok, items: ["Разработчики прогоняют базовый тест перед QA", "Часть проверок автоматизировать (зона DevOps)", "Замерить, упал ли cycle time и вырос ли flow efficiency"] },
  ];
  return (
    <div>
      {phases.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: i < phases.length - 1 ? 14 : 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
            {i < phases.length - 1 && <span style={{ width: 2, flex: 1, background: T.line, marginTop: 3 }} />}
          </div>
          <div style={{ flex: 1, paddingBottom: 4 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: p.color, marginBottom: 6 }}>{p.when}</div>
            {p.items.map((it, j) => <div key={j} style={{ fontSize: 12.5, color: T.txt, lineHeight: 1.5, marginBottom: 4, paddingLeft: 2 }}>• {it}</div>)}
          </div>
        </div>
      ))}
    </div>
  );
}


/* ============================== MODALS ============================== */
function DepPicker({ value, options, onChange, selfId }) {
  const [show, setShow] = useState(false);
  const avail = options.filter((c) => c.id !== selfId && !value.includes(c.id));
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {value.length === 0 && <span style={{ fontSize: 11.5, color: T.txt3 }}>Нет зависимостей</span>}
        {value.map((id) => (
          <span key={id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: mono, background: T.panel3, padding: "3px 8px", borderRadius: 6, color: T.txt }}>
            ждёт {id}
            <span onClick={() => onChange(value.filter((x) => x !== id))} style={{ cursor: "pointer", color: T.txt3 }}>✕</span>
          </span>
        ))}
        <button className="fd-btn" onClick={() => setShow(!show)} style={{ ...ST.sel, cursor: "pointer", padding: "3px 9px", fontSize: 11 }}>+ зависимость</button>
      </div>
      {show && (
        <div style={{ maxHeight: 140, overflowY: "auto", border: `1px solid ${T.line}`, borderRadius: 7, background: T.panel2 }}>
          {avail.length === 0 && <div style={{ fontSize: 11.5, color: T.txt3, padding: 9 }}>Нет доступных задач</div>}
          {avail.map((c) => (
            <div key={c.id} className="fd-row" onClick={() => { onChange([...value, c.id]); setShow(false); }} style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontFamily: mono, color: T.txt3, fontSize: 10.5, marginRight: 7 }}>{c.id}</span>{c.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Modal({ card, allCards, onClose, onUpdate, onRemove, onMove, onOpenDep }) {
  const [comment, setComment] = useState("");
  const [sub, setSub] = useState("");
  const addComment = () => { if (!comment.trim()) return; onUpdate(card.id, { comments: [...card.comments, { a: "Я", t: comment.trim(), at: now() }] }); setComment(""); };
  const addSub = () => { if (!sub.trim()) return; onUpdate(card.id, { subtasks: [...card.subtasks, { t: sub.trim(), done: false }] }); setSub(""); };
  const toggleSub = (i) => onUpdate(card.id, { subtasks: card.subtasks.map((x, j) => j === i ? { ...x, done: !x.done } : x) });
  const sel = ST.sel;
  return (
    <Overlay onClose={onClose}>
      <div className="fd-modal" onClick={(e) => e.stopPropagation()} style={{ width: 580, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, background: T.panel, zIndex: 1 }}>
          <span style={{ fontFamily: mono, fontSize: 12, color: T.txt3 }}>{card.id}</span>
          <button className="fd-btn" onClick={onClose} style={{ background: "none", border: "none", color: T.txt3, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 16 }}>
          <input value={card.title} onChange={(e) => onUpdate(card.id, { title: e.target.value })} style={{ width: "100%", background: "transparent", border: "none", color: T.txt, fontSize: 17, fontWeight: 600, marginBottom: 14, fontFamily: sans }} />
          {card.blocked && <div style={{ background: T.dangerBg, border: `1px solid ${T.danger}`, borderRadius: 8, padding: "8px 11px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><span style={{ fontSize: 12.5, color: T.danger }}>⛔ {card.blocked}</span><button className="fd-btn" onClick={() => onUpdate(card.id, { blocked: null })} style={{ ...sel, cursor: "pointer", border: `1px solid ${T.danger}`, color: T.danger, background: "transparent" }}>Разблокировать</button></div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <Field label="Статус"><select value={card.col} onChange={(e) => onMove(card, e.target.value)} style={{ ...sel, width: "100%", cursor: "pointer" }}>{COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Приоритет"><select value={card.priority} onChange={(e) => onUpdate(card.id, { priority: e.target.value })} style={{ ...sel, width: "100%", cursor: "pointer" }}>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
            <Field label="Роль"><select value={card.role} onChange={(e) => onUpdate(card.id, { role: e.target.value })} style={{ ...sel, width: "100%", cursor: "pointer" }}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Исполнитель"><input value={card.assignee} onChange={(e) => onUpdate(card.id, { assignee: e.target.value })} placeholder="—" style={{ ...sel, width: "100%" }} /></Field>
          </div>
          <div style={{ marginBottom: 14 }}>
            <SectionLabel>Зависимости (каких задач ждёт)</SectionLabel>
            <DepPicker value={card.deps} options={allCards} selfId={card.id} onChange={(deps) => onUpdate(card.id, { deps })} />
          </div>
          <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 11.5, color: T.txt3, fontFamily: mono, flexWrap: "wrap" }}>
            <span>В колонке: <b style={{ color: daysIn(card.enteredAt) >= 7 ? T.danger : T.txt2 }}>{daysIn(card.enteredAt)}д</b></span>
            {card.startedAt && card.finishedAt && <span>Cycle: <b style={{ color: T.txt2 }}>{Math.max(1, Math.round((card.finishedAt - card.startedAt) / DAY))}д</b></span>}
            {card.due && <span>Срок: <b style={{ color: card.due < now() && card.col !== "done" ? T.danger : T.txt2 }}>{new Date(card.due).toLocaleDateString("ru")}</b></span>}
          </div>
          <div style={{ marginBottom: 16 }}>
            <SectionLabel>Подзадачи {card.subtasks.length > 0 && <span style={{ fontFamily: mono, color: T.txt3 }}>{card.subtasks.filter((s) => s.done).length}/{card.subtasks.length}</span>}</SectionLabel>
            {card.subtasks.map((s, i) => <div key={i} onClick={() => toggleSub(i)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}><span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${s.done ? T.ok : T.line2}`, background: s.done ? T.ok : "transparent", color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.done ? "✓" : ""}</span><span style={{ fontSize: 12.5, color: s.done ? T.txt3 : T.txt, textDecoration: s.done ? "line-through" : "none" }}>{s.t}</span></div>)}
            <input value={sub} onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()} placeholder="+ подзадача" style={{ ...sel, width: "100%", marginTop: 6 }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <SectionLabel>Комментарии</SectionLabel>
            {card.comments.map((c, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}><Avatar name={c.a} /><div><div style={{ fontSize: 11, color: T.txt3 }}>{c.a} · {new Date(c.at).toLocaleDateString("ru")}</div><div style={{ fontSize: 12.5, color: T.txt }}>{c.t}</div></div></div>)}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}><input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Написать комментарий…" style={{ ...sel, flex: 1 }} /><button className="fd-btn" onClick={addComment} style={{ ...sel, cursor: "pointer", background: T.accent, color: "#fff", border: "none", fontWeight: 600 }}>↵</button></div>
          </div>
          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 14, paddingTop: 12, display: "flex", gap: 8 }}>
            {!card.blocked && <button className="fd-btn" onClick={() => { const r = prompt("Причина блокировки:"); if (r) onUpdate(card.id, { blocked: r }); }} style={{ ...sel, cursor: "pointer", color: T.warn, border: `1px solid ${T.line2}` }}>⛔ Заблокировать</button>}
            <button className="fd-btn" onClick={() => { if (confirm("Удалить задачу?")) onRemove(card.id); }} style={{ ...sel, cursor: "pointer", color: T.danger, border: `1px solid ${T.line2}`, marginLeft: "auto" }}>Удалить</button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function AddModal({ allCards, onClose, onCreate }) {
  const [f, setF] = useState({ title: "", role: "Backend", assignee: "", priority: "medium", due: null, deps: [] });
  const sel = { padding: "8px 10px", borderRadius: 7, background: T.panel2, color: T.txt, border: `1px solid ${T.line}`, fontSize: 13, fontFamily: sans, width: "100%" };
  return (
    <Overlay onClose={onClose}>
      <div className="fd-modal" onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "94vw", background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Новая задача · DMS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Название задачи" style={sel} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} style={{ ...sel, cursor: "pointer" }}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
            <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} style={{ ...sel, cursor: "pointer" }}>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          </div>
          <input value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })} placeholder="Исполнитель" style={sel} />
          <input type="date" onChange={(e) => setF({ ...f, due: e.target.value ? new Date(e.target.value).getTime() : null })} style={sel} />
          <div><div style={{ fontSize: 10.5, color: T.txt3, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Зависит от задач</div><DepPicker value={f.deps} options={allCards} selfId={null} onChange={(deps) => setF({ ...f, deps })} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button className="fd-btn" onClick={onClose} style={{ ...sel, width: "auto", cursor: "pointer", color: T.txt2 }}>Отмена</button>
          <button className="fd-btn" onClick={() => f.title.trim() && onCreate(f)} style={{ ...sel, width: "auto", cursor: "pointer", background: T.accent, color: "#fff", border: "none", fontWeight: 600 }}>Создать</button>
        </div>
      </div>
    </Overlay>
  );
}

function HelpModal({ onClose }) {
  const keys = [["/", "Поиск"], ["1–5", "Переключить вкладки"], ["X", "Compact-режим"], ["?", "Эта справка"], ["Esc", "Закрыть"]];
  return <Overlay onClose={onClose}><div className="fd-modal" onClick={(e) => e.stopPropagation()} style={{ width: 360, background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 12, padding: 18 }}><div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Горячие клавиши</div>{keys.map(([k, label]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.line}` }}><span style={{ fontSize: 13, color: T.txt2 }}>{label}</span><span style={{ fontFamily: mono, fontSize: 11.5, color: T.txt, border: `1px solid ${T.line2}`, borderRadius: 5, padding: "2px 8px" }}>{k}</span></div>)}</div></Overlay>;
}
function Field({ label, children }) { return <div><div style={{ fontSize: 10.5, color: T.txt3, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>{label}</div>{children}</div>; }
function SectionLabel({ children }) { return <div style={{ fontSize: 11, fontWeight: 700, color: T.txt2, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>{children}</div>; }
function Overlay({ children, onClose }) { return <div className="fd-overlay" onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.66)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>{children}</div>; }

/* ============================== TRENDS (over time) ============================== */
function Trends({ cards }) {
  // weekly throughput (last 8 weeks) from done cards
  const weeks = useMemo(() => {
    const out = [];
    for (let w = 7; w >= 0; w--) {
      const start = now() - (w + 1) * 7 * DAY, end = now() - w * 7 * DAY;
      const doneThisWeek = cards.filter((c) => c.col === "done" && c.finishedAt && c.finishedAt > start && c.finishedAt <= end);
      const cycles = doneThisWeek.filter((c) => c.startedAt).map((c) => Math.max(1, Math.round((c.finishedAt - c.startedAt) / DAY)));
      const avgCycle = cycles.length ? r1(cycles.reduce((s, x) => s + x, 0) / cycles.length) : 0;
      out.push({ label: w === 0 ? "Эта нед." : `${w} нед. назад`, throughput: doneThisWeek.length, avgCycle });
    }
    return out;
  }, [cards]);

  const maxTp = Math.max(1, ...weeks.map((w) => w.throughput));
  const maxCy = Math.max(1, ...weeks.map((w) => w.avgCycle));

  return (
    <div style={{ padding: 16 }}>
      <Panel title="Throughput по неделям — сколько задач закрывали">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180, padding: "10px 0" }}>
          {weeks.map((w, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: mono, color: i === weeks.length - 1 ? T.ok : T.txt2 }}>{w.throughput}</span>
              <div className="fd-bar-fill" style={{ width: "100%", maxWidth: 40, height: `${(w.throughput / maxTp) * 100}%`, minHeight: 4, background: i === weeks.length - 1 ? `linear-gradient(${T.ok},#2D8F6A)` : T.accent, borderRadius: 6, animationDelay: `${i * 0.05}s` }} />
              <span style={{ fontSize: 8.5, color: T.txt3, textAlign: "center", lineHeight: 1.2 }}>{w.label}</span>
            </div>
          ))}
        </div>
        <Note>Растёт — команда ускоряется. Падает или ноль — поток встал (задачи не доходят до Done).</Note>
      </Panel>

      <Panel title="Cycle time по неделям — за сколько дней проходит задача">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180, padding: "10px 0" }}>
          {weeks.map((w, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: mono, color: w.avgCycle > 14 ? T.danger : T.txt2 }}>{w.avgCycle || "—"}</span>
              <div className="fd-bar-fill" style={{ width: "100%", maxWidth: 40, height: `${(w.avgCycle / maxCy) * 100}%`, minHeight: w.avgCycle ? 4 : 0, background: w.avgCycle > 14 ? T.danger : T.warn, borderRadius: 6, animationDelay: `${i * 0.05}s` }} />
              <span style={{ fontSize: 8.5, color: T.txt3, textAlign: "center", lineHeight: 1.2 }}>{w.label}</span>
            </div>
          ))}
        </div>
        <Note>Чем ниже столбик, тем быстрее проходят задачи. Если cycle time растёт неделя к неделе — затор усиливается.</Note>
      </Panel>

      <Panel title="Как читать тренды">
        <div style={{ fontSize: 12.5, color: T.txt2, lineHeight: 1.6 }}>
          Идеальная картина: throughput стабильный или растёт, cycle time падает. Тревога: throughput падает при растущем cycle time — значит задачи копятся и проходят всё медленнее. Это ранний сигнал, что узкое место (очередь к проверке) затягивает поток.
        </div>
      </Panel>
    </div>
  );
}

/* ============================== MINE (personal tasks, localStorage) ============================== */
const MINE_KEY = "flowdesk:mine";
function loadMine() {
  try { return JSON.parse(localStorage.getItem(MINE_KEY) || "[]"); } catch { return []; }
}
function saveMine(items) {
  try { localStorage.setItem(MINE_KEY, JSON.stringify(items)); } catch {}
}

function Mine() {
  const [items, setItems] = useState(loadMine);
  const [text, setText] = useState("");
  const [prio, setPrio] = useState("medium");
  const [filter, setFilter] = useState("active");

  useEffect(() => { saveMine(items); }, [items]);

  const add = () => {
    if (!text.trim()) return;
    setItems([{ id: Date.now(), text: text.trim(), prio, done: false, created: now() }, ...items]);
    setText("");
  };
  const toggle = (id) => setItems(items.map((i) => i.id === id ? { ...i, done: !i.done } : i));
  const del = (id) => setItems(items.filter((i) => i.id !== id));

  const shown = items.filter((i) => filter === "all" ? true : filter === "active" ? !i.done : i.done);
  const activeCount = items.filter((i) => !i.done).length;
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ background: T.accentBg, border: `1px solid ${T.line2}`, borderRadius: 11, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: T.txt2, lineHeight: 1.6 }}>
          📝 Твои личные задачи. Хранятся <b style={{ color: T.txt }}>только в этом браузере</b>, не связаны с Jira и не видны команде. Удобно для своих заметок, дел и напоминаний.
        </div>
      </div>

      <Panel title="Добавить задачу">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Что нужно сделать?" style={{ flex: 1, minWidth: 200, padding: "9px 12px", borderRadius: 8, background: T.panel2, color: T.txt, border: `1px solid ${T.line}`, fontSize: 13, fontFamily: sans, outline: "none" }} />
          <select value={prio} onChange={(e) => setPrio(e.target.value)} style={{ padding: "9px 10px", borderRadius: 8, background: T.panel2, color: T.txt, border: `1px solid ${T.line}`, fontSize: 13, fontFamily: sans, cursor: "pointer" }}>
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button className="fd-btn" onClick={add} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: `linear-gradient(135deg,${T.accent},${T.accent2})`, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: sans }}>Добавить</button>
        </div>
      </Panel>

      <Panel title={`Список (${activeCount} активных, ${doneCount} готово)`} right={
        <div style={{ display: "flex", gap: 4 }}>
          {[["active", "Активные"], ["done", "Готово"], ["all", "Все"]].map(([id, label]) => (
            <button key={id} className="fd-btn" onClick={() => setFilter(id)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${filter === id ? T.accent : T.line2}`, background: "transparent", color: filter === id ? T.accent : T.txt3, fontSize: 11.5, cursor: "pointer", fontFamily: sans }}>{label}</button>
          ))}
        </div>
      }>
        {shown.length === 0 && <div style={{ fontSize: 12.5, color: T.txt3, padding: "10px 0" }}>{filter === "active" ? "Нет активных задач. Добавь первую выше." : "Пусто."}</div>}
        {shown.map((i) => {
          const p = PRIORITIES.find((x) => x.id === i.prio);
          return (
            <div key={i.id} className="fd-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 6px", borderBottom: `1px solid ${T.line}`, borderRadius: 6 }}>
              <span onClick={() => toggle(i.id)} style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${i.done ? T.ok : T.line2}`, background: i.done ? T.ok : "transparent", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>{i.done ? "✓" : ""}</span>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: p?.color, flexShrink: 0 }} title={p?.label} />
              <span style={{ flex: 1, fontSize: 13, color: i.done ? T.txt3 : T.txt, textDecoration: i.done ? "line-through" : "none" }}>{i.text}</span>
              <span style={{ fontSize: 10, color: T.txt3, fontFamily: mono }}>{new Date(i.created).toLocaleDateString("ru")}</span>
              <button className="fd-btn" onClick={() => del(i.id)} style={{ background: "none", border: "none", color: T.txt3, cursor: "pointer", fontSize: 15 }}>✕</button>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
