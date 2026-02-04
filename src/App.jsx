import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

/** ===== Helpers ===== */
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function uid() {
  return (
    Math.random().toString(16).slice(2) +
    "_" +
    Date.now().toString(16) +
    "_" +
    Math.random().toString(16).slice(2)
  );
}

function clampNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function prettyDate(dateISO) {
  // dd/mm/yyyy
  const [y, m, d] = String(dateISO).split("-");
  if (!y || !m || !d) return dateISO;
  return `${d}/${m}/${y}`;
}

function calcEntryReps(entry) {
  return (entry.exercises || []).reduce((sum, ex) => {
    return (
      sum +
      (ex.sets || []).reduce((s2, s) => s2 + clampNum(s.reps || 0), 0)
    );
  }, 0);
}

function calcEntryVolume(entry) {
  // reps * kg
  return (entry.exercises || []).reduce((sum, ex) => {
    return (
      sum +
      (ex.sets || []).reduce(
        (s2, s) => s2 + clampNum(s.reps || 0) * clampNum(s.kg || 0),
        0
      )
    );
  }, 0);
}

/** ===== Default data ===== */
const STORAGE_KEY = "TIENSEBU_GYM_LOG_V2";

const PLAN = [
  { key: "D1", label: "Day 1: Ngực + Tay sau" },
  { key: "D2", label: "Day 2: Lưng + Tay trước" },
  { key: "D3", label: "Day 3: Chân" },
  { key: "D4", label: "Day 4: Vai + Core" },
  { key: "D5", label: "Day 5: Upper mix nhẹ pump" },
  { key: "D6", label: "Day 6: Cardio" },
  { key: "D7", label: "Day 7: Off / yếu" },
];

function emptyExercise() {
  return {
    id: uid(),
    name: "",
    sets: [{ id: uid(), reps: 10, kg: 0 }],
  };
}

function emptyDraft() {
  return {
    date: todayISO(),
    planKey: "D1",
    exercises: [emptyExercise()],
  };
}

export default function App() {
  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState(emptyDraft());

  /** Load localStorage */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setEntries(parsed);
    } catch (e) {
      console.log("Load error:", e);
    }
  }, []);

  /** Save localStorage */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.log("Save error:", e);
    }
  }, [entries]);

  const planLabel = useMemo(() => {
    return PLAN.find((p) => p.key === draft.planKey)?.label || "";
  }, [draft.planKey]);

  /** Suggestions */
  const exerciseSuggestions = useMemo(() => {
    const set = new Set();
    for (const entry of entries) {
      for (const ex of entry.exercises || []) {
        const nm = (ex.name || "").trim();
        if (nm) set.add(nm);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  /** Weekly stats (very simple) */
  const weeklyStats = useMemo(() => {
    // group by YYYY-WW (ISO-ish, simplified)
    const map = new Map();
    const dToWeekKey = (iso) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "unknown";
      // Thursday-based week number trick
      const thursday = new Date(d);
      const day = (thursday.getDay() + 6) % 7; // Mon=0..Sun=6
      thursday.setDate(thursday.getDate() - day + 3); // move to Thursday
      const firstThursday = new Date(thursday.getFullYear(), 0, 4);
      const firstDay = (firstThursday.getDay() + 6) % 7;
      firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
      const diff = thursday - firstThursday;
      const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
      const yyyy = thursday.getFullYear();
      return `${yyyy}-W${String(week).padStart(2, "0")}`;
    };

    for (const entry of entries) {
      const wk = dToWeekKey(entry.date);
      const reps = calcEntryReps(entry);
      const vol = calcEntryVolume(entry);
      const prev = map.get(wk) || { wk, sessions: 0, reps: 0, vol: 0 };
      prev.sessions += 1;
      prev.reps += reps;
      prev.vol += vol;
      map.set(wk, prev);
    }

    return Array.from(map.values()).sort((a, b) => (a.wk < b.wk ? 1 : -1));
  }, [entries]);

  const entriesSorted = useMemo(() => {
    return [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries]);

  /** Draft actions */
  function setDraftDate(v) {
    setDraft((prev) => ({ ...prev, date: v }));
  }
  function setDraftPlanKey(v) {
    setDraft((prev) => ({ ...prev, planKey: v }));
  }

  function addExercise() {
    setDraft((prev) => ({ ...prev, exercises: [...prev.exercises, emptyExercise()] }));
  }

  function removeExercise(exId) {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.filter((ex) => ex.id !== exId),
    }));
  }

  function updateExerciseName(exId, name) {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex) => (ex.id === exId ? { ...ex, name } : ex)),
    }));
  }

  function addSet(exId) {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex) => {
        if (ex.id !== exId) return ex;
        return { ...ex, sets: [...(ex.sets || []), { id: uid(), reps: 10, kg: 0 }] };
      }),
    }));
  }

  function removeSet(exId, setId) {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex) => {
        if (ex.id !== exId) return ex;
        return { ...ex, sets: (ex.sets || []).filter((s) => s.id !== setId) };
      }),
    }));
  }

  function updateSet(exId, setId, patch) {
    setDraft((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex) => {
        if (ex.id !== exId) return ex;
        return {
          ...ex,
          sets: (ex.sets || []).map((s) => (s.id === setId ? { ...s, ...patch } : s)),
        };
      }),
    }));
  }

  function calcExerciseVolume(ex) {
    return (ex.sets || []).reduce(
      (sum, s) => sum + clampNum(s.reps || 0) * clampNum(s.kg || 0),
      0
    );
  }

  function saveEntry() {
    const cleanedExercises = (draft.exercises || [])
      .map((ex) => ({
        ...ex,
        name: (ex.name || "").trim(),
        sets: (ex.sets || []).map((s) => ({
          ...s,
          reps: clampNum(s.reps),
          kg: clampNum(s.kg),
        })),
      }))
      .filter((ex) => ex.name); // bỏ bài trống

    const entry = {
      id: uid(),
      date: draft.date || todayISO(),
      planKey: draft.planKey || "D1",
      planLabel: PLAN.find((p) => p.key === (draft.planKey || "D1"))?.label || "",
      exercises: cleanedExercises.length ? cleanedExercises : [],
      createdAt: Date.now(),
    };

    setEntries((prev) => [entry, ...prev]);
    setDraft(emptyDraft());
  }

  function loadTemplate() {
    setDraft(emptyDraft());
  }

  function clearAll() {
    if (!confirm("Xóa toàn bộ lịch sử?")) return;
    setEntries([]);
    setDraft(emptyDraft());
  }

  return (
    <div className="gl-page">
      <header className="gl-header">
        <div>
          <h1 className="gl-title">Nhấc mông lên đi tập thôi 🤭</h1>
          <p className="gl-sub">
            Nhập ngày • chọn Day • thêm nhiều bài • set/reps/kg — lưu tự động
          </p>
        </div>
        <div className="gl-pill">tiensebu</div>
      </header>

      <div className="gl-grid">
        {/* Left: Form */}
        <section className="gl-card">
          <h2 className="gl-h2">trong tập</h2>

          <div className="gl-row">
            <div className="gl-label">Ngày</div>
            <input
              className="gl-input"
              type="date"
              value={draft.date}
              onChange={(e) => setDraftDate(e.target.value)}
            />
          </div>

          <div className="gl-row">
            <div className="gl-label">(theo)</div>
            <select
              className="gl-input"
              value={draft.planKey}
              onChange={(e) => setDraftPlanKey(e.target.value)}
            >
              {PLAN.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="gl-sectionTitle">
            <div>
              <b>Bài tập ({draft.exercises.length})</b>
            </div>
            <button className="gl-btn" onClick={addExercise}>
              + Thêm bài
            </button>
          </div>

          {draft.exercises.map((ex, idx) => (
            <div key={ex.id} className="gl-ex">
              <div className="gl-exTop">
                <div className="gl-exName">
                  <div className="gl-small">Bài {idx + 1}</div>
                  <div className="gl-small">Tên bài</div>
                  <input
                    className="gl-input"
                    list="ex-suggest"
                    placeholder="VD: Đẩy tạ nằm / Kéo tạ xuống / Ngồi xổm..."
                    value={ex.name}
                    onChange={(e) => updateExerciseName(ex.id, e.target.value)}
                  />
                  <datalist id="ex-suggest">
                    {exerciseSuggestions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>

                <button className="gl-btnDanger" onClick={() => removeExercise(ex.id)}>
                  ✕
                </button>
              </div>

              <div className="gl-sectionTitle">
                <div>
                  <b>Tập hợp ({(ex.sets || []).length})</b>
                </div>
                <button className="gl-btn" onClick={() => addSet(ex.id)}>
                  + Thêm bộ
                </button>
              </div>

              {(ex.sets || []).map((s, i) => (
                <div key={s.id} className="gl-setRow">
                  <div className="gl-setLabel">Bộ {i + 1} — Số lần lặp</div>
                  <input
                    className="gl-input gl-num"
                    type="number"
                    value={s.reps}
                    onChange={(e) => updateSet(ex.id, s.id, { reps: e.target.value })}
                  />

                  <div className="gl-setLabel">Kg</div>
                  <input
                    className="gl-input gl-num"
                    type="number"
                    value={s.kg}
                    onChange={(e) => updateSet(ex.id, s.id, { kg: e.target.value })}
                  />

                  <button className="gl-btnDanger" onClick={() => removeSet(ex.id, s.id)}>
                    ✕
                  </button>
                </div>
              ))}

              <div className="gl-muted">
                Khối lượng bài này: <b>{calcExerciseVolume(ex)}</b> (số lần × kg)
              </div>
            </div>
          ))}

          <div className="gl-actions">
            <button className="gl-btnPrimary" onClick={saveEntry}>
              Lưu HỘI
            </button>
            <button className="gl-btn" onClick={loadTemplate}>
              biểu mẫu
            </button>
            <button className="gl-btnGhost" onClick={clearAll}>
              Xóa hết
            </button>
          </div>

          <div className="gl-muted">
            Lưu tự động bằng localStorage (vẫn đóng mở lại). Sau đó bạn nâng cấp xuất
            Excel / cloud sync của mình cũng được.
          </div>
        </section>

        {/* Right: Stats */}
        <aside className="gl-card">
          <h2 className="gl-h2">lịch</h2>

          <div className="gl-box">
            <div className="gl-boxTitle">hàng tuần theo</div>
            {weeklyStats.length === 0 ? (
              <div className="gl-muted">Không có dữ liệu.</div>
            ) : (
              <div className="gl-weekList">
                {weeklyStats.slice(0, 6).map((w) => (
                  <div key={w.wk} className="gl-weekRow">
                    <div className="gl-weekKey">{w.wk}</div>
                    <div className="gl-weekMeta">
                      <span>{w.sessions} buổi</span>
                      <span>{w.reps} reps</span>
                      <span>{Math.round(w.vol)} vol</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="gl-box">
            <div className="gl-boxTitle">mới nhất</div>
            {entriesSorted.length === 0 ? (
              <div className="gl-muted">No data. Nhập buổi tập đầu tiên nào 😄</div>
            ) : (
              <div className="gl-entryList">
                {entriesSorted.slice(0, 8).map((e) => (
                  <div key={e.id} className="gl-entry">
                    <div className="gl-entryTop">
                      <b>{prettyDate(e.date)}</b>
                      <span className="gl-chip">
                        {PLAN.find((p) => p.key === e.planKey)?.label || e.planLabel}
                      </span>
                    </div>

                    <div className="gl-muted">
                      {e.exercises?.length || 0} bài • {calcEntryReps(e)} reps •{" "}
                      {Math.round(calcEntryVolume(e))} vol
                    </div>

                    <div className="gl-chips">
                      {(e.exercises || []).slice(0, 6).map((ex) => (
                        <span key={ex.id} className="gl-chip">
                          {ex.name} — {Math.round(calcExerciseVolume(ex))}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
