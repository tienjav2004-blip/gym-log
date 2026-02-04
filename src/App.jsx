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
    "-" +
    Date.now().toString(16) +
    "-" +
    Math.random().toString(16).slice(2)
  );
}

/** ISO week key: YYYY-Www */
function isoWeekKey(dateISO) {
  const d = new Date(dateISO + "T00:00:00");
  // ISO week: Thursday-based
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - day + 3);

  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);

  const diff = thursday - firstThursday;
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  const yyyy = thursday.getFullYear();
  return `${yyyy}-W${String(week).padStart(2, "0")}`;
}

function prettyDate(dateISO) {
  // dd/mm/yyyy
  const [y, m, d] = dateISO.split("-");
  return `${d}/${m}/${y}`;
}

function clampNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calcSetVolume(set) {
  return clampNum(set.reps) * clampNum(set.kg);
}

function calcExerciseVolume(ex) {
  return (ex.sets || []).reduce((sum, s) => sum + calcSetVolume(s), 0);
}

function calcEntryVolume(entry) {
  return (entry.exercises || []).reduce((sum, ex) => sum + calcExerciseVolume(ex), 0);
}

function calcEntrySets(entry) {
  return (entry.exercises || []).reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);
}

function calcEntryReps(entry) {
  return (entry.exercises || []).reduce(
    (sum, ex) => sum + (ex.sets || []).reduce((s2, s) => s2 + clampNum(s.reps), 0),
    0
  );
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

// danh sách gợi ý ban đầu (bạn sửa/add thoải mái)
const BASE_EXERCISES = [
  "Bench Press",
  "Incline Bench Press",
  "Dumbbell Press",
  "Cable Fly",
  "Push Up",
  "Tricep Pushdown",
  "Overhead Tricep Extension",
  "Lat Pulldown",
  "Pull Up",
  "Barbell Row",
  "Seated Row",
  "Deadlift",
  "Bicep Curl",
  "Hammer Curl",
  "Squat",
  "Leg Press",
  "Romanian Deadlift (RDL)",
  "Leg Extension",
  "Leg Curl",
  "Calf Raise",
  "Overhead Press",
  "Lateral Raise",
  "Rear Delt Fly",
  "Plank",
  "Crunch",
  "Hanging Leg Raise",
  "Running",
  "Cycling",
  "Stairmaster",
];

/** ===== UI building blocks ===== */
function emptySet() {
  return { id: uid(), reps: 10, kg: 0 };
}

function emptyExercise() {
  return { id: uid(), name: "", sets: [emptySet()] };
}

export default function App() {
  /** Form state */
  const [date, setDate] = useState(todayISO());
  const [planKey, setPlanKey] = useState("D1");
  const [exercisesDraft, setExercisesDraft] = useState([emptyExercise()]);

  /** Log state */
  const [entries, setEntries] = useState([]);

  /** Load saved */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch (e) {
      console.log(e);
    }
  }, []);

  /** Save */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.log(e);
    }
  }, [entries]);

  /** Exercise suggestions: base + history */
  const exerciseSuggestions = useMemo(() => {
    const set = new Set(BASE_EXERCISES.map((s) => s.trim()).filter(Boolean));
    for (const entry of entries) {
      for (const ex of entry.exercises || []) {
        if (ex?.name?.trim()) set.add(ex.name.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  /** Stats (weekly) */
  const weeklyStats = useMemo(() => {
    const map = new Map(); // weekKey -> stats
    for (const entry of entries) {
      const wk = isoWeekKey(entry.date);
      const prev = map.get(wk) || {
        weekKey: wk,
        volume: 0,
        sets: 0,
        reps: 0,
        topExercise: new Map(), // name -> volume
      };

      const v = calcEntryVolume(entry);
      const s = calcEntrySets(entry);
      const r = calcEntryReps(entry);

      prev.volume += v;
      prev.sets += s;
      prev.reps += r;

      for (const ex of entry.exercises || []) {
        const name = (ex.name || "").trim();
        if (!name) continue;
        const ev = calcExerciseVolume(ex);
        prev.topExercise.set(name, (prev.topExercise.get(name) || 0) + ev);
      }

      map.set(wk, prev);
    }

    // convert to list sorted desc by weekKey
    const list = Array.from(map.values()).sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1));

    // make top3 text
    return list.map((w) => {
      const top = Array.from(w.topExercise.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, vol]) => ({ name, vol }));
      return { ...w, top };
    });
  }, [entries]);

  /** Entry list (newest first) */
  const entriesSorted = useMemo(() => {
    return [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries]);

  /** ===== Draft actions ===== */
  function updateExerciseName(exId, name) {
    setExercisesDraft((prev) =>
      prev.map((ex) => (ex.id === exId ? { ...ex, name } : ex))
    );
  }

  function addExercise() {
    setExercisesDraft((prev) => [...prev, emptyExercise()]);
  }

  function removeExercise(exId) {
    setExercisesDraft((prev) => prev.filter((ex) => ex.id !== exId));
  }

  function addSet(exId) {
    setExercisesDraft((prev) =>
      prev.map((ex) =>
        ex.id === exId ? { ...ex, sets: [...ex.sets, emptySet()] } : ex
      )
    );
  }

  function removeSet(exId, setId) {
    setExercisesDraft((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        const nextSets = ex.sets.filter((s) => s.id !== setId);
        return { ...ex, sets: nextSets.length ? nextSets : [emptySet()] };
      })
    );
  }

  function updateSetField(exId, setId, field, value) {
    setExercisesDraft((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) =>
            s.id === setId ? { ...s, [field]: value } : s
          ),
        };
      })
    );
  }

  function resetForm() {
    setPlanKey("D1");
    setExercisesDraft([emptyExercise()]);
  }

  /** ===== Save entry ===== */
  function saveEntry() {
    const cleanedExercises = exercisesDraft
      .map((ex) => ({
        ...ex,
        name: (ex.name || "").trim(),
        sets: (ex.sets || []).map((s) => ({
          ...s,
          reps: clampNum(s.reps),
          kg: clampNum(s.kg),
        })),
      }))
      .filter((ex) => ex.name);

    if (!cleanedExercises.length) {
      alert("Bạn nhập ít nhất 1 bài tập nha 😄");
      return;
    }

    const entry = {
      id: uid(),
      date,
      planKey,
      planLabel: PLAN.find((p) => p.key === planKey)?.label || planKey,
      exercises: cleanedExercises,
      createdAt: Date.now(),
    };

    setEntries((prev) => [entry, ...prev]);
    resetForm();
  }

  /** ===== Delete ===== */
  function deleteEntry(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function clearAll() {
    if (!confirm("Xóa toàn bộ lịch sử?")) return;
    setEntries([]);
  }

  /** ===== Render ===== */
  return (
    <div className="gl-page">
      <header className="gl-header">
        <div>
          <h1 className="gl-title">Gym Log</h1>
          <p className="gl-sub">Nhập ngày • chọn Day • thêm nhiều bài • set/reps/kg — lưu tự động</p>
        </div>
        <div className="gl-pill">tiensebu</div>
      </header>

      <div className="gl-grid">
        {/* Left: Form */}
        <section className="gl-card">
          <h2 className="gl-h2">Nhập buổi tập</h2>

          <div className="gl-row">
            <div className="gl-label">Ngày</div>
            <input
              className="gl-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="gl-row">
            <div className="gl-label">Buổi (theo lịch)</div>
            <select
              className="gl-input"
              value={planKey}
              onChange={(e) => setPlanKey(e.target.value)}
            >
              {PLAN.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="gl-sets-head">
            <div className="gl-sets-title">Bài tập ({exercisesDraft.length})</div>
            <button className="gl-btn gl-btn-primary" onClick={addExercise}>
              + Thêm bài
            </button>
          </div>

          <datalist id="exercise-suggestions">
            {exerciseSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="gl-sets">
            {exercisesDraft.map((ex, idx) => (
              <div className="gl-set" key={ex.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div className="gl-set-label">Bài {idx + 1}</div>
                  {exercisesDraft.length > 1 && (
                    <button
                      className="gl-btn gl-btn-danger"
                      onClick={() => removeExercise(ex.id)}
                      title="Xóa bài"
                    >
                      Xóa bài
                    </button>
                  )}
                </div>

                <div className="gl-row">
                  <div className="gl-label">Tên bài</div>
                  <input
                    className="gl-input"
                    placeholder="VD: Bench Press / Lat Pulldown / Squat..."
                    value={ex.name}
                    list="exercise-suggestions"
                    onChange={(e) => updateExerciseName(ex.id, e.target.value)}
                  />
                </div>

                <div className="gl-sets-head" style={{ marginTop: 8 }}>
                  <div className="gl-sets-title">Sets ({ex.sets.length})</div>
                  <button className="gl-btn gl-btn-ghost" onClick={() => addSet(ex.id)}>
                    + Thêm set
                  </button>
                </div>

                <div className="gl-sets">
                  {ex.sets.map((s, si) => (
                    <div className="gl-set" key={s.id} style={{ marginTop: 6 }}>
                      <div className="gl-set-grid">
                        <div>
                          <div className="gl-mini">Set {si + 1} — Reps</div>
                          <input
                            className="gl-input"
                            type="number"
                            min="0"
                            value={s.reps}
                            onChange={(e) =>
                              updateSetField(ex.id, s.id, "reps", e.target.value)
                            }
                          />
                        </div>

                        <div>
                          <div className="gl-mini">Kg</div>
                          <input
                            className="gl-input"
                            type="number"
                            min="0"
                            step="0.5"
                            value={s.kg}
                            onChange={(e) =>
                              updateSetField(ex.id, s.id, "kg", e.target.value)
                            }
                          />
                        </div>

                        <button
                          className="gl-btn gl-btn-x"
                          onClick={() => removeSet(ex.id, s.id)}
                          title="Xóa set"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="gl-hint">
                  Volume bài này: <b>{calcExerciseVolume(ex)}</b> (reps × kg)
                </div>
              </div>
            ))}
          </div>

          <div className="gl-actions">
            <button className="gl-btn gl-btn-primary" onClick={saveEntry}>
              Lưu buổi tập
            </button>
            <button className="gl-btn gl-btn-ghost" onClick={resetForm}>
              Xóa form
            </button>
          </div>

          <div className="gl-footnote">
            Lưu tự động bằng <b>localStorage</b> (đóng mở lại vẫn còn). Sau này mình nâng cấp export Excel / cloud sync cũng được.
          </div>
        </section>

        {/* Right: History + Stats */}
        <section className="gl-card">
          <div className="gl-item-top" style={{ marginBottom: 10 }}>
            <h2 className="gl-h2" style={{ margin: 0 }}>Lịch sử</h2>
            <button className="gl-btn gl-btn-danger" onClick={clearAll}>
              Xóa tất cả
            </button>
          </div>

          {/* Weekly stats */}
          <div className="gl-set" style={{ marginBottom: 12 }}>
            <div className="gl-set-label">Thống kê theo tuần</div>
            {weeklyStats.length === 0 ? (
              <div className="gl-empty">Chưa có dữ liệu để thống kê 😄</div>
            ) : (
              <div className="gl-list">
                {weeklyStats.slice(0, 4).map((w) => (
                  <div className="gl-item" key={w.weekKey}>
                    <div className="gl-item-top">
                      <div>
                        <div className="gl-item-title">{w.weekKey}</div>
                        <div className="gl-item-meta">
                          <span className="gl-pill">Volume: <b>{Math.round(w.volume)}</b></span>
                          <span className="gl-pill">Sets: <b>{w.sets}</b></span>
                          <span className="gl-pill">Reps: <b>{w.reps}</b></span>
                        </div>
                      </div>
                    </div>

                    {w.top?.length ? (
                      <div className="gl-chips">
                        {w.top.map((t) => (
                          <span className="gl-chip" key={t.name}>
                            {t.name}: {Math.round(t.vol)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Entries */}
          {entriesSorted.length === 0 ? (
            <div className="gl-empty">
              Chưa có dữ liệu. Nhập buổi tập bên trái là lên đời ngay 😄
            </div>
          ) : (
            <div className="gl-list">
              {entriesSorted.map((e) => (
                <div className="gl-item" key={e.id}>
                  <div className="gl-item-top">
                    <div>
                      <div className="gl-item-title">
                        {e.planLabel} • {prettyDate(e.date)}
                      </div>
                      <div className="gl-item-meta">
                        <span className="gl-pill">Bài: <b>{e.exercises?.length || 0}</b></span>
                        <span className="gl-pill">Sets: <b>{calcEntrySets(e)}</b></span>
                        <span className="gl-pill">Reps: <b>{calcEntryReps(e)}</b></span>
                        <span className="gl-pill">Volume: <b>{Math.round(calcEntryVolume(e))}</b></span>
                      </div>
                    </div>

                    <button className="gl-btn gl-btn-danger" onClick={() => deleteEntry(e.id)}>
                      Xóa
                    </button>
                  </div>

                  {/* Exercises detail */}
                  <div className="gl-chips" style={{ marginTop: 10 }}>
                    {(e.exercises || []).map((ex) => (
                      <span className="gl-chip" key={ex.id}>
                        {ex.name} — {Math.round(calcExerciseVolume(ex))}
                      </span>
                    ))}
                  </div>

                  {/* Sets preview */}
                  {(e.exercises || []).map((ex) => (
                    <div className="gl-chips" key={ex.id + "-sets"} style={{ marginTop: 8 }}>
                      {(ex.sets || []).map((s, i) => (
                        <span className="gl-pill" key={s.id}>
                          {ex.name} • Set {i + 1}: {s.reps} reps × {s.kg} kg
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <footer className="gl-footer">Tự lưu trên máy • version V2</footer>
        </section>
      </div>
    </div>
  );
}
