/* 과제5 카드1에서 고정한 검사 10개.
   각 항목: id, 입력(raw/stored/screen 또는 원자료 호출 실패 사유), 기대값(kind).
   AI A/B가 서로 다른 세션에서 실행해도 항상 같은 결과가 나와야 한다. */
const FIXED_TESTS = [
  {
    id: "T-01",
    desc: "원자료=저장값=화면값, 완전히 동일",
    input: { raw: 1400.0, stored: 1400.0, screen: 1400.0 },
    expectedKind: "match",
  },
  {
    id: "T-02",
    desc: "오차 0.00005 — 허용 범위 안쪽",
    input: { raw: 1400.0, stored: 1400.00005, screen: 1400.0 },
    expectedKind: "match",
  },
  {
    id: "T-03",
    desc: "오차 정확히 0.0001 — 경계값, 허용 범위 포함(≤)",
    input: { raw: 1400.0, stored: 1400.0001, screen: 1400.0 },
    expectedKind: "match",
  },
  {
    id: "T-04",
    desc: "오차 0.00011 — 경계값 바로 초과",
    input: { raw: 1400.0, stored: 1400.00011, screen: 1400.0 },
    expectedKind: "mismatch",
  },
  {
    id: "T-05",
    desc: "화면값만 다름 (저장값은 원자료와 일치)",
    input: { raw: 1400.0, stored: 1400.0, screen: 1401.0 },
    expectedKind: "mismatch",
  },
  {
    id: "T-06",
    desc: "저장값만 다름 (화면값은 원자료와 일치)",
    input: { raw: 1400.0, stored: 1399.0, screen: 1400.0 },
    expectedKind: "mismatch",
  },
  {
    id: "T-07",
    desc: "원자료·저장값·화면값이 셋 다 서로 다름",
    input: { raw: 1400.0, stored: 1399.0, screen: 1401.0 },
    expectedKind: "mismatch",
  },
  {
    id: "T-08",
    desc: "원자료 호출 실패 — 타임아웃 (과제4 카드3 실패 유형 재사용)",
    input: { raw: null, stored: 1400.0, screen: 1400.0 },
    expectedKind: "unknown",
  },
  {
    id: "T-09",
    desc: "원자료 호출 실패 — 형식 오류/빈 응답 (과제4 카드3 schema_error 재사용)",
    input: { raw: null, stored: null, screen: null },
    expectedKind: "unknown",
  },
  {
    id: "T-10",
    desc: "0값 경계 케이스 — 셋 다 정확히 0",
    input: { raw: 0, stored: 0, screen: 0 },
    expectedKind: "match",
  },
];

function runFixedTests() {
  const logEl = document.getElementById("log");
  const summaryTitle = document.getElementById("summaryTitle");
  let passCount = 0;

  FIXED_TESTS.forEach((t) => {
    const actual = EvidenceBadge.evidenceBadgeState(t.input);
    const pass = actual.kind === t.expectedKind;
    if (pass) passCount += 1;

    const div = document.createElement("div");
    div.className = "step " + (pass ? "pass" : "fail");
    div.innerHTML = `
      <div class="step-title">${t.id}
        <span class="badge ${pass ? "ok" : "err"}">${pass ? "PASS" : "FAIL"}</span>
      </div>
      <div class="step-body">${t.desc}
입력: ${JSON.stringify(t.input)}
기대 kind=${t.expectedKind}  실제 kind=${actual.kind} (label="${actual.label}")</div>
      <div class="step-match ${pass ? "ok" : "mismatch"}">${pass ? "✓ 기대값과 일치합니다." : "✗ 기대값과 다릅니다."}</div>
    `;
    logEl.appendChild(div);
  });

  const allPass = passCount === FIXED_TESTS.length;
  summaryTitle.textContent = `검사 결과: ${passCount} / ${FIXED_TESTS.length} 통과 ${allPass ? "— 전부 통과" : "— 실패 있음"}`;
  summaryTitle.style.color = allPass ? "#9fd3a4" : "#f0a89f";

  // 자동화된 채점 스크립트나 다음 AI 세션이 조회할 수 있도록 결과를 전역에 남긴다.
  window.BadgeTestResult = {
    total: FIXED_TESTS.length,
    passed: passCount,
    allPass,
  };
}

runFixedTests();
