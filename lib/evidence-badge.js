/* 과제5 개선 — 원자료/저장값/화면값 대조 결과를 배지로 판정하는 순수 함수.
   app.js와 badge-test.js가 이 파일 하나를 함께 참조해서, 화면 판정과 검사(T-01~T-10)가
   항상 같은 로직으로 채점되도록 한다. */
(function (global) {
  "use strict";

  const EVIDENCE_TOLERANCE = 0.0001;

  // kind: "match" | "mismatch" | "unknown"
  // - raw(원자료)를 아예 못 가져온 경우는 "확인불가"로, 값이 있는데 다른 경우인 "불일치"와 구분한다.
  // - 오차가 EVIDENCE_TOLERANCE(0.0001) 이내면 부동소수점 오차로 보고 "일치"로 판정한다.
  function evidenceBadgeState({ raw, stored, screen }) {
    if (raw == null) {
      return { kind: "unknown", label: "확인불가" };
    }
    if (stored == null || screen == null) {
      return { kind: "mismatch", label: "불일치" };
    }
    const closeEnough = (a, b) => Math.abs(a - b) <= EVIDENCE_TOLERANCE;
    const allMatch =
      closeEnough(raw, stored) && closeEnough(stored, screen) && closeEnough(raw, screen);
    return allMatch ? { kind: "match", label: "일치" } : { kind: "mismatch", label: "불일치" };
  }

  const api = { evidenceBadgeState, EVIDENCE_TOLERANCE };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.EvidenceBadge = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
