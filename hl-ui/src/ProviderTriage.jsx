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
    const [flagModal, setFlagModal] = useState(null);
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

    function openContactModal(item) {
        setFlagUI((prev) => ({
            ...prev,
            [item.riskId]: {
                ...(prev[item.riskId] || {}),
                contact: {
                    open: true,
                    method: prev[item.riskId]?.contact?.method || "phone",
                    note: prev[item.riskId]?.contact?.note || "",
                    error: null,
                    saving: false,
                },
            },
        }));
        setFlagModal({ type: "contact", riskId: item.riskId, patientName: item.patientName });
    }

    function openScheduleModal(item, detailData) {
        const existingAt = detailData?.flags?.appointmentAt
            ? toDateTimeLocalValue(detailData.flags.appointmentAt)
            : "";
        const slotOptions = getAppointmentOptions();
        const defaultAt =
            prevSlotValue(slotOptions, existingAt) ||
            prevSlotValue(slotOptions, prevValueFor(flagUI, item.riskId, "scheduled", "at")) ||
            slotOptions[0]?.value ||
            "";
        setFlagUI((prev) => ({
            ...prev,
            [item.riskId]: {
                ...(prev[item.riskId] || {}),
                scheduled: {
                    open: true,
                    at: defaultAt,
                    error: null,
                    saving: false,
                },
            },
        }));
        setFlagModal({ type: "scheduled", riskId: item.riskId, patientName: item.patientName });
    }

    function closeFlagModal() {
        if (!flagModal?.riskId || !flagModal?.type) {
            setFlagModal(null);
            return;
        }

        setFlagUI((prev) => ({
            ...prev,
            [flagModal.riskId]: {
                ...(prev[flagModal.riskId] || {}),
                [flagModal.type]: {
                    ...(prev[flagModal.riskId]?.[flagModal.type] || {}),
                    open: false,
                    error: null,
                    saving: false,
                },
            },
        }));
        setFlagModal(null);
    }

    async function saveContactFlag(riskId) {
        const ui = flagUI[riskId]?.contact;
        if (!ui) return;

        setFlagUI((prev) => ({
            ...prev,
            [riskId]: {
                ...(prev[riskId] || {}),
                contact: { ...ui, saving: true, error: null },
            },
        }));

        await setFlag(riskId, {
            contacted: true,
            contactMethod: ui.method,
            contactNote: ui.note || null,
            contactedAt: new Date().toISOString(),
        });

        closeFlagModal();
    }

    async function saveScheduledFlag(riskId) {
        const ui = flagUI[riskId]?.scheduled;
        if (!ui) return;

        const local = (ui.at || "").trim();
        if (!local) {
            setFlagUI((prev) => ({
                ...prev,
                [riskId]: {
                    ...(prev[riskId] || {}),
                    scheduled: { ...ui, error: "Please select a date/time." },
                },
            }));
            return;
        }

        const apptLocal = new Date(local);
        if (!isValidAppointmentSlot(apptLocal)) {
            setFlagUI((prev) => ({
                ...prev,
                [riskId]: {
                    ...(prev[riskId] || {}),
                    scheduled: {
                        ...ui,
                        error: "Appointments must be between 8:00 AM and 4:00 PM on the hour or half hour.",
                    },
                },
            }));
            return;
        }

        setFlagUI((prev) => ({
            ...prev,
            [riskId]: {
                ...(prev[riskId] || {}),
                scheduled: { ...ui, saving: true, error: null },
            },
        }));

        await setFlag(riskId, {
            scheduled: true,
            appointmentAt: apptLocal.toISOString(),
        });

        closeFlagModal();
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
                                    const flags = d?.data?.flags || {};

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
                                                                        checked={!!flags.contacted}
                                                                        onChange={(e) => {
                                                                            const checked = e.target.checked;

                                                                            if (!checked) {
                                                                                setFlag(item.riskId, {
                                                                                    contacted: false,
                                                                                    contactMethod: null,
                                                                                    contactNote: null,
                                                                                });
                                                                                return;
                                                                            }

                                                                            openContactModal(item);
                                                                        }}
                                                                    />
                                                                    Contacted
                                                                </label>

                                                                {/* SCHEDULED */}
                                                                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={!!flags.scheduled}
                                                                        onChange={(e) => {
                                                                            const checked = e.target.checked;

                                                                            if (!checked) {
                                                                                setFlag(item.riskId, {
                                                                                    scheduled: false,
                                                                                    appointmentAt: null,
                                                                                });
                                                                                return;
                                                                            }

                                                                            openScheduleModal(item, d.data);
                                                                        }}
                                                                    />
                                                                    Scheduled
                                                                </label>

                                                                <div style={{ fontSize: 12, color: "#666" }}>
                                                                    {flags.contactMethod
                                                                        ? `Contact via ${flags.contactMethod}`
                                                                        : "Not contacted"}
                                                                    {" · "}
                                                                    {flags.appointmentAt
                                                                        ? `Appointment ${new Date(flags.appointmentAt).toLocaleString()}`
                                                                        : "No appointment"}
                                                                </div>

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

            {flagModal?.type === "contact" && (
                <ModalShell title={`Mark Contacted: ${flagModal.patientName}`} onClose={closeFlagModal}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            Method:
                            <select
                                value={flagUI[flagModal.riskId]?.contact?.method || "phone"}
                                onChange={(e) => {
                                    const method = e.target.value;
                                    setFlagUI((prev) => ({
                                        ...prev,
                                        [flagModal.riskId]: {
                                            ...(prev[flagModal.riskId] || {}),
                                            contact: { ...(prev[flagModal.riskId]?.contact || {}), method },
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
                            value={flagUI[flagModal.riskId]?.contact?.note || ""}
                            onChange={(e) => {
                                const note = e.target.value;
                                setFlagUI((prev) => ({
                                    ...prev,
                                    [flagModal.riskId]: {
                                        ...(prev[flagModal.riskId] || {}),
                                        contact: { ...(prev[flagModal.riskId]?.contact || {}), note },
                                    },
                                }));
                            }}
                            style={{ flex: 1, minWidth: 220, padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
                        />
                    </div>

                    {flagUI[flagModal.riskId]?.contact?.error && (
                        <div style={{ color: "crimson", marginTop: 10 }}>
                            {flagUI[flagModal.riskId].contact.error}
                        </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                        <button style={btn("secondary")} onClick={closeFlagModal}>
                            Cancel
                        </button>
                        <button
                            style={btn("primary")}
                            disabled={!!flagUI[flagModal.riskId]?.contact?.saving}
                            onClick={() => saveContactFlag(flagModal.riskId)}
                        >
                            {flagUI[flagModal.riskId]?.contact?.saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </ModalShell>
            )}

            {flagModal?.type === "scheduled" && (
                <ModalShell title={`Schedule Appointment: ${flagModal.patientName}`} onClose={closeFlagModal}>
                    <select
                        value={flagUI[flagModal.riskId]?.scheduled?.at || ""}
                        onChange={(e) => {
                            const at = e.target.value;
                            setFlagUI((prev) => ({
                                ...prev,
                                [flagModal.riskId]: {
                                    ...(prev[flagModal.riskId] || {}),
                                    scheduled: { ...(prev[flagModal.riskId]?.scheduled || {}), at },
                                },
                            }));
                        }}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
                    >
                        {getAppointmentOptions().map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                        Weekdays only, 8:00 AM to 4:00 PM, 30-minute intervals, up to 8 weeks out.
                    </div>

                    {flagUI[flagModal.riskId]?.scheduled?.error && (
                        <div style={{ color: "crimson", marginTop: 10 }}>
                            {flagUI[flagModal.riskId].scheduled.error}
                        </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                        <button style={btn("secondary")} onClick={closeFlagModal}>
                            Cancel
                        </button>
                        <button
                            style={btn("primary")}
                            disabled={!!flagUI[flagModal.riskId]?.scheduled?.saving}
                            onClick={() => saveScheduledFlag(flagModal.riskId)}
                        >
                            {flagUI[flagModal.riskId]?.scheduled?.saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </ModalShell>
            )}
        </div>
    );
}

function colorBg(c) {
    if (c === "red") return "#dc2626";
    if (c === "orange") return "#ea580c";
    return "#ca8a04"; // default / yellow
}

function ModalShell({ title, children, onClose }) {
    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.38)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
                zIndex: 1000,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "min(520px, 100%)",
                    background: "#fff",
                    borderRadius: 16,
                    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.24)",
                    padding: 20,
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{title}</div>
                    <button style={btn("secondary")} onClick={onClose}>
                        Close
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

function labelForColor(c) {
    if (c === "red") return "Severe";
    if (c === "orange") return "Moderate";
    return "Routine";
}

function isValidAppointmentSlot(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

    const day = date.getDay();
    if (day === 0 || day === 6) return false;

    const hours = date.getHours();
    const minutes = date.getMinutes();
    if (minutes !== 0 && minutes !== 30) return false;
    if (hours < 8 || hours > 16) return false;
    if (hours === 16 && minutes !== 0) return false;

    return true;
}

function toDateTimeLocalValue(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function getAppointmentOptions(weeksOut = 8) {
    const options = [];
    const now = new Date();
    const start = new Date(now);
    const remainder = start.getMinutes() % 30;
    const minutesToAdd = remainder === 0 ? 30 : 30 - remainder;
    start.setMinutes(start.getMinutes() + minutesToAdd);
    start.setSeconds(0, 0);

    const end = new Date(now);
    end.setDate(end.getDate() + weeksOut * 7);
    end.setHours(23, 59, 59, 999);

    for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + 30 * 60000)) {
        if (!isValidAppointmentSlot(cursor)) continue;
        options.push({
            value: toDateTimeLocalValue(cursor),
            label: cursor.toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
            }),
        });
    }

    return options;
}

function prevValueFor(flagUI, riskId, section, key) {
    return flagUI?.[riskId]?.[section]?.[key] || "";
}

function prevSlotValue(options, value) {
    if (!value) return "";
    return options.some((option) => option.value === value) ? value : "";
}
