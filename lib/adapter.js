/* T04 어댑터 — ALEPH가 제공한 adapter-reset.example.js를 브라우저에서 쓸 수 있게 그대로 포팅한 것.
   함수 이름과 상태 전이 로직은 참조 구현과 동일하게 유지한다 (fixture의 expected 값이 이 로직 기준으로 만들어졌기 때문). */
(function (global) {
  "use strict";

  const NORMALIZED_KEYS = Object.freeze([
    "signal_id",
    "normalized_value",
    "unit",
    "source_name",
    "source_url",
    "source_time",
    "fetched_at",
    "record_timezone",
    "record_date",
  ]);

  const ERROR_CODES = Object.freeze([
    "timeout",
    "auth",
    "rate_limit",
    "offline",
    "schema_error",
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function kstDate(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      throw new TypeError("fetched_at must be a valid ISO-8601 date-time");
    }
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  }

  function validateNormalizedReading(reading) {
    if (!reading || typeof reading !== "object" || Array.isArray(reading)) {
      throw new TypeError("normalized reading must be an object");
    }

    const actualKeys = Object.keys(reading).sort();
    const expectedKeys = [...NORMALIZED_KEYS].sort();
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      throw new TypeError(`normalized reading keys must be exactly: ${NORMALIZED_KEYS.join(", ")}`);
    }

    if (!/^[a-z0-9][a-z0-9._-]*$/.test(reading.signal_id) || reading.signal_id.length > 100) {
      throw new TypeError("signal_id is invalid");
    }
    if (typeof reading.normalized_value !== "number" || !Number.isFinite(reading.normalized_value)) {
      throw new TypeError("normalized_value must be a finite number");
    }
    for (const field of ["unit", "source_name"]) {
      if (typeof reading[field] !== "string" || reading[field].trim() === "") {
        throw new TypeError(`${field} must be a non-empty string`);
      }
    }

    let sourceUrl;
    try {
      sourceUrl = new URL(reading.source_url);
    } catch {
      throw new TypeError("source_url must be an absolute URL");
    }
    if (sourceUrl.protocol !== "https:") {
      throw new TypeError("source_url must use HTTPS");
    }

    if (reading.source_time !== null && Number.isNaN(new Date(reading.source_time).getTime())) {
      throw new TypeError("source_time must be a valid date-time or null");
    }
    if (Number.isNaN(new Date(reading.fetched_at).getTime())) {
      throw new TypeError("fetched_at must be a valid date-time");
    }
    if (reading.record_timezone !== "Asia/Seoul") {
      throw new TypeError("record_timezone must be Asia/Seoul");
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(reading.record_date) ||
      reading.record_date !== kstDate(reading.fetched_at)
    ) {
      throw new TypeError("record_date must be the Asia/Seoul date derived from fetched_at");
    }

    return true;
  }

  function validateStatus(status) {
    if (!status || typeof status !== "object" || Array.isArray(status)) return false;
    if (status.freshness === "fresh") return status.error_code === "none";
    if (status.freshness === "stale") return ERROR_CODES.includes(status.error_code);
    return false;
  }

  function resetEvaluationState() {
    return {
      schema_version: "aleph-t04-evaluation-state-v1",
      daily_readings: [],
      current_reading: null,
      status: null,
      last_delta: null,
      last_comparison: {
        state: "insufficient",
        direction: null,
        magnitude: null,
        unit: null,
      },
      last_run: null,
      sequence: 0,
    };
  }

  function recordIdFor(reading) {
    return `demo-${reading.signal_id}-${reading.record_date}`;
  }

  function comparisonFor(rows, current) {
    const previous = rows
      .filter((row) => row.signal_id === current.signal_id && row.record_date < current.record_date)
      .sort((left, right) => right.record_date.localeCompare(left.record_date))[0];
    if (!previous) {
      return { state: "insufficient", direction: null, magnitude: null, unit: null };
    }
    if (previous.unit !== current.unit) {
      return { state: "unit_mismatch", direction: null, magnitude: null, unit: null };
    }
    const signed = current.normalized_value - previous.normalized_value;
    return {
      state: "comparable",
      direction: signed > 0 ? "increase" : signed < 0 ? "decrease" : "unchanged",
      magnitude: Math.abs(signed),
      unit: current.unit,
    };
  }

  function applySuccessfulReading(inputState, reading, runMeta = {}) {
    validateNormalizedReading(reading);
    const state = clone(inputState);
    const existingIndex = state.daily_readings.findIndex(
      (row) => row.signal_id === reading.signal_id && row.record_date === reading.record_date
    );
    const existing = existingIndex >= 0 ? state.daily_readings[existingIndex] : null;
    const row = {
      record_id: existing ? existing.record_id : recordIdFor(reading),
      signal_id: reading.signal_id,
      record_date: reading.record_date,
      normalized_value: reading.normalized_value,
      unit: reading.unit,
      first_fetched_at: existing ? existing.first_fetched_at : reading.fetched_at,
      last_fetched_at: reading.fetched_at,
      reading: clone(reading),
    };

    if (existingIndex >= 0) state.daily_readings[existingIndex] = row;
    else state.daily_readings.push(row);
    state.daily_readings.sort((left, right) => left.record_date.localeCompare(right.record_date));

    state.current_reading = clone(reading);
    state.status = { freshness: "fresh", error_code: "none" };
    state.last_comparison = comparisonFor(state.daily_readings, row);
    state.last_delta = state.last_comparison.magnitude;
    state.sequence += 1;
    state.last_run = {
      fixture_id: runMeta.fixture_id || null,
      virtual_now: runMeta.virtual_now || reading.fetched_at,
      outcome: "success",
      error_code: "none",
      retry_after_seconds: null,
    };
    return state;
  }

  function applyError(inputState, errorCode, runMeta = {}) {
    if (!ERROR_CODES.includes(errorCode)) {
      throw new TypeError(`unsupported error code: ${errorCode}`);
    }
    const state = clone(inputState);
    state.status = { freshness: "stale", error_code: errorCode };
    state.sequence += 1;
    state.last_run = {
      fixture_id: runMeta.fixture_id || null,
      virtual_now: runMeta.virtual_now || null,
      outcome: "error",
      error_code: errorCode,
      retry_after_seconds: runMeta.retry_after_seconds ?? null,
    };
    return state;
  }

  function runFixture(inputState, fixture) {
    const meta = {
      fixture_id: fixture.fixture_id,
      virtual_now: fixture.virtual_now,
      retry_after_seconds: fixture.transport.headers["retry-after"]
        ? Number(fixture.transport.headers["retry-after"])
        : null,
    };

    if (fixture.transport.mode === "timeout") return applyError(inputState, "timeout", meta);
    if (fixture.transport.mode === "offline") return applyError(inputState, "offline", meta);
    if (fixture.transport.status === 401 || fixture.transport.status === 403) {
      return applyError(inputState, "auth", meta);
    }
    if (fixture.transport.status === 429) return applyError(inputState, "rate_limit", meta);
    if (fixture.transport.status >= 200 && fixture.transport.status < 300) {
      try {
        return applySuccessfulReading(inputState, fixture.payload, meta);
      } catch {
        return applyError(inputState, "schema_error", meta);
      }
    }
    return applyError(inputState, "schema_error", meta);
  }

  function currentDisplayValue(state, signalId) {
    const rows = state.daily_readings
      .filter((r) => r.signal_id === signalId)
      .sort((a, b) => a.record_date.localeCompare(b.record_date));
    return rows.length ? rows[rows.length - 1].normalized_value : null;
  }

  function rowCountFor(state, signalId) {
    return state.daily_readings.filter((r) => r.signal_id === signalId).length;
  }

  const api = {
    ERROR_CODES,
    NORMALIZED_KEYS,
    applyError,
    applySuccessfulReading,
    kstDate,
    resetEvaluationState,
    runFixture,
    validateNormalizedReading,
    validateStatus,
    comparisonFor,
    recordIdFor,
    currentDisplayValue,
    rowCountFor,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.T04Adapter = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
