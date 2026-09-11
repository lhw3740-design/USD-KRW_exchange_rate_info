const SIGNAL_ID = "aleph-demo-index";
const FIXTURE_FILES = {
  "T04-NORMAL-D1-A": "normal-d1-a.json",
  "T04-NORMAL-D1-B": "normal-d1-b.json",
  "T04-NORMAL-D2": "normal-d2.json",
  "T04-TIMEOUT": "timeout.json",
  "T04-AUTH-401": "auth-401.json",
  "T04-RATE-429": "rate-429.json",
  "T04-OFFLINE": "offline.json",
  "T04-SCHEMA-BREAK": "schema-break.json",
  "T04-RECOVER-D2": "recover-d2.json",
};

const FAIL_LABELS = {
  "T04-TIMEOUT": "느린 응답 (timeout)",
  "T04-AUTH-401": "인증 거절 (401)",
  "T04-RATE-429": "호출 제한 (429)",
  "T04-OFFLINE": "오프라인",
  "T04-SCHEMA-BREAK": "형식 변경 (schema break)",
};

let state = T04Adapter.resetEvaluationState();
const logEl = document.getElementById("log");
let logHasContent = false;

async function loadFixture(id) {
  const res = await fetch("fixtures/" + FIXTURE_FILES[id], { cache: "no-store" });
  if (!res.ok) throw new Error("fixture load failed: " + id);
  return res.json();
}

function clearEmptyNotice() {
  if (!logHasContent) {
    logEl.innerHTML = "";
    logHasContent = true;
  }
}

function logSeparator(text) {
  clearEmptyNotice();
  const div = document.createElement("div");
  div.className = "step";
  div.style.borderLeftColor = "#5b5e63";
  div.innerHTML = `<div class="step-title">— ${text} —</div>`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

function actualFromState(s) {
  return {
    freshness: s.status ? s.status.freshness : null,
    error_code: s.status ? s.status.error_code : null,
    row_count: T04Adapter.rowCountFor(s, SIGNAL_ID),
    stored_value: T04Adapter.currentDisplayValue(s, SIGNAL_ID),
    delta: s.status && s.status.freshness === "fresh" ? s.last_delta : null,
  };
}

function compareExpected(expected, actual) {
  const fields = ["freshness", "error_code", "row_count", "stored_value", "delta"];
  const rows = fields.map((f) => ({
    field: f,
    expected: expected[f],
    actual: actual[f],
    ok: expected[f] === actual[f] || (expected[f] == null && actual[f] == null),
  }));
  return { rows, allPass: rows.every((r) => r.ok) };
}

function logStep(fixture, resultState, opts = {}) {
  clearEmptyNotice();
  const actual = actualFromState(resultState);
  const { rows, allPass } = compareExpected(fixture.expected, actual);

  const div = document.createElement("div");
  div.className = "step " + (allPass ? "pass" : "fail");

  const badgeClass = actual.freshness === "fresh" ? "ok" : "stale";
  const badgeText = actual.freshness === "fresh" ? "fresh / none" : `stale / ${actual.error_code}`;

  const rowsText = rows
    .map((r) => `  ${r.field.padEnd(12, " ")} 기대=${JSON.stringify(r.expected)}  실제=${JSON.stringify(r.actual)}  ${r.ok ? "✓" : "✗"}`)
    .join("\n");

  div.innerHTML = `
    <div class="step-title">${opts.isRetry ? "↻ 다시 시도 → " : ""}${fixture.fixture_id}
      <span class="badge ${badgeClass}">${badgeText}</span>
    </div>
    <div class="step-body">${fixture.description_ko}\n\n${rowsText}</div>
    <div class="step-match ${allPass ? "ok" : "mismatch"}">${allPass ? "✓ 이 단계는 기대값과 일치합니다." : "✗ 기대값과 다릅니다."}</div>
  `;

  if (opts.showRetry) {
    const retryRow = document.createElement("div");
    retryRow.className = "retry-row";
    const btn = document.createElement("button");
    btn.className = "btn btn-recover";
    btn.textContent = "다시 시도 (T04-RECOVER-D2 재생)";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await retry();
    });
    retryRow.appendChild(btn);
    div.appendChild(retryRow);
  }

  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

async function runBaseline() {
  state = T04Adapter.resetEvaluationState();
  const a = await loadFixture("T04-NORMAL-D1-A");
  state = T04Adapter.runFixture(state, a);
  logStep(a, state);
  const b = await loadFixture("T04-NORMAL-D1-B");
  state = T04Adapter.runFixture(state, b);
  logStep(b, state);
}

async function playNormal() {
  logSeparator("정상 시퀀스 재생 시작 (reset)");
  await runBaseline();
  const d2 = await loadFixture("T04-NORMAL-D2");
  state = T04Adapter.runFixture(state, d2);
  logStep(d2, state);
}

async function playDedupe() {
  logSeparator("카드4 — 같은 날짜 3회 → 다음 날짜 1회 재생 시작 (reset)");
  state = T04Adapter.resetEvaluationState();
  const rowCounts = [];

  const a = await loadFixture("T04-NORMAL-D1-A");
  state = T04Adapter.runFixture(state, a);
  logStep(a, state);
  rowCounts.push(T04Adapter.rowCountFor(state, SIGNAL_ID));

  const b = await loadFixture("T04-NORMAL-D1-B");
  state = T04Adapter.runFixture(state, b);
  logStep(b, state);
  rowCounts.push(T04Adapter.rowCountFor(state, SIGNAL_ID));

  // 같은 날짜 세 번째 재실행 — 별도 fixture 없이 D1-B를 다시 재생해 "같은 날 재실행"을 한 번 더 시험한다.
  state = T04Adapter.runFixture(state, b);
  logStep(b, state, { isRetry: true });
  rowCounts.push(T04Adapter.rowCountFor(state, SIGNAL_ID));

  const d2 = await loadFixture("T04-NORMAL-D2");
  state = T04Adapter.runFixture(state, d2);
  logStep(d2, state);
  rowCounts.push(T04Adapter.rowCountFor(state, SIGNAL_ID));

  const div = document.createElement("div");
  div.className = "step " + (rowCounts.join(",") === "1,1,1,2" ? "pass" : "fail");
  div.innerHTML = `
    <div class="step-title">같은 날 재실행 전후 행 수 요약</div>
    <div class="step-body">1회차(D1-A)=${rowCounts[0]}건 → 2회차(D1-B)=${rowCounts[1]}건 → 3회차(D1-B 재실행)=${rowCounts[2]}건 → 다음 날짜(D2)=${rowCounts[3]}건</div>
    <div class="step-match ${rowCounts.join(",") === "1,1,1,2" ? "ok" : "mismatch"}">${rowCounts.join(",") === "1,1,1,2" ? "✓ 같은 날 세 번은 1건, 다음 날은 2건으로 정확히 갈립니다." : "✗ 예상과 다릅니다."}</div>
  `;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

async function playFail(fixtureId) {
  logSeparator(`실패 재생 시작: ${FAIL_LABELS[fixtureId]} (기준선 → 실패, reset)`);
  await runBaseline();
  const f = await loadFixture(fixtureId);
  state = T04Adapter.runFixture(state, f);
  logStep(f, state, { showRetry: true });
}

async function retry() {
  const r = await loadFixture("T04-RECOVER-D2");
  state = T04Adapter.runFixture(state, r);
  logStep(r, state, { isRetry: true });
}

async function playRecover() {
  logSeparator("회복 시퀀스 재생 시작 (reset)");
  await runBaseline();
  const t = await loadFixture("T04-TIMEOUT");
  state = T04Adapter.runFixture(state, t);
  logStep(t, state);
  await retry();
}

function withBusyGuard(btn, fn) {
  return async () => {
    if (btn.disabled) return;
    document.querySelectorAll(".btn").forEach((b) => (b.disabled = true));
    try {
      await fn();
    } catch (e) {
      logSeparator("오류: " + e.message);
      console.error(e);
    } finally {
      document.querySelectorAll(".btn").forEach((b) => (b.disabled = false));
    }
  };
}

document.querySelectorAll("button[data-scenario]").forEach((btn) => {
  const scenario = btn.dataset.scenario;
  const fixtureId = btn.dataset.fixture;
  btn.addEventListener(
    "click",
    withBusyGuard(btn, async () => {
      if (scenario === "normal") await playNormal();
      else if (scenario === "dedupe") await playDedupe();
      else if (scenario === "fail") await playFail(fixtureId);
      else if (scenario === "recover") await playRecover();
    })
  );
});

document.getElementById("clearLog").addEventListener("click", () => {
  logEl.innerHTML = '<p class="console-empty">위 버튼을 눌러 시나리오를 재생하면 여기에 단계별 결과가 쌓입니다.</p>';
  logHasContent = false;
  state = T04Adapter.resetEvaluationState();
});

// 자동화된 채점 스크립트가 상태를 직접 조회할 수 있도록 최소한의 훅을 남겨둔다.
window.T04Test = {
  getState: () => state,
  playNormal,
  playDedupe,
  playFail,
  playRecover,
  retry,
};
