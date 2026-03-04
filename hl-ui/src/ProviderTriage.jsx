// hl-ui/src/ProviderTriage.jsx
import { useEffect, useState } from "react";
import { triageClient } from "./triageClient";

export default function ProviderTriage() {
    const [data, setData] = useState(null);
    const [hours, setHours] = useState(168);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    // open/close map by riskId
    const [open, setOpen] = useState({});
    // details cache by riskId: { loading, error, data }
    const [detail, setDetail] = useState({});
    // extra info for contact+schedule flags
    const [flagUI, setFlagUI] = useState({});
    // inline override UI per riskId: { open, color, reason, saving, error }
    const [overrideUI, setOverrideUI] = useState({});

    async function loadBoard() {
        setLoading(true);
        setErr(null);
        try {
            const json = await triageClient.getBoard({ sinceHours: hours });
            setData(json);
        } catch (e) {
            setData(null);
            setErr(e?.message || "Failed to load board");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadBoard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function toggle(riskId) {
        const isOpening = !open[riskId];
        setOpen((prev) => ({ ...prev, [riskId]: isOpening }));

        if (isOpening && !detail[riskId]) {
            setDetail((prev) => ({
                ...prev,
                [riskId]: { loading: true, error: null, data: null },
            }));
            try {
                const json = await triageClient.getDetail(riskId);
                setDetail((prev) => ({
                    ...prev,
                    [riskId]: { loading: false, error: null, data: json },
                }));
            } catch (e) {
                setDetail((prev) => ({
                    ...prev,
                    [riskId]: {
                        loading: false,
                        error: e?.message || "Failed to load",
                        data: null,
                    },
                }));
            }
        }
    }

    // remove a case from the board immediately (client-side)
    function removeFromBoard(riskId) {
        setData((prev) => {
            if (!prev) return prev;
            const oldGroups = prev.groups || { red: [], orange: [], yellow: [] };
            const newGroups = { red: [], orange: [], yellow: [] };

            for (const col of ["red", "orange", "yellow"]) {
                newGroups[col] = (oldGroups[col] || []).filter((it) => it.riskId !== riskId);
            }

            return {
                ...prev,
                groups: newGroups,
                counts: {
                    red: newGroups.red.length,
                    orange: newGroups.orange.length,
                    yellow: newGroups.yellow.length,
                },
            };
        });
    }

    async function setFlag(riskId, updates) {
        try {
            await triageClient.setFlag(riskId, updates);

            // Update local detail state
            setDetail((prev) => {
                const d = prev[riskId]?.data || {};
                const nextFlags = { ...(d.flags || {}), ...(updates || {}) };
                return {
                    ...prev,
                    [riskId]: {
                        ...(prev[riskId] || {}),
                        data: { ...d, flags: nextFlags },
                    },
                };
            });

            // If BOTH contacted & scheduled are true, remove the item immediately
            const currentFlags = detail[riskId]?.data?.flags || {};
            const merged = { ...currentFlags, ...updates };
            if (merged.contacted && merged.scheduled) {
                removeFromBoard(riskId);
                setOpen((prev) => ({ ...prev, [riskId]: false }));
            }
        } catch (e) {
            alert(`Failed to update flag: ${e?.message || e}`);
        }
    }

    // open override editor when provider selects a new color
    function openOverrideEditor(item, currentColor, newColor) {
        if (!newColor || newColor === currentColor) return;

        setOverrideUI((prev) => ({
            ...prev,
            [item.riskId]: {
                open: true,
                color: newColor,
                reason: "",
                saving: false,
                error: null,
            },
        }));
    }

    async function saveOverride(item, newColor, reason) {
        const riskId = item.riskId;

        setOverrideUI((prev) => ({
            ...prev,
            [riskId]: { ...prev[riskId], saving: true, error: null },
        }));

        try {
            await triageClient.setOverride(riskId, newColor, reason);

            // 1) Update detail (expanded view) immediately: color + rationale shown
            setDetail((prev) => {
                const d = prev[riskId]?.data || {};
                const next = {
                    ...(prev[riskId] || {}),
                    data: { ...d, color: newColor, rationale: reason },
                };
                return { ...prev, [riskId]: next };
            });

            // 2) Move card between columns immediately
            setData((prev) => {
                if (!prev) return prev;
                const oldGroups = prev.groups || { red: [], orange: [], yellow: [] };
                const newGroups = { red: [], orange: [], yellow: [] };

                // remove from all groups
                for (const col of ["red", "orange", "yellow"]) {
                    for (const it of oldGroups[col] || []) {
                        if (it.riskId === riskId) continue;
                        newGroups[col].push(it);
                    }
                }

                // add updated item into new bucket
                newGroups[newColor].push({ ...item, color: newColor });

                return {
                    ...prev,
                    groups: newGroups,
                    counts: {
                        red: newGroups.red.length,
                        orange: newGroups.orange.length,
                        yellow: newGroups.yellow.length,
                    },
                };
            });

            // close editor
            setOverrideUI((prev) => ({ ...prev, [riskId]: { open: false } }));

            // optional: refresh board to stay synced with backend truth
            loadBoard();
        } catch (e) {
            setOverrideUI((prev) => ({
                ...prev,
                [riskId]: {
                    ...prev[riskId],
                    saving: false,
                    error: e?.message || "Failed to set override",
                },
            }));
        }
    }

    const groups = data?.groups || { red: [], orange: [], yellow: [] };
    const activeScheduleRiskId = Object.entries(flagUI).find(
        ([, ui]) => ui?.scheduled?.open
    )?.[0];
    const activeScheduleUI = activeScheduleRiskId ? flagUI[activeScheduleRiskId]?.scheduled : null;
    const activeScheduleItem = activeScheduleRiskId
        ? Object.values(groups)
            .flat()
            .find((it) => it.riskId === activeScheduleRiskId)
        : null;
    const activeScheduleDetail = activeScheduleRiskId ? detail[activeScheduleRiskId]?.data : null;
    const schedulerWeekStart = activeScheduleUI?.weekStart || getWeekStartInput(activeScheduleUI?.at);
    const schedulerDays = buildSchedulerDays(schedulerWeekStart);

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: 24,
                background: "#f5f7fb",
            }}
        >
            <div style={{ width: "min(1200px, 100%)", margin: "0 auto" }}>
                <h1 style={{ textAlign: "center", marginBottom: 12 }}>
                    Provider Triage Board
                </h1>

                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 8,
                        marginBottom: 12,
                    }}
                >
                    <label>
                        Since last{" "}
                        <input
                            type="number"
                            min="1"
                            value={hours}
                            onChange={(e) => setHours(Number(e.target.value || 1))}
                            style={{ width: 70 }}
                        />{" "}
                        hours
                    </label>
                    <button onClick={loadBoard} style={{ padding: "6px 10px", borderRadius: 8 }}>
                        {loading ? "Refreshing…" : "Refresh"}
                    </button>
                </div>

                {err && (
                    <div style={{ color: "crimson", marginBottom: 12, textAlign: "center" }}>
                        Error: {err}
                    </div>
                )}

                {!err && !loading && data && (
                    <div style={{ marginBottom: 12, color: "#555", textAlign: "center" }}>
                        Since {new Date(data.since).toLocaleString()} — Totals: Urgent{" "}
                        {data.counts?.red || 0}, Semi-Urgent {data.counts?.orange || 0}, Routine{" "}
                        {data.counts?.yellow || 0}
                    </div>
                )}

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(300px, 1fr))",
                        gap: 16,
                    }}
                >
                    {["red", "orange", "yellow"].map((color) => (
                        <div
                            key={color}
                            style={{
                                border: "1px solid #eee",
                                borderRadius: 12,
                                overflow: "hidden",
                                background: "#fff",
                                boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
                            }}
                        >
                            <div
                                style={{
                                    padding: 10,
                                    color: "#fff",
                                    background: colorBg(color),
                                    fontWeight: 700,
                                    textAlign: "center",
                                }}
                            >
                                {labelForColor(color)} ({groups[color]?.length || 0})
                            </div>

                            <div style={{ padding: 10, maxHeight: 520, overflow: "auto" }}>
                                {(groups[color] || []).map((item) => {
                                    const isOpen = !!open[item.riskId];
                                    const d = detail[item.riskId];
                                    const override = overrideUI[item.riskId];

                                    // prefer detail color if loaded, else board color
                                    const currentColor = d?.data?.color || item.color || color;

                                    return (
                                        <div
                                            key={item.riskId}
                                            style={{ padding: "8px 4px", borderBottom: "1px solid #f1f1f1" }}
                                        >
                                            <div
                                                onClick={() => toggle(item.riskId)}
                                                style={{
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                }}
                                            >
                                                <div>
                                                    <b>{item.patientName}</b>{" "}
                                                    <code style={{ opacity: 0.7 }}>{item.patientId}</code>
                                                    <div style={{ fontSize: 12, color: "#666" }}>
                                                        {new Date(item.date).toLocaleString()}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: 12, opacity: 0.8 }}>
                                                    {isOpen ? "▲" : "▼"}
                                                </div>
                                            </div>

                                            {isOpen && (
                                                <div
                                                    style={{
                                                        marginTop: 6,
                                                        padding: 10,
                                                        background: "#f7fafc",
                                                        borderRadius: 8,
                                                    }}
                                                >
                                                    {!d || d.loading ? (
                                                        <div>Loading details…</div>
                                                    ) : d.error ? (
                                                        <div style={{ color: "crimson" }}>Error: {d.error}</div>
                                                    ) : (
                                                        <>
                                                            <div style={{ marginBottom: 6, textAlign: "center" }}>
                                                                <span
                                                                    style={{
                                                                        display: "inline-block",
                                                                        padding: "4px 8px",
                                                                        borderRadius: 6,
                                                                        background: colorBg(d.data.color),
                                                                        color: "#fff",
                                                                        fontWeight: 600,
                                                                    }}
                                                                >
                                                                    {labelForColor(d.data.color)}
                                                                </span>
                                                                <div style={{ marginTop: 6, color: "#555" }}>
                                                                    {d.data.rationale || "—"}
                                                                </div>
                                                            </div>

                                                            {!!(d.data.answers || []).length && (
                                                                <div style={{ fontSize: 14, marginTop: 8 }}>
                                                                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                                                        Patient answers
                                                                    </div>
                                                                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                                                                        {d.data.answers.map((a) => (
                                                                            <li key={a.linkId}>
                                                                                <b>{a.text}:</b> {a.answer}
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            )}

                                                            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                                                                {/* CONTACTED */}
                                                                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={!!d.data?.flags?.contacted}
                                                                        onChange={(e) => {
                                                                            const checked = e.target.checked;

                                                                            if (!checked) {
                                                                                // uncheck immediately clears contacted + optional metadata
                                                                                setFlag(item.riskId, {
                                                                                    contacted: false,
                                                                                    contactMethod: null,
                                                                                    contactNote: null,
                                                                                });
                                                                                return;
                                                                            }

                                                                            // open inline prompt instead of immediately saving
                                                                            setFlagUI((prev) => ({
                                                                                ...prev,
                                                                                [item.riskId]: {
                                                                                    ...(prev[item.riskId] || {}),
                                                                                    contact: { open: true, method: "phone", note: "", error: null, saving: false },
                                                                                },
                                                                            }));
                                                                        }}
                                                                    />
                                                                    Contacted
                                                                </label>

                                                                {/* SCHEDULED */}
                                                                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={!!d.data?.flags?.scheduled}
                                                                        onChange={(e) => {
                                                                            const checked = e.target.checked;

                                                                            if (!checked) {
                                                                                setFlag(item.riskId, {
                                                                                    scheduled: false,
                                                                                    appointmentAt: null,
                                                                                });
                                                                                return;
                                                                            }

                                                                            setFlagUI((prev) => ({
                                                                                ...prev,
                                                                                [item.riskId]: {
                                                                                    ...(prev[item.riskId] || {}),
                                                                                    scheduled: {
                                                                                        open: true,
                                                                                        at: "",
                                                                                        error: null,
                                                                                        saving: false,
                                                                                        weekStart: getWeekStartInput(""),
                                                                                    },
                                                                                },
                                                                            }));
                                                                        }}
                                                                    />
                                                                    Scheduled
                                                                </label>

                                                                <span style={{ marginLeft: "auto" }}>
                                                                    Override:
                                                                    <select
                                                                        value={currentColor}
                                                                        onChange={(e) => openOverrideEditor(item, currentColor, e.target.value)}
                                                                        style={{ marginLeft: 6 }}
                                                                    >
                                                                        <option value="red">Urgent (Red)</option>
                                                                        <option value="orange">Semi-Urgent (Orange)</option>
                                                                        <option value="yellow">Routine (Yellow)</option>
                                                                    </select>
                                                                </span>

                                                                {/* CONTACT PROMPT */}
                                                                {flagUI[item.riskId]?.contact?.open && (
                                                                    <div
                                                                        style={{
                                                                            width: "100%",
                                                                            marginTop: 10,
                                                                            padding: 10,
                                                                            background: "#fff",
                                                                            borderRadius: 8,
                                                                            border: "1px solid #e5e7eb",
                                                                        }}
                                                                    >
                                                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>How did you contact the patient?</div>

                                                                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                                                            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                                                Method:
                                                                                <select
                                                                                    value={flagUI[item.riskId].contact.method}
                                                                                    onChange={(e) => {
                                                                                        const method = e.target.value;
                                                                                        setFlagUI((prev) => ({
                                                                                            ...prev,
                                                                                            [item.riskId]: {
                                                                                                ...(prev[item.riskId] || {}),
                                                                                                contact: { ...prev[item.riskId].contact, method },
                                                                                            },
                                                                                        }));
                                                                                    }}
                                                                                >
                                                                                    <option value="phone">Phone</option>
                                                                                    <option value="email">Email</option>
                                                                                </select>
                                                                            </label>

                                                                            <input
                                                                                type="text"
                                                                                placeholder="Optional note (e.g., left voicemail)"
                                                                                value={flagUI[item.riskId].contact.note}
                                                                                onChange={(e) => {
                                                                                    const note = e.target.value;
                                                                                    setFlagUI((prev) => ({
                                                                                        ...prev,
                                                                                        [item.riskId]: {
                                                                                            ...(prev[item.riskId] || {}),
                                                                                            contact: { ...prev[item.riskId].contact, note },
                                                                                        },
                                                                                    }));
                                                                                }}
                                                                                style={{ flex: 1, minWidth: 220, padding: 6, borderRadius: 8, border: "1px solid #ddd" }}
                                                                            />
                                                                        </div>

                                                                        {flagUI[item.riskId].contact.error && (
                                                                            <div style={{ color: "crimson", marginTop: 6 }}>
                                                                                {flagUI[item.riskId].contact.error}
                                                                            </div>
                                                                        )}

                                                                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                                                                            <button
                                                                                style={btn("secondary")}
                                                                                onClick={() => {
                                                                                    setFlagUI((prev) => ({
                                                                                        ...prev,
                                                                                        [item.riskId]: {
                                                                                            ...(prev[item.riskId] || {}),
                                                                                            contact: { open: false },
                                                                                        },
                                                                                    }));
                                                                                }}
                                                                            >
                                                                                Cancel
                                                                            </button>

                                                                            <button
                                                                                style={btn("primary")}
                                                                                disabled={!!flagUI[item.riskId].contact.saving}
                                                                                onClick={async () => {
                                                                                    const ui = flagUI[item.riskId].contact;
                                                                                    setFlagUI((prev) => ({
                                                                                        ...prev,
                                                                                        [item.riskId]: { ...(prev[item.riskId] || {}), contact: { ...ui, saving: true } },
                                                                                    }));

                                                                                    await setFlag(item.riskId, {
                                                                                        contacted: true,
                                                                                        contactMethod: ui.method,
                                                                                        contactNote: ui.note || null,
                                                                                        contactedAt: new Date().toISOString(),
                                                                                    });

                                                                                    setFlagUI((prev) => ({
                                                                                        ...prev,
                                                                                        [item.riskId]: {
                                                                                            ...(prev[item.riskId] || {}),
                                                                                            contact: { open: false },
                                                                                        },
                                                                                    }));
                                                                                }}
                                                                            >
                                                                                Save
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                            </div>


                                                            {/* Inline override editor */}
                                                            {override?.open && (
                                                                <div
                                                                    style={{
                                                                        marginTop: 10,
                                                                        padding: 10,
                                                                        background: "#fff",
                                                                        borderRadius: 8,
                                                                        border: "1px solid #e5e7eb",
                                                                    }}
                                                                >
                                                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                                                                        Override to: {labelForColor(override.color)}
                                                                    </div>

                                                                    <textarea
                                                                        rows={3}
                                                                        placeholder="Reason for override (required)"
                                                                        value={override.reason || ""}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setOverrideUI((prev) => ({
                                                                                ...prev,
                                                                                [item.riskId]: { ...prev[item.riskId], reason: val },
                                                                            }));
                                                                        }}
                                                                        style={{
                                                                            width: "100%",
                                                                            padding: 8,
                                                                            borderRadius: 8,
                                                                            border: "1px solid #ddd",
                                                                            resize: "vertical",
                                                                        }}
                                                                    />

                                                                    {override.error && (
                                                                        <div style={{ color: "crimson", marginTop: 6 }}>
                                                                            {override.error}
                                                                        </div>
                                                                    )}

                                                                    <div
                                                                        style={{
                                                                            display: "flex",
                                                                            gap: 8,
                                                                            justifyContent: "flex-end",
                                                                            marginTop: 8,
                                                                        }}
                                                                    >
                                                                        <button
                                                                            onClick={() =>
                                                                                setOverrideUI((prev) => ({
                                                                                    ...prev,
                                                                                    [item.riskId]: { open: false },
                                                                                }))
                                                                            }
                                                                            style={btn("secondary")}
                                                                        >
                                                                            Cancel
                                                                        </button>

                                                                        <button
                                                                            disabled={!!override.saving}
                                                                            onClick={() => {
                                                                                const reason = (override.reason || "").trim();
                                                                                if (!reason) {
                                                                                    setOverrideUI((prev) => ({
                                                                                        ...prev,
                                                                                        [item.riskId]: {
                                                                                            ...prev[item.riskId],
                                                                                            error: "Reason is required.",
                                                                                        },
                                                                                    }));
                                                                                    return;
                                                                                }
                                                                                saveOverride(item, override.color, reason);
                                                                            }}
                                                                            style={btn("primary")}
                                                                        >
                                                                            {override.saving ? "Saving…" : "Save override"}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {!groups[color]?.length && (
                                    <div style={{ color: "#666", textAlign: "center" }}>None</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {activeScheduleRiskId && activeScheduleUI && (
                <div style={schedulerOverlay}>
                    <div style={schedulerModal}>
                        <div style={schedulerHeader}>
                            <div>
                                <div style={schedulerEyebrow}>Schedule Appointment</div>
                                <div style={schedulerTitle}>
                                    {activeScheduleItem?.patientName || activeScheduleDetail?.patient?.name || "Patient"}
                                </div>
                                <div style={schedulerMeta}>
                                    {activeScheduleItem?.patientId || activeScheduleDetail?.patient?.id || activeScheduleRiskId}
                                </div>
                            </div>
                            <button
                                style={iconBtn}
                                onClick={() => {
                                    setFlagUI((prev) => ({
                                        ...prev,
                                        [activeScheduleRiskId]: {
                                            ...(prev[activeScheduleRiskId] || {}),
                                            scheduled: { open: false },
                                        },
                                    }));
                                }}
                            >
                                Close
                            </button>
                        </div>

                        <div style={schedulerSubhead}>
                            Choose a day, then select an available 30-minute slot between 8:00 AM and 4:00 PM.
                        </div>

                        <div style={schedulerWeekNav}>
                            <button
                                style={btn("secondary")}
                                onClick={() => {
                                    setFlagUI((prev) => {
                                        const current = prev[activeScheduleRiskId]?.scheduled || {};
                                        const nextWeekStart = shiftWeekStartInput(current.weekStart || getWeekStartInput(current.at), -7);
                                        const selectedDateKey = getDateKeyFromLocalInput(current.at);
                                        const nextAt =
                                            selectedDateKey && isDateWithinWorkWeek(selectedDateKey, nextWeekStart)
                                                ? current.at
                                                : combineDateAndTime(nextWeekStart, getTimePart(current.at) || "08:00");
                                        return {
                                            ...prev,
                                            [activeScheduleRiskId]: {
                                                ...(prev[activeScheduleRiskId] || {}),
                                                scheduled: {
                                                    ...current,
                                                    weekStart: nextWeekStart,
                                                    at: nextAt,
                                                    error: null,
                                                },
                                            },
                                        };
                                    });
                                }}
                            >
                                Previous week
                            </button>
                            <div style={schedulerWeekLabel}>
                                {formatWorkWeekLabel(schedulerWeekStart)}
                            </div>
                            <button
                                style={btn("secondary")}
                                onClick={() => {
                                    setFlagUI((prev) => {
                                        const current = prev[activeScheduleRiskId]?.scheduled || {};
                                        const nextWeekStart = shiftWeekStartInput(current.weekStart || getWeekStartInput(current.at), 7);
                                        const selectedDateKey = getDateKeyFromLocalInput(current.at);
                                        const nextAt =
                                            selectedDateKey && isDateWithinWorkWeek(selectedDateKey, nextWeekStart)
                                                ? current.at
                                                : combineDateAndTime(nextWeekStart, getTimePart(current.at) || "08:00");
                                        return {
                                            ...prev,
                                            [activeScheduleRiskId]: {
                                                ...(prev[activeScheduleRiskId] || {}),
                                                scheduled: {
                                                    ...current,
                                                    weekStart: nextWeekStart,
                                                    at: nextAt,
                                                    error: null,
                                                },
                                            },
                                        };
                                    });
                                }}
                            >
                                Next week
                            </button>
                        </div>

                        <div style={schedulerDayGrid}>
                            {schedulerDays.map((day) => {
                                const selectedDate = getDateKeyFromLocalInput(activeScheduleUI.at);
                                const isSelected = day.dateKey === selectedDate;
                                return (
                                    <button
                                        key={day.dateKey}
                                        style={dayPill(isSelected)}
                                        onClick={() => {
                                            const nextValue = combineDateAndTime(day.dateKey, getTimePart(activeScheduleUI.at) || "08:00");
                                            setFlagUI((prev) => ({
                                                ...prev,
                                                [activeScheduleRiskId]: {
                                                    ...(prev[activeScheduleRiskId] || {}),
                                                    scheduled: {
                                                        ...prev[activeScheduleRiskId].scheduled,
                                                        at: nextValue,
                                                        weekStart: schedulerWeekStart,
                                                        error: null,
                                                    },
                                                },
                                            }));
                                        }}
                                    >
                                        <span>{day.label}</span>
                                        <span style={{ fontSize: 11, opacity: 0.75 }}>{day.subLabel}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div style={schedulerSlots}>
                            {buildTimeSlots().map((time) => {
                                const isSelected = getTimePart(activeScheduleUI.at) === time.value;
                                return (
                                    <button
                                        key={time.value}
                                        style={slotBtn(isSelected)}
                                        onClick={() => {
                                            const dateKey =
                                                getDateKeyFromLocalInput(activeScheduleUI.at) || schedulerDays[0]?.dateKey;
                                            const nextValue = combineDateAndTime(dateKey, time.value);
                                            setFlagUI((prev) => ({
                                                ...prev,
                                                [activeScheduleRiskId]: {
                                                    ...(prev[activeScheduleRiskId] || {}),
                                                    scheduled: {
                                                        ...prev[activeScheduleRiskId].scheduled,
                                                        at: nextValue,
                                                        weekStart: schedulerWeekStart,
                                                        error: null,
                                                    },
                                                },
                                            }));
                                        }}
                                    >
                                        {time.label}
                                    </button>
                                );
                            })}
                        </div>

                        {activeScheduleUI.error && (
                            <div style={{ color: "crimson", marginTop: 10 }}>
                                {activeScheduleUI.error}
                            </div>
                        )}

                        {!!activeScheduleDetail?.flags?.appointmentAt && (
                            <div style={savedLine}>
                                Current appointment: {new Date(activeScheduleDetail.flags.appointmentAt).toLocaleString()}
                            </div>
                        )}

                        <div style={schedulerFooter}>
                            <button
                                style={btn("secondary")}
                                onClick={() => {
                                    setFlagUI((prev) => ({
                                        ...prev,
                                        [activeScheduleRiskId]: {
                                            ...(prev[activeScheduleRiskId] || {}),
                                            scheduled: { open: false },
                                        },
                                    }));
                                }}
                            >
                                Cancel
                            </button>

                            <button
                                style={btn("primary")}
                                disabled={!!activeScheduleUI.saving}
                                onClick={async () => {
                                    const ui = flagUI[activeScheduleRiskId].scheduled;
                                    const local = (ui.at || "").trim();
                                    if (!local) {
                                        setFlagUI((prev) => ({
                                            ...prev,
                                            [activeScheduleRiskId]: {
                                                ...(prev[activeScheduleRiskId] || {}),
                                                scheduled: { ...ui, error: "Please select a day and time." },
                                            },
                                        }));
                                        return;
                                    }

                                    const apptLocal = new Date(local);
                                    if (!isValidAppointmentSlot(apptLocal)) {
                                        setFlagUI((prev) => ({
                                            ...prev,
                                            [activeScheduleRiskId]: {
                                                ...(prev[activeScheduleRiskId] || {}),
                                                scheduled: {
                                                    ...ui,
                                                    error: "Appointments must be between 8:00 AM and 4:00 PM on the hour or half hour.",
                                                },
                                            },
                                        }));
                                        return;
                                    }

                                    const apptIso = apptLocal.toISOString();

                                    setFlagUI((prev) => ({
                                        ...prev,
                                        [activeScheduleRiskId]: {
                                            ...(prev[activeScheduleRiskId] || {}),
                                            scheduled: { ...ui, saving: true, error: null },
                                        },
                                    }));

                                    await setFlag(activeScheduleRiskId, {
                                        scheduled: true,
                                        appointmentAt: apptIso,
                                    });

                                    setFlagUI((prev) => ({
                                        ...prev,
                                        [activeScheduleRiskId]: {
                                            ...(prev[activeScheduleRiskId] || {}),
                                            scheduled: { open: false },
                                        },
                                    }));
                                }}
                            >
                                {activeScheduleUI.saving ? "Saving..." : "Save appointment"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function colorBg(c) {
    if (c === "red") return "#dc2626";
    if (c === "orange") return "#ea580c";
    return "#ca8a04"; // default / yellow
}

function labelForColor(c) {
    if (c === "red") return "Urgent";
    if (c === "orange") return "Semi-Urgent";
    return "Routine";
}

function isValidAppointmentSlot(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

    const hours = date.getHours();
    const minutes = date.getMinutes();
    if (minutes !== 0 && minutes !== 30) return false;
    if (hours < 8 || hours > 16) return false;

    return true;
}

function buildSchedulerDays(weekStartInput) {
    const anchor = new Date(`${weekStartInput}T00:00:00`);
    anchor.setHours(0, 0, 0, 0);

    return Array.from({ length: 5 }, (_, index) => {
        const date = new Date(anchor);
        date.setDate(anchor.getDate() + index);
        return {
            dateKey: date.toISOString().slice(0, 10),
            label: date.toLocaleDateString("en-US", { weekday: "short" }),
            subLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        };
    });
}

function buildTimeSlots() {
    const slots = [];
    for (let hour = 8; hour <= 16; hour += 1) {
        for (const minute of [0, 30]) {
            const date = new Date();
            date.setHours(hour, minute, 0, 0);
            slots.push({
                value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
                label: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
            });
        }
    }
    return slots;
}

function getDateKeyFromLocalInput(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
}

function getTimePart(value) {
    if (!value || !String(value).includes("T")) return "";
    return String(value).slice(11, 16);
}

function combineDateAndTime(dateKey, timePart) {
    if (!dateKey) return "";
    return `${dateKey}T${timePart || "08:00"}`;
}

function getWeekStartInput(value) {
    const base = value ? new Date(value) : new Date();
    if (Number.isNaN(base.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return getMonday(today).toISOString().slice(0, 10);
    }
    base.setHours(0, 0, 0, 0);
    return getMonday(base).toISOString().slice(0, 10);
}

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function shiftWeekStartInput(weekStartInput, days) {
    const base = new Date(`${weekStartInput}T00:00:00`);
    base.setDate(base.getDate() + days);
    return base.toISOString().slice(0, 10);
}

function formatWorkWeekLabel(weekStartInput) {
    const start = new Date(`${weekStartInput}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 4);
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function isDateWithinWorkWeek(dateKey, weekStartInput) {
    const start = new Date(`${weekStartInput}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 4);
    const value = new Date(`${dateKey}T00:00:00`);
    return value >= start && value <= end;
}

function btn(kind) {
    const base = {
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid #ddd",
        cursor: "pointer",
        fontSize: 13,
    };
    if (kind === "primary") return { ...base, background: "#e7f3ff" };
    return { ...base, background: "#fff" };
}

function dayPill(selected) {
    return {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 4,
        padding: "10px 12px",
        borderRadius: 12,
        border: selected ? "1px solid #2563eb" : "1px solid #d1d5db",
        background: selected ? "#eff6ff" : "#fff",
        cursor: "pointer",
        minWidth: 92,
        fontWeight: 700,
        color: "#111827",
    };
}

function slotBtn(selected) {
    return {
        padding: "10px 12px",
        borderRadius: 10,
        border: selected ? "1px solid #0f766e" : "1px solid #d1d5db",
        background: selected ? "#ecfdf5" : "#fff",
        color: "#111827",
        cursor: "pointer",
        fontWeight: 600,
    };
}

const schedulerOverlay = {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.36)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 1000,
};

const schedulerModal = {
    width: "min(720px, 100%)",
    background: "#fff",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 22px 60px rgba(15, 23, 42, 0.22)",
    border: "1px solid #e5e7eb",
};

const schedulerHeader = {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
};

const schedulerEyebrow = {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#0f766e",
    marginBottom: 6,
};

const schedulerTitle = {
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
};

const schedulerMeta = {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
};

const schedulerSubhead = {
    marginTop: 14,
    fontSize: 13,
    color: "#4b5563",
};

const schedulerDayGrid = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 16,
};

const schedulerWeekNav = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 16,
    flexWrap: "wrap",
};

const schedulerWeekLabel = {
    fontSize: 13,
    fontWeight: 800,
    color: "#111827",
    minWidth: 160,
    textAlign: "center",
};

const schedulerSlots = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
    gap: 10,
    marginTop: 16,
};

const schedulerFooter = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
};

const iconBtn = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 700,
};

const savedLine = {
    marginTop: 12,
    fontSize: 12,
    color: "#6b7280",
};
``
