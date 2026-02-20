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
            await triageClient.setFlag(riskId, "bulk", updates);

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
                        Since {new Date(data.since).toLocaleString()} — Totals: Severe{" "}
                        {data.counts?.red || 0}, Moderate {data.counts?.orange || 0}, Routine{" "}
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

                                                            {/* 
                                                            {d.data.symptomStart && (
                                                                <div style={{ 
                                                                    marginTop: 8, 
                                                                    padding: 8, 
                                                                    background: "#eef2ff", 
                                                                    borderRadius: 6,
                                                                    border: "1px solid #c7d2fe",
                                                                    fontSize: 14
                                                                }}>
                                                                    <div style={{ fontWeight: 600, color: "#3730a3", display: "flex", alignItems: "center", gap: 6 }}>
                                                                        <span>⏰ Symptom Onset</span>
                                                                    </div>
                                                                    <div style={{ marginTop: 2 }}>
                                                                        {d.data.symptomStart.humanReadable} 
                                                                        <span style={{ color: "#6b7280", fontSize: 13, marginLeft: 6 }}>
                                                                            ({new Date(d.data.symptomStart.timestamp).toLocaleDateString()})
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )} 
                                                            */}

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
                                                                                    scheduled: { open: true, at: "", error: null, saving: false },
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
                                                                        <option value="red">Severe (Red)</option>
                                                                        <option value="orange">Moderate (Orange)</option>
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

                                                                {/* SCHEDULE PROMPT */}
                                                                {flagUI[item.riskId]?.scheduled?.open && (
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
                                                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>When is the appointment?</div>

                                                                        <input
                                                                            type="datetime-local"
                                                                            value={flagUI[item.riskId].scheduled.at}
                                                                            onChange={(e) => {
                                                                                const at = e.target.value;
                                                                                setFlagUI((prev) => ({
                                                                                    ...prev,
                                                                                    [item.riskId]: {
                                                                                        ...(prev[item.riskId] || {}),
                                                                                        scheduled: { ...prev[item.riskId].scheduled, at },
                                                                                    },
                                                                                }));
                                                                            }}
                                                                            style={{ padding: 6, borderRadius: 8, border: "1px solid #ddd" }}
                                                                        />

                                                                        {flagUI[item.riskId].scheduled.error && (
                                                                            <div style={{ color: "crimson", marginTop: 6 }}>
                                                                                {flagUI[item.riskId].scheduled.error}
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
                                                                                            scheduled: { open: false },
                                                                                        },
                                                                                    }));
                                                                                }}
                                                                            >
                                                                                Cancel
                                                                            </button>

                                                                            <button
                                                                                style={btn("primary")}
                                                                                disabled={!!flagUI[item.riskId].scheduled.saving}
                                                                                onClick={async () => {
                                                                                    const ui = flagUI[item.riskId].scheduled;
                                                                                    const local = (ui.at || "").trim();
                                                                                    if (!local) {
                                                                                        setFlagUI((prev) => ({
                                                                                            ...prev,
                                                                                            [item.riskId]: {
                                                                                                ...(prev[item.riskId] || {}),
                                                                                                scheduled: { ...ui, error: "Please select a date/time." },
                                                                                            },
                                                                                        }));
                                                                                        return;
                                                                                    }

                                                                                    // datetime-local is local time; convert to ISO
                                                                                    const apptIso = new Date(local).toISOString();

                                                                                    setFlagUI((prev) => ({
                                                                                        ...prev,
                                                                                        [item.riskId]: { ...(prev[item.riskId] || {}), scheduled: { ...ui, saving: true, error: null } },
                                                                                    }));

                                                                                    await setFlag(item.riskId, {
                                                                                        scheduled: true,
                                                                                        appointmentAt: apptIso,
                                                                                    });

                                                                                    setFlagUI((prev) => ({
                                                                                        ...prev,
                                                                                        [item.riskId]: {
                                                                                            ...(prev[item.riskId] || {}),
                                                                                            scheduled: { open: false },
                                                                                        },
                                                                                    }));
                                                                                }}
                                                                            >
                                                                                Save
                                                                            </button>
                                                                        </div>

                                                                        {/* Optional: show what’s saved */}
                                                                        {!!d.data?.flags?.appointmentAt && (
                                                                            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                                                                                Saved appointment: {new Date(d.data.flags.appointmentAt).toLocaleString()}
                                                                            </div>
                                                                        )}
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
        </div>
    );
}

function colorBg(c) {
    if (c === "red") return "#dc2626";
    if (c === "orange") return "#ea580c";
    return "#ca8a04"; // default / yellow
}

function labelForColor(c) {
    if (c === "red") return "Severe";
    if (c === "orange") return "Moderate";
    return "Routine";
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
``