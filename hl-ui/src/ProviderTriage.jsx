// hl-ui/src/ProviderTriage.jsx
import { useEffect, useMemo, useState } from "react";
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
    // image retrieval results by riskId: { loading, error, data }
    const [imageResults, setImageResults] = useState({});

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

    async function loadRelatedImages(riskId, answers) {
        if (!riskId || imageResults[riskId]?.loading) return;

        setImageResults((prev) => ({
            ...prev,
            [riskId]: { loading: true, error: null, data: null },
        }));

        try {
            const json = await triageClient.searchRelatedImages({ answers });
            setImageResults((prev) => ({
                ...prev,
                [riskId]: { loading: false, error: null, data: json },
            }));
        } catch (e) {
            setImageResults((prev) => ({
                ...prev,
                [riskId]: {
                    loading: false,
                    error: e?.message || "Failed to load related images",
                    data: null,
                },
            }));
        }
    }

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
                loadRelatedImages(riskId, json?.answers || []);
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
        } else if (isOpening && detail[riskId] && !imageResults[riskId]) {
            loadRelatedImages(riskId, detail[riskId]?.data?.answers || []);
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
                    method: prev[item.riskId]?.contact?.method || "phone",
                    note: prev[item.riskId]?.contact?.note || "",
                    saving: false,
                    error: null,
                },
            },
        }));
        setFlagModal({ type: "contact", riskId: item.riskId, patientName: item.patientName });
    }

    function openScheduleModal(item, detailData) {
        const weekGroups = getAppointmentWeekGroups(8);
        const currentValue = detailData?.flags?.appointmentAt ? toDateTimeLocalValue(detailData.flags.appointmentAt) : "";
        const weekValue = findWeekForValue(weekGroups, currentValue) || weekGroups[0]?.value || "";
        const days = groupSlotsByDay(weekGroups.find((week) => week.value === weekValue)?.slots || []);
        const dayValue = findDayForValue(days, currentValue) || days[0]?.value || "";
        const slots = days.find((day) => day.value === dayValue)?.slots || [];

        setFlagUI((prev) => ({
            ...prev,
            [item.riskId]: {
                ...(prev[item.riskId] || {}),
                scheduled: {
                    week: weekValue,
                    day: dayValue,
                    at: pickSlotValue(slots, currentValue) || slots[0]?.value || "",
                    saving: false,
                    error: null,
                },
            },
        }));
        setFlagModal({ type: "schedule", riskId: item.riskId, patientName: item.patientName });
    }

    function closeFlagModal() {
        setFlagModal(null);
    }

    async function saveContactFlag(riskId) {
        const ui = flagUI[riskId]?.contact;
        if (!ui) return;

        setFlagUI((prev) => ({
            ...prev,
            [riskId]: { ...(prev[riskId] || {}), contact: { ...ui, saving: true, error: null } },
        }));

        await setFlag(riskId, {
            contacted: true,
            contactMethod: ui.method,
            contactNote: ui.note || null,
            contactedAt: new Date().toISOString(),
        });

        closeFlagModal();
    }

    async function saveScheduleFlag(riskId) {
        const ui = flagUI[riskId]?.scheduled;
        if (!ui?.at) {
            setFlagUI((prev) => ({
                ...prev,
                [riskId]: {
                    ...(prev[riskId] || {}),
                    scheduled: { ...(prev[riskId]?.scheduled || {}), error: "Please select a time slot." },
                },
            }));
            return;
        }

        const apptLocal = new Date(ui.at);
        if (!isValidAppointmentSlot(apptLocal)) {
            setFlagUI((prev) => ({
                ...prev,
                [riskId]: {
                    ...(prev[riskId] || {}),
                    scheduled: {
                        ...(prev[riskId]?.scheduled || {}),
                        error: "Appointments must be weekdays from 8:00 AM to 4:00 PM in 30-minute slots.",
                    },
                },
            }));
            return;
        }

        setFlagUI((prev) => ({
            ...prev,
            [riskId]: { ...(prev[riskId] || {}), scheduled: { ...ui, saving: true, error: null } },
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
    const weekGroups = useMemo(() => getAppointmentWeekGroups(8), []);
    const activeSchedule = flagModal?.type === "schedule" ? flagUI[flagModal.riskId]?.scheduled : null;
    const activeWeekIndex = activeSchedule?.week
        ? Math.max(0, weekGroups.findIndex((week) => week.value === activeSchedule.week))
        : 0;
    const activeWeek = weekGroups[activeWeekIndex] || weekGroups[0] || null;
    const activeDays = groupSlotsByDay(activeWeek?.slots || []);
    const activeDay = activeSchedule?.day
        ? activeDays.find((day) => day.value === activeSchedule.day) || activeDays[0] || null
        : activeDays[0] || null;
    const activeDaySlots = activeDay?.slots || [];

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
                        {data.counts?.red || 0}, Semi-Routine {data.counts?.orange || 0}, Routine{" "}
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
                                    const imageState = imageResults[item.riskId];
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

                                                            <div style={{ marginTop: 10 }}>
                                                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                                                                    Related images
                                                                </div>

                                                                {!imageState || imageState.loading ? (
                                                                    <div style={{ fontSize: 13, color: "#666" }}>
                                                                        Loading related images…
                                                                    </div>
                                                                ) : imageState.error ? (
                                                                    <div style={{ fontSize: 13, color: "crimson" }}>
                                                                        {imageState.error}
                                                                    </div>
                                                                ) : !(imageState.data?.images || []).length ? (
                                                                    <div style={{ fontSize: 13, color: "#666" }}>
                                                                        No matching images found.
                                                                    </div>
                                                                ) : (
                                                                    <div
                                                                        style={{
                                                                            display: "grid",
                                                                            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                                                                            gap: 8,
                                                                        }}
                                                                    >
                                                                        {(imageState.data.images || []).map((img, idx) => (
                                                                            <a
                                                                                key={`${item.riskId}-img-${idx}`}
                                                                                href={img.imageUrl}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                style={{
                                                                                    display: "block",
                                                                                    textDecoration: "none",
                                                                                    color: "inherit",
                                                                                    border: "1px solid #e5e7eb",
                                                                                    borderRadius: 8,
                                                                                    padding: 6,
                                                                                    background: "#fff",
                                                                                }}
                                                                            >
                                                                                <img
                                                                                    src={img.imageUrl}
                                                                                    alt={img.label || img.imageName || "related result"}
                                                                                    style={{
                                                                                        width: "100%",
                                                                                        height: 96,
                                                                                        objectFit: "cover",
                                                                                        borderRadius: 6,
                                                                                        background: "#f3f4f6",
                                                                                    }}
                                                                                />
                                                                                <div style={{ fontSize: 12, marginTop: 6 }}>
                                                                                    {img.label || img.imageName || "Image"}
                                                                                </div>
                                                                                <div style={{ fontSize: 11, color: "#666" }}>
                                                                                    Score: {img.score ?? "n/a"}
                                                                                </div>
                                                                            </a>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>

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
                                                                    {flags.contactMethod ? `Contact via ${flags.contactMethod}` : "Not contacted"}
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
                                                                        <option value="orange">Semi-Routine (Orange)</option>
                                                                        <option value="yellow">Routine (Blue)</option>
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

            {flagModal?.type === "schedule" && (
                <ModalShell title={`Schedule Appointment: ${flagModal.patientName}`} onClose={closeFlagModal}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
                        <button
                            style={btn("secondary")}
                            disabled={activeWeekIndex <= 0}
                            onClick={() => {
                                const prevWeek = weekGroups[activeWeekIndex - 1];
                                if (!prevWeek) return;
                                setFlagUI((prev) => ({
                                    ...prev,
                                        [flagModal.riskId]: {
                                            ...(prev[flagModal.riskId] || {}),
                                            scheduled: {
                                                ...(prev[flagModal.riskId]?.scheduled || {}),
                                                week: prevWeek.value,
                                                day: groupSlotsByDay(prevWeek.slots)[0]?.value || "",
                                                at: groupSlotsByDay(prevWeek.slots)[0]?.slots?.[0]?.value || "",
                                                error: null,
                                            },
                                        },
                                    }));
                            }}
                        >
                            Previous Week
                        </button>
                        <div style={{ fontWeight: 700, textAlign: "center" }}>{activeWeek?.label || "No availability"}</div>
                        <button
                            style={btn("secondary")}
                            disabled={activeWeekIndex < 0 || activeWeekIndex >= weekGroups.length - 1}
                            onClick={() => {
                                const nextWeek = weekGroups[activeWeekIndex + 1];
                                if (!nextWeek) return;
                                setFlagUI((prev) => ({
                                    ...prev,
                                        [flagModal.riskId]: {
                                            ...(prev[flagModal.riskId] || {}),
                                            scheduled: {
                                                ...(prev[flagModal.riskId]?.scheduled || {}),
                                                week: nextWeek.value,
                                                day: groupSlotsByDay(nextWeek.slots)[0]?.value || "",
                                                at: groupSlotsByDay(nextWeek.slots)[0]?.slots?.[0]?.value || "",
                                                error: null,
                                            },
                                        },
                                    }));
                            }}
                        >
                            Next Week
                        </button>
                    </div>

                    <div style={{ display: "grid", gap: 12 }}>
                        <label style={{ display: "grid", gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>Day</span>
                            <select
                                value={activeSchedule?.day || ""}
                                onChange={(e) => {
                                    const day = e.target.value;
                                    const slots = activeDays.find((entry) => entry.value === day)?.slots || [];
                                    setFlagUI((prev) => ({
                                        ...prev,
                                        [flagModal.riskId]: {
                                            ...(prev[flagModal.riskId] || {}),
                                            scheduled: {
                                                ...(prev[flagModal.riskId]?.scheduled || {}),
                                                day,
                                                at: slots[0]?.value || "",
                                                error: null,
                                            },
                                        },
                                    }));
                                }}
                                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
                            >
                                {activeDays.map((day) => (
                                    <option key={day.value} value={day.value}>
                                        {day.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label style={{ display: "grid", gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>Time</span>
                            <select
                                value={activeSchedule?.at || ""}
                                onChange={(e) => {
                                    const at = e.target.value;
                                    setFlagUI((prev) => ({
                                        ...prev,
                                        [flagModal.riskId]: {
                                            ...(prev[flagModal.riskId] || {}),
                                            scheduled: {
                                                ...(prev[flagModal.riskId]?.scheduled || {}),
                                                at,
                                                error: null,
                                            },
                                        },
                                    }));
                                }}
                                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
                            >
                                {activeDaySlots.map((slot) => (
                                    <option key={slot.value} value={slot.value}>
                                        {slot.timeLabel}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
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
                            disabled={!!flagUI[flagModal.riskId]?.scheduled?.saving || !activeSchedule?.at}
                            onClick={() => saveScheduleFlag(flagModal.riskId)}
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
    return "#1e40af"; // routine
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
                    width: "min(760px, 100%)",
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
    if (c === "orange") return "Semi-Routine";
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
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getWeekStart(date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    const day = value.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    value.setDate(value.getDate() + diff);
    return value;
}

function getAppointmentWeekGroups(weeksOut = 8) {
    const now = new Date();
    const start = new Date(now);
    const remainder = start.getMinutes() % 30;
    start.setMinutes(start.getMinutes() + (remainder === 0 ? 30 : 30 - remainder), 0, 0);

    const end = new Date(now);
    end.setDate(end.getDate() + weeksOut * 7);
    end.setHours(23, 59, 59, 999);

    const weeks = new Map();
    for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + 30 * 60000)) {
        if (!isValidAppointmentSlot(cursor)) continue;
        const weekStart = getWeekStart(cursor);
        const key = weekStart.toISOString().slice(0, 10);
        if (!weeks.has(key)) {
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 4);
            weeks.set(key, {
                value: key,
                label: `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
                slots: [],
            });
        }
        weeks.get(key).slots.push({
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
    return Array.from(weeks.values());
}

function findWeekForValue(weeks, value) {
    if (!value) return "";
    return weeks.find((week) => week.slots.some((slot) => slot.value === value))?.value || "";
}

function groupSlotsByDay(slots) {
    const days = new Map();
    for (const slot of slots || []) {
        const date = new Date(slot.value);
        if (Number.isNaN(date.getTime())) continue;
        const key = slot.value.slice(0, 10);
        if (!days.has(key)) {
            days.set(key, {
                value: key,
                label: date.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                }),
                slots: [],
            });
        }
        days.get(key).slots.push({
            ...slot,
            timeLabel: date.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
            }),
        });
    }
    return Array.from(days.values());
}

function findDayForValue(days, value) {
    if (!value) return "";
    return days.find((day) => day.slots.some((slot) => slot.value === value))?.value || "";
}

function pickSlotValue(slots, value) {
    if (!value) return "";
    return slots.some((slot) => slot.value === value) ? value : "";
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
