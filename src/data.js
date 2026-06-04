// src/data.js — live data layer. Fetches from the deployed server and maps
// Jira issues into the card shape the FlowDesk UI expects.

export const API = "https://flowdesk-server.onrender.com";

const DAY = 86400000;

// Jira status (lowercase) -> FlowDesk column id. Matches your DMS workflow.
const STATUS_TO_COL = {
  "к выполнению": "todo",
  "в работе": "inprogress",
  "в процессе проверки": "review",
  "тестирование": "testing",
  "готово": "done",
  // english fallbacks
  "backlog": "backlog", "to do": "todo", "todo": "todo",
  "in progress": "inprogress", "code review": "review", "in review": "review",
  "qa": "testing", "testing": "testing", "done": "done",
};

const FLOW_COLS = ["inprogress", "review", "testing"];

function stageOf(statusName, statusCategory) {
  if (statusName) {
    const s = STATUS_TO_COL[statusName.trim().toLowerCase()];
    if (s) return s;
  }
  if (statusCategory === "done") return "done";
  if (statusCategory === "indeterminate") return "inprogress";
  return "todo";
}

// role from labels/title (#Backend, #Frontend, #Mobile ...)
function roleOf(issue) {
  const hay = `${(issue.labels || []).join(" ")} ${issue.title}`.toLowerCase();
  if (hay.includes("backend")) return "Backend";
  if (hay.includes("frontend")) return "Frontend";
  if (hay.includes("mobile") || hay.includes("android")) return "Android";
  if (hay.includes("ios")) return "iOS";
  if (hay.includes("qa") || hay.includes("test")) return "QA";
  if (hay.includes("devops")) return "DevOps";
  return "—";
}

function priorityOf(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("highest") || n.includes("blocker") || n.includes("critical")) return "urgent";
  if (n.includes("high")) return "high";
  if (n.includes("low") || n.includes("lowest")) return "low";
  return "medium";
}

// when did the issue enter its current column (for aging)
function enteredCurrentCol(issue, col) {
  const h = (issue.history || []).filter((x) => x.status !== null);
  // walk backwards: find first moment status maps to current col continuously
  let entered = issue.updated;
  for (let i = h.length - 1; i >= 0; i--) {
    if (stageOf(h[i].status) === col) entered = h[i].at;
    else break;
  }
  return entered;
}

function startedAt(issue) {
  const h = (issue.history || []).filter((x) => x.status !== null);
  const e = h.find((x) => FLOW_COLS.includes(stageOf(x.status)));
  return e ? e.at : null;
}
function finishedAt(issue, col) {
  if (col !== "done") return null;
  const h = (issue.history || []).filter((x) => x.status !== null);
  const e = [...h].reverse().find((x) => stageOf(x.status) === "done");
  return e ? e.at : issue.updated;
}

// convert server history [{status, at}] -> FlowDesk history [{col, at}]
function mapHistory(issue) {
  return (issue.history || [])
    .filter((x) => x.status !== null)
    .map((x) => ({ col: stageOf(x.status), at: x.at }));
}

export function issueToCard(issue) {
  const col = stageOf(issue.status, issue.status_category);
  return {
    id: issue.key,
    title: issue.title,
    role: roleOf(issue),
    col,
    assignee: issue.assignee || "",
    priority: priorityOf(issue.priority),
    createdAt: issue.created,
    enteredAt: enteredCurrentCol(issue, col),
    startedAt: startedAt(issue),
    finishedAt: finishedAt(issue, col),
    history: mapHistory(issue),
    due: issue.due || null,
    blocked: null,
    subtasks: [],
    comments: [],
    deps: [],
    sprint: null,
  };
}

export async function fetchLive() {
  const [issuesRes, metricsRes] = await Promise.all([
    fetch(`${API}/api/issues`),
    fetch(`${API}/api/metrics`),
  ]);
  if (!issuesRes.ok) throw new Error(`issues ${issuesRes.status}`);
  if (!metricsRes.ok) throw new Error(`metrics ${metricsRes.status}`);
  const issuesJson = await issuesRes.json();
  const metricsJson = await metricsRes.json();
  const cards = (issuesJson.issues || []).map(issueToCard);
  return { cards, serverMetrics: metricsJson.metrics, lastSync: issuesJson.lastSync };
}
