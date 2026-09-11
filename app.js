const SOURCE_URL = "https://api.frankfurter.dev/v2/rate/USD/KRW";
const DATA_URL = "data/rates.json?v=" + Date.now();
const TIMEZONE = "Asia/Seoul";

const $ = (id) => document.getElementById(id);

function formatKST(date) {
  // date: JS Date object -> "YYYY-MM-DD HH:mm:ss KST" string, computed for Asia/Seoul
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} KST`;
}

function nowIsoKST() {
  // returns an ISO-like string with +09:00 offset for storage purposes
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`;
}

function renderFlaps(rateStr) {
  const group = $("flapGroup");
  group.innerHTML = "";
  for (const ch of rateStr) {
    const el = document.createElement("div");
    el.className = "flap" + (/[.,]/.test(ch) ? " punct" : "");
    el.textContent = ch;
    group.appendChild(el);
  }
}

function setStatus(kind, text) {
  const dot = $("statusDot");
  dot.className = "status-dot" + (kind ? " " + kind : "");
  $("statusText").textContent = text;
}

function diffLabel(curr, prev) {
  if (prev == null) return "—";
  const d = curr - prev;
  if (Math.abs(d) < 0.005) return `<span class="diff-flat">±0.00</span>`;
  const sign = d > 0 ? "+" : "";
  const cls = d > 0 ? "diff-up" : "diff-down";
  return `<span class="${cls}">${sign}${d.toFixed(2)}</span>`;
}

async function loadStored() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("stored data unreachable: " + res.status);
  return res.json();
}

async function loadLive() {
  const res = await fetch(SOURCE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("API status " + res.status);
  const json = await res.json();
  if (typeof json.rate !== "number" || !json.date) {
    throw new Error("malformed response");
  }
  return json;
}

function renderLog(history) {
  const body = $("logBody");
  body.innerHTML = "";
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach((rec, i) => {
    const prev = i > 0 ? sorted[i - 1].rate : null;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${rec.date}</td>
      <td>${rec.rate.toFixed(2)}</td>
      <td>${diffLabel(rec.rate, prev)}</td>
      <td>${rec.fetched_at ? rec.fetched_at.replace("T", " ").replace("+09:00", " KST") : "—"}</td>
    `;
    body.appendChild(tr);
  });
}

function renderEvidence({ raw, stored, screen }) {
  $("evRaw").textContent = raw != null ? raw.toFixed(2) : "불러오지 못함";
  $("evStored").textContent = stored != null ? stored.toFixed(2) : "기록 없음";
  $("evScreen").textContent = screen != null ? screen.toFixed(2) : "—";

  const result = $("evidenceResult");
  if (raw != null && stored != null && screen != null &&
      raw.toFixed(2) === stored.toFixed(2) && stored.toFixed(2) === screen.toFixed(2)) {
    result.textContent = "✓ 세 값이 모두 일치합니다.";
    result.className = "evidence-result ok";
  } else if (raw == null) {
    result.textContent = "지금은 원자료를 가져오지 못해 저장값(마지막 정상값)으로 화면을 채우고 있습니다.";
    result.className = "evidence-result mismatch";
  } else {
    result.textContent = "값이 일치하지 않습니다 — 저장소가 아직 오늘 값으로 갱신되지 않았을 수 있습니다.";
    result.className = "evidence-result mismatch";
  }
}

async function main() {
  $("sourceUrlText").textContent = SOURCE_URL;
  $("metaSource").textContent = "Frankfurter (ECB 참조환율 기반)";

  let stored = null;
  try {
    stored = await loadStored();
  } catch (e) {
    // 저장소 자체를 못 읽는 경우 — 그래도 라이브 값 시도는 계속한다
    console.warn("stored data load failed", e);
  }

  const storedToday = stored?.history?.find(h => h.date === (stored.last_good?.date)) ?? stored?.last_good ?? null;

  let live = null;
  try {
    live = await loadLive();
  } catch (e) {
    console.warn("live fetch failed", e);
  }

  const fetchedAt = nowIsoKST();
  $("metaFetchedAt").textContent = formatKST(new Date());

  if (live) {
    // 정상: 실시간 값으로 화면 채움
    renderFlaps(live.rate.toFixed(2));
    setStatus("ok", "정상 — 방금 API에서 값을 받았습니다");
    $("metaSourceDate").textContent = `${live.date} (API 기준일)`;
    $("boardNote").textContent = "";

    renderEvidence({
      raw: live.rate,
      stored: storedToday ? storedToday.rate : (stored?.last_good?.rate ?? null),
      screen: live.rate,
    });
  } else if (stored?.last_good) {
    // 실패: 마지막 정상값을 보존해서 보여주되, 실패 상태임을 정직하게 표시
    renderFlaps(stored.last_good.rate.toFixed(2));
    setStatus("fail", "실패 — 지금은 새 값을 받지 못해, 마지막 정상값을 보여주고 있습니다");
    $("metaSourceDate").textContent = `${stored.last_good.date} (마지막 정상값 기준일)`;
    $("boardNote").textContent =
      `⚠ 지금 이 순간(${formatKST(new Date())}) API 호출이 실패했습니다. 위 값은 ${stored.last_good.fetched_at?.replace("T"," ").replace("+09:00"," KST")}에 저장된 마지막 정상값입니다.`;

    renderEvidence({ raw: null, stored: stored.last_good.rate, screen: stored.last_good.rate });
  } else {
    // 완전 실패: 저장값도 없음
    renderFlaps("——.——");
    setStatus("fail", "실패 — 표시할 값이 없습니다 (API도, 저장소도 응답하지 않음)");
    $("metaSourceDate").textContent = "—";
    $("boardNote").textContent = "저장소와 실시간 API 모두 응답하지 않았습니다. 잠시 후 다시 확인해 주세요.";
    renderEvidence({ raw: null, stored: null, screen: null });
  }

  if (stored?.history) {
    renderLog(stored.history);
  }
}

main();
