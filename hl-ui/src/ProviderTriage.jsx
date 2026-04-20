import { useEffect, useMemo, useState } from "react";
import { triageClient } from "./triageClient";
import { useAuth } from "./useAuth.jsx";

const EMPTY_GROUPS = { red: [], orange: [], blue: [] };

export default function ProviderTriage() {
    const { me } = useAuth();
    const [data, setData] = useState(null);
    const [hours, setHours] = useState(168);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [selectedRiskId, setSelectedRiskId] = useState(null);
    const [detail, setDetail] = useState({});
    const [flagUI, setFlagUI] = useState({});
    const [flagModal, setFlagModal] = useState(null);
    const [overrideUI, setOverrideUI] = useState({});
    const [imageResults, setImageResults] = useState({});

    const permissions = Array.isArray(me?.permissions) ? me.permissions : [];
    const canOverride = permissions.includes("triage.override");
    const groups = data?.groups || EMPTY_GROUPS;
    const items = [...groups.red, ...groups.orange, ...groups.blue];
    const selectedItem = items.find((item) => item.riskId === selectedRiskId) || null;
    const selectedState = selectedRiskId ? detail[selectedRiskId] : null;
    const selectedDetail = selectedState?.data || null;
    const selectedImages = selectedRiskId ? imageResults[selectedRiskId] : null;
    const selectedOverride = selectedRiskId ? overrideUI[selectedRiskId] : null;

    const weekGroups = useMemo(() => getAppointmentWeekGroups(8), []);
    const activeSchedule =
        flagModal?.type === "schedule" ? flagUI[flagModal.riskId]?.scheduled : null;
    const activeWeekIndex = activeSchedule?.week
        ? Math.max(0, weekGroups.findIndex((week) => week.value === activeSchedule.week))
        : 0;
    const activeWeek = weekGroups[activeWeekIndex] || weekGroups[0] || null;
    const activeDays = groupSlotsByDay(activeWeek?.slots || []);
    const activeDay = activeSchedule?.day
        ? activeDays.find((day) => day.value === activeSchedule.day) || activeDays[0] || null
        : activeDays[0] || null;
    const activeDaySlots = activeDay?.slots || [];

    useEffect(() => {
        loadBoard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function loadBoard() {
        setLoading(true);
        setErr(null);
        try {
            setData(await triageClient.getBoard({ sinceHours: hours }));
        } catch (e) {
            setData(null);
            setErr(e?.message || "Failed to load board");
        } finally {
            setLoading(false);
        }
    }

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
                [riskId]: { loading: false, error: e?.message || "Failed to load related images", data: null },
            }));
        }
    }

    async function ensureCaseLoaded(riskId) {
        if (!riskId) return;
        if (detail[riskId]) {
            if (!imageResults[riskId]) loadRelatedImages(riskId, detail[riskId]?.data?.answers || []);
            return;
        }
        setDetail((prev) => ({ ...prev, [riskId]: { loading: true, error: null, data: null } }));
        try {
            const json = await triageClient.getDetail(riskId);
            setDetail((prev) => ({ ...prev, [riskId]: { loading: false, error: null, data: json } }));
            loadRelatedImages(riskId, json?.answers || []);
        } catch (e) {
            setDetail((prev) => ({
                ...prev,
                [riskId]: { loading: false, error: e?.message || "Failed to load", data: null },
            }));
        }
    }

    function openCase(item) {
        setSelectedRiskId(item.riskId);
        ensureCaseLoaded(item.riskId);
    }

    function closeCase() {
        setSelectedRiskId(null);
    }

    function removeFromBoard(riskId) {
        setData((prev) => {
            if (!prev) return prev;
            const nextGroups = { red: [], orange: [], blue: [] };
            for (const color of ["red", "orange", "blue"]) {
                nextGroups[color] = (prev.groups?.[color] || []).filter((item) => item.riskId !== riskId);
            }
            return {
                ...prev,
                groups: nextGroups,
                counts: {
                    red: nextGroups.red.length,
                    orange: nextGroups.orange.length,
                    blue: nextGroups.blue.length,
                },
            };
        });
        if (selectedRiskId === riskId) closeCase();
    }

    async function setFlag(riskId, updates) {
        try {
            await triageClient.setFlag(riskId, updates);
            setDetail((prev) => {
                const current = prev[riskId]?.data || {};
                return {
                    ...prev,
                    [riskId]: {
                        ...(prev[riskId] || {}),
                        data: { ...current, flags: { ...(current.flags || {}), ...(updates || {}) } },
                    },
                };
            });
            const merged = { ...(detail[riskId]?.data?.flags || {}), ...(updates || {}) };
            if (merged.contacted && merged.scheduled) removeFromBoard(riskId);
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
        const appointmentLocal = new Date(ui.at);
        if (!isValidAppointmentSlot(appointmentLocal)) {
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
        await setFlag(riskId, { scheduled: true, appointmentAt: appointmentLocal.toISOString() });
        closeFlagModal();
    }

    function openOverrideEditor(item, currentColor, newColor) {
        if (!canOverride || !newColor || newColor === currentColor) return;
        setOverrideUI((prev) => ({
            ...prev,
            [item.riskId]: { open: true, color: newColor, reason: "", saving: false, error: null },
        }));
    }

    async function saveOverride(item, color, reason) {
        const riskId = item.riskId;
        setOverrideUI((prev) => ({ ...prev, [riskId]: { ...prev[riskId], saving: true, error: null } }));
        try {
            await triageClient.setOverride(riskId, color, reason);
            setDetail((prev) => {
                const current = prev[riskId]?.data || {};
                return {
                    ...prev,
                    [riskId]: {
                        ...(prev[riskId] || {}),
                        data: {
                            ...current,
                            color,
                            rationale: reason,
                            override: { color, reason, at: new Date().toISOString() },
                        },
                    },
                };
            });
            setData((prev) => {
                if (!prev) return prev;
                const nextGroups = { red: [], orange: [], blue: [] };
                for (const groupColor of ["red", "orange", "blue"]) {
                    for (const entry of prev.groups?.[groupColor] || []) {
                        if (entry.riskId !== riskId) nextGroups[groupColor].push(entry);
                    }
                }
                nextGroups[color].push({ ...item, color });
                return {
                    ...prev,
                    groups: nextGroups,
                    counts: {
                        red: nextGroups.red.length,
                        orange: nextGroups.orange.length,
                        blue: nextGroups.blue.length,
                    },
                };
            });
            setOverrideUI((prev) => ({ ...prev, [riskId]: { open: false } }));
            loadBoard();
        } catch (e) {
            setOverrideUI((prev) => ({
                ...prev,
                [riskId]: { ...prev[riskId], saving: false, error: e?.message || "Failed to set override" },
            }));
        }
    }

    return (
        <div style={styles.page}>
            <div style={styles.wrap}>
                <h1 style={{ textAlign: "center", marginBottom: 12 }}>Provider Triage Board</h1>
                <div style={styles.toolbar}>
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
                    <button onClick={loadBoard} style={styles.smallButton}>
                        {loading ? "Refreshing..." : "Refresh"}
                    </button>
                </div>

                {err ? <div style={styles.error}>Error: {err}</div> : null}
                {!err && !loading && data ? (
                    <div style={styles.summary}>
                        Since {new Date(data.since).toLocaleString()} | Severe {data.counts?.red || 0},
                        Semi-Routine {data.counts?.orange || 0}, Routine {data.counts?.blue || 0}
                    </div>
                ) : null}

                <div style={styles.columns}>
                    {["red", "orange", "blue"].map((color) => (
                        <div key={color} style={styles.column}>
                            <div style={{ ...styles.columnHeader, background: colorBg(color) }}>
                                {labelForColor(color)} ({groups[color]?.length || 0})
                            </div>
                            <div style={styles.columnBody}>
                                {(groups[color] || []).map((item) => {
                                    const flags = detail[item.riskId]?.data?.flags || {};
                                    return (
                                        <button
                                            key={item.riskId}
                                            type="button"
                                            onClick={() => openCase(item)}
                                            style={styles.caseCard}
                                        >
                                            <div style={styles.caseCardTop}>
                                                <div>
                                                    <div style={{ fontWeight: 700 }}>{item.patientName}</div>
                                                    <div style={styles.mutedText}>{item.patientId}</div>
                                                </div>
                                                <span style={{ ...styles.openPill, background: colorTint(color), color: colorBg(color) }}>
                                                    Open case
                                                </span>
                                            </div>
                                            <div style={{ ...styles.mutedText, marginTop: 10 }}>
                                                {new Date(item.date).toLocaleString()}
                                            </div>
                                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                                                <FlagBadge label={flags.contacted ? "Contacted" : "Pending contact"} active={!!flags.contacted} />
                                                <FlagBadge label={flags.scheduled ? "Scheduled" : "No appointment"} active={!!flags.scheduled} />
                                            </div>
                                        </button>
                                    );
                                })}
                                {!groups[color]?.length ? <div style={{ color: "#666", textAlign: "center", padding: 18 }}>None</div> : null}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {selectedItem ? (
                <ModalShell
                    title={`${selectedItem.patientName} Case File`}
                    subtitle={selectedDetail?.patient?.id || selectedItem.patientId}
                    onClose={closeCase}
                    width="min(1080px, 100%)"
                >
                    {!selectedState || selectedState.loading ? (
                        <div>Loading case file...</div>
                    ) : selectedState.error ? (
                        <div style={{ color: "crimson" }}>Error: {selectedState.error}</div>
                    ) : (
                        <CaseFileModal
                            item={selectedItem}
                            detail={selectedDetail}
                            imageState={selectedImages}
                            override={selectedOverride}
                            canOverride={canOverride}
                            onOpenContact={openContactModal}
                            onOpenSchedule={openScheduleModal}
                            onSetFlag={setFlag}
                            onOpenOverride={openOverrideEditor}
                            onPatchOverride={(patch) =>
                                setOverrideUI((prev) => ({
                                    ...prev,
                                    [selectedItem.riskId]: { ...(prev[selectedItem.riskId] || {}), ...patch },
                                }))
                            }
                            onSaveOverride={saveOverride}
                        />
                    )}
                </ModalShell>
            ) : null}

            {flagModal?.type === "contact" ? (
                <ModalShell title={`Mark Contacted: ${flagModal.patientName}`} onClose={closeFlagModal}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            Method:
                            <select
                                value={flagUI[flagModal.riskId]?.contact?.method || "phone"}
                                onChange={(e) =>
                                    setFlagUI((prev) => ({
                                        ...prev,
                                        [flagModal.riskId]: {
                                            ...(prev[flagModal.riskId] || {}),
                                            contact: { ...(prev[flagModal.riskId]?.contact || {}), method: e.target.value },
                                        },
                                    }))
                                }
                            >
                                <option value="phone">Phone</option>
                                <option value="email">Email</option>
                            </select>
                        </label>
                        <input
                            type="text"
                            placeholder="Optional note (e.g., left voicemail)"
                            value={flagUI[flagModal.riskId]?.contact?.note || ""}
                            onChange={(e) =>
                                setFlagUI((prev) => ({
                                    ...prev,
                                    [flagModal.riskId]: {
                                        ...(prev[flagModal.riskId] || {}),
                                        contact: { ...(prev[flagModal.riskId]?.contact || {}), note: e.target.value },
                                    },
                                }))
                            }
                            style={styles.textInput}
                        />
                    </div>
                    <div style={styles.modalActions}>
                        <button style={btn("secondary")} onClick={closeFlagModal}>Cancel</button>
                        <button
                            style={btn("primary")}
                            disabled={!!flagUI[flagModal.riskId]?.contact?.saving}
                            onClick={() => saveContactFlag(flagModal.riskId)}
                        >
                            {flagUI[flagModal.riskId]?.contact?.saving ? "Saving..." : "Save"}
                        </button>
                    </div>
                </ModalShell>
            ) : null}

            {flagModal?.type === "schedule" ? (
                <ModalShell title={`Schedule Appointment: ${flagModal.patientName}`} onClose={closeFlagModal}>
                    <div style={styles.weekNav}>
                        <button
                            style={btn("secondary")}
                            disabled={activeWeekIndex <= 0}
                            onClick={() => moveScheduleWeek(-1, flagModal.riskId, weekGroups, activeWeekIndex, setFlagUI)}
                        >
                            Previous Week
                        </button>
                        <div style={{ fontWeight: 700 }}>{activeWeek?.label || "No availability"}</div>
                        <button
                            style={btn("secondary")}
                            disabled={activeWeekIndex < 0 || activeWeekIndex >= weekGroups.length - 1}
                            onClick={() => moveScheduleWeek(1, flagModal.riskId, weekGroups, activeWeekIndex, setFlagUI)}
                        >
                            Next Week
                        </button>
                    </div>
                    <div style={{ display: "grid", gap: 12 }}>
                        <label style={styles.fieldLabel}>
                            <span style={{ fontWeight: 600 }}>Day</span>
                            <select
                                value={activeSchedule?.day || ""}
                                onChange={(e) => updateScheduleDay(e.target.value, activeDays, flagModal.riskId, setFlagUI)}
                                style={styles.select}
                            >
                                {activeDays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                            </select>
                        </label>
                        <label style={styles.fieldLabel}>
                            <span style={{ fontWeight: 600 }}>Time</span>
                            <select
                                value={activeSchedule?.at || ""}
                                onChange={(e) => updateScheduleTime(e.target.value, flagModal.riskId, setFlagUI)}
                                style={styles.select}
                            >
                                {activeDaySlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.timeLabel}</option>)}
                            </select>
                        </label>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                        Weekdays only, 8:00 AM to 4:00 PM, 30-minute intervals, up to 8 weeks out.
                    </div>
                    {flagUI[flagModal.riskId]?.scheduled?.error ? (
                        <div style={{ color: "crimson", marginTop: 10 }}>{flagUI[flagModal.riskId].scheduled.error}</div>
                    ) : null}
                    <div style={styles.modalActions}>
                        <button style={btn("secondary")} onClick={closeFlagModal}>Cancel</button>
                        <button
                            style={btn("primary")}
                            disabled={!!flagUI[flagModal.riskId]?.scheduled?.saving || !activeSchedule?.at}
                            onClick={() => saveScheduleFlag(flagModal.riskId)}
                        >
                            {flagUI[flagModal.riskId]?.scheduled?.saving ? "Saving..." : "Save"}
                        </button>
                    </div>
                </ModalShell>
            ) : null}
        </div>
    );
}

function CaseFileModal({
    item,
    detail,
    imageState,
    override,
    canOverride,
    onOpenContact,
    onOpenSchedule,
    onSetFlag,
    onOpenOverride,
    onPatchOverride,
    onSaveOverride,
}) {
    const flags = detail?.flags || {};
    const color = detail?.color || item?.color || "blue";

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <div style={styles.topGrid}>
                <CaseSection title="Triage Rating">
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ ...styles.ratingPill, background: colorBg(color) }}>{labelForColor(color)}</span>
                        <span style={styles.mutedText}>
                            Created {detail?.date ? new Date(detail.date).toLocaleString() : "Unknown"}
                        </span>
                    </div>
                </CaseSection>
                <CaseSection title="Patient">
                    <InfoRow label="Patient ID" value={detail?.patient?.id || item.patientId} />
                    <InfoRow label="DOB" value={detail?.patient?.birthDate || "Unavailable"} />
                </CaseSection>
            </div>

            <CaseSection title="Patient History">
                {detail?.patientHistory?.hasHistory ? (
                    <div style={{ display: "grid", gap: 8 }}>
                        <InfoRow
                            label="Last scheduled"
                            value={
                                detail?.patientHistory?.lastScheduledAt
                                    ? new Date(detail.patientHistory.lastScheduledAt).toLocaleString()
                                    : detail?.patientHistory?.lastVisit || "Unavailable"
                            }
                        />
                        <InfoRow
                            label="Last triage"
                            value={[
                                detail?.patientHistory?.lastTriageColor
                                    ? labelForColor(detail.patientHistory.lastTriageColor)
                                    : null,
                                detail?.patientHistory?.lastTriageDate
                                    ? new Date(detail.patientHistory.lastTriageDate).toLocaleString()
                                    : null,
                            ].filter(Boolean).join(" • ") || "Unavailable"}
                        />
                        <InfoRow
                            label="Last reasoning"
                            value={detail?.patientHistory?.lastTriageRationale || "No prior triage reasoning recorded"}
                        />
                        <InfoRow
                            label="Conditions"
                            value={(detail?.patientHistory?.conditions || []).join(", ") || "None recorded"}
                        />
                        <InfoRow
                            label="Medications"
                            value={(detail?.patientHistory?.medications || []).join(", ") || "None recorded"}
                        />
                        <InfoRow
                            label="Allergies"
                            value={(detail?.patientHistory?.allergies || []).join(", ") || "None recorded"}
                        />
                        <InfoRow label="Notes" value={detail?.patientHistory?.notes || "No additional notes"} />
                        {!!detail?.patientHistory?.triageHistory?.length && (
                            <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                                <div style={styles.summaryLabel}>Recent HealthLake Triage History</div>
                                {detail.patientHistory.triageHistory.map((entry) => (
                                    <div key={entry.observationId || entry.date} style={styles.answerCard}>
                                        <div style={{ fontWeight: 700, marginBottom: 4 }}>
                                            {entry.color ? labelForColor(entry.color) : "Triage"}{" "}
                                            {entry.date ? `• ${new Date(entry.date).toLocaleString()}` : ""}
                                        </div>
                                        {entry.appointmentAt ? (
                                            <div style={{ color: "#334155", marginBottom: 4 }}>
                                                Scheduled: {new Date(entry.appointmentAt).toLocaleString()}
                                            </div>
                                        ) : null}
                                        <div style={{ color: "#334155" }}>
                                            {entry.rationale || "No rationale recorded."}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={styles.mutedText}>
                        No prior patient history on file for this patient.
                    </div>
                )}
            </CaseSection>

            <CaseSection title="Triage Reasoning">
                <div style={styles.readableText}>{detail?.rationale || "No rationale provided for this case."}</div>
            </CaseSection>

            <div style={styles.midGrid}>
                <CaseSection title="Triage Summary">
                    <div style={{ display: "grid", gap: 12 }}>
                        {detail?.answers?.length ? (
                            <div style={{ display: "grid", gap: 8 }}>
                                <div style={styles.summaryLabel}>Intake Details</div>
                                {detail.answers.map((answer) => (
                                    <div key={`${answer.linkId || answer.text}-${answer.answer}`} style={styles.answerCard}>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{answer.text}</div>
                                        <div style={{ color: "#334155" }}>{answer.answer}</div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </CaseSection>
                <CaseSection title="Model Accuracy">
                    <div style={styles.accuracyValue}>{formatModelAccuracy(detail?.modelAccuracy)}</div>
                    <div style={styles.mutedText}>
                        Stored model metric for this case. Displays "Unavailable" when the backend did not persist one.
                    </div>
                </CaseSection>
            </div>

            <CaseSection title="Flags">
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={styles.checkboxRow}>
                        <input
                            type="checkbox"
                            checked={!!flags.contacted}
                            onChange={(e) => {
                                if (!e.target.checked) {
                                    onSetFlag(item.riskId, {
                                        contacted: false,
                                        contactMethod: null,
                                        contactNote: null,
                                        contactedAt: null,
                                    });
                                    return;
                                }
                                onOpenContact(item);
                            }}
                        />
                        Contacted
                    </label>
                    <label style={styles.checkboxRow}>
                        <input
                            type="checkbox"
                            checked={!!flags.scheduled}
                            onChange={(e) => {
                                if (!e.target.checked) {
                                    onSetFlag(item.riskId, { scheduled: false, appointmentAt: null });
                                    return;
                                }
                                onOpenSchedule(item, detail);
                            }}
                        />
                        Scheduled
                    </label>
                </div>
                <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
                    <InfoRow label="Contact method" value={flags.contactMethod || "Not contacted"} />
                    <InfoRow label="Contact note" value={flags.contactNote || "No note"} />
                    <InfoRow
                        label="Appointment"
                        value={flags.appointmentAt ? new Date(flags.appointmentAt).toLocaleString() : "No appointment set"}
                    />
                </div>
            </CaseSection>

            <CaseSection title="Change Triage Rating">
                {canOverride ? (
                    <>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={styles.selectedLevelPill}>
                                Selected: {labelForColor(color)}
                            </span>
                            <select
                                value={color}
                                onChange={(e) => onOpenOverride(item, color, e.target.value)}
                                style={styles.select}
                            >
                                <option value="red">Severe (Red)</option>
                                <option value="orange">Semi-Routine (Orange)</option>
                                <option value="blue">Routine (Blue)</option>
                            </select>
                            <span style={styles.mutedText}>
                                {detail?.override?.at ? `Last override ${new Date(detail.override.at).toLocaleString()}` : "No manual override recorded"}
                            </span>
                        </div>
                        {override?.open ? (
                            <div style={styles.overrideBox}>
                                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                                    Override to {labelForColor(override.color)}
                                </div>
                                <textarea
                                    rows={3}
                                    placeholder="Reason for override (required)"
                                    value={override.reason || ""}
                                    onChange={(e) => onPatchOverride({ reason: e.target.value, error: null })}
                                    style={styles.textarea}
                                />
                                {override.error ? <div style={{ color: "crimson", marginTop: 8 }}>{override.error}</div> : null}
                                <div style={styles.modalActions}>
                                    <button style={btn("secondary")} onClick={() => onPatchOverride({ open: false })}>Cancel</button>
                                    <button
                                        style={btn("primary")}
                                        disabled={!!override.saving}
                                        onClick={() => {
                                            const reason = (override.reason || "").trim();
                                            if (!reason) {
                                                onPatchOverride({ error: "Reason is required." });
                                                return;
                                            }
                                            onSaveOverride(item, override.color, reason);
                                        }}
                                    >
                                        {override.saving ? "Saving..." : "Save override"}
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <div style={styles.lockedNotice}>
                        Your membership can review this case, but only members with clinical override access can change the triage rating.
                    </div>
                )}
            </CaseSection>

            <CaseSection title="Relevant Images">
                <div style={styles.imageDisclaimer}>
                    These images are visual references only. They are not the patient's images and do not confirm a diagnosis.
                </div>
                {!imageState || imageState.loading ? (
                    <div style={styles.mutedText}>Loading related images...</div>
                ) : imageState.error ? (
                    <div style={{ color: "crimson" }}>{imageState.error}</div>
                ) : !(imageState.data?.images || []).length ? (
                    <div style={styles.mutedText}>No matching images found.</div>
                ) : (
                    <>
                        {imageState.data?.note || hasVisibleFields(imageState.data?.query) ? (
                            <div style={styles.queryBox}>
                                {imageState.data?.note ? <div style={{ fontSize: 12, marginBottom: 8 }}><b>Note:</b> {imageState.data.note}</div> : null}
                                {hasVisibleFields(imageState.data?.query) ? (
                                    <div style={{ fontSize: 12 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Query details</div>
                                        {renderFieldList(imageState.data.query)}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        <div style={styles.imagesGrid}>
                            {(imageState.data.images || []).map((img, idx) => (
                                <div key={`${item.riskId}-img-${idx}`} style={styles.imageCard}>
                                    {img.imageUrl ? (
                                        <a href={img.imageUrl} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                                            <img
                                                src={img.imageUrl}
                                                alt={img.label || img.imageName || "related result"}
                                                style={styles.image}
                                            />
                                        </a>
                                    ) : null}
                                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8, marginBottom: 6 }}>
                                        {img.label || img.imageName || `Image ${idx + 1}`}
                                    </div>
                                    {renderFieldList(img)}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </CaseSection>
        </div>
    );
}

function ModalShell({ title, subtitle, children, onClose, width = "min(760px, 100%)" }) {
    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                onClose();
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div onClick={onClose} style={styles.backdrop}>
            <div onClick={(e) => e.stopPropagation()} style={{ ...styles.modal, width }}>
                <div style={styles.modalHeader}>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 20 }}>{title}</div>
                        {subtitle ? <div style={styles.mutedText}>{subtitle}</div> : null}
                    </div>
                    <button style={btn("secondary")} onClick={onClose}>Close</button>
                </div>
                {children}
            </div>
        </div>
    );
}

function CaseSection({ title, children }) {
    return (
        <section style={styles.section}>
            <div style={styles.sectionTitle}>{title}</div>
            {children}
        </section>
    );
}

function FlagBadge({ label, active }) {
    return <span style={{ ...styles.badge, ...(active ? styles.badgeActive : styles.badgeIdle) }}>{label}</span>;
}

function InfoRow({ label, value }) {
    return (
        <div style={styles.infoRow}>
            <div style={styles.infoLabel}>{label}</div>
            <div style={{ color: "#0f172a", wordBreak: "break-word" }}>{value}</div>
        </div>
    );
}

function moveScheduleWeek(direction, riskId, weekGroups, activeWeekIndex, setFlagUI) {
    const targetWeek = weekGroups[activeWeekIndex + direction];
    if (!targetWeek) return;
    const groupedDays = groupSlotsByDay(targetWeek.slots);
    setFlagUI((prev) => ({
        ...prev,
        [riskId]: {
            ...(prev[riskId] || {}),
            scheduled: {
                ...(prev[riskId]?.scheduled || {}),
                week: targetWeek.value,
                day: groupedDays[0]?.value || "",
                at: groupedDays[0]?.slots?.[0]?.value || "",
                error: null,
            },
        },
    }));
}

function updateScheduleDay(day, activeDays, riskId, setFlagUI) {
    const slots = activeDays.find((entry) => entry.value === day)?.slots || [];
    setFlagUI((prev) => ({
        ...prev,
        [riskId]: {
            ...(prev[riskId] || {}),
            scheduled: {
                ...(prev[riskId]?.scheduled || {}),
                day,
                at: slots[0]?.value || "",
                error: null,
            },
        },
    }));
}

function updateScheduleTime(at, riskId, setFlagUI) {
    setFlagUI((prev) => ({
        ...prev,
        [riskId]: {
            ...(prev[riskId] || {}),
            scheduled: {
                ...(prev[riskId]?.scheduled || {}),
                at,
                error: null,
            },
        },
    }));
}

function colorBg(c) {
    if (c === "red") return "#dc2626";
    if (c === "orange") return "#ea580c";
    return "#1e40af";
}

function colorTint(c) {
    if (c === "red") return "#fee2e2";
    if (c === "orange") return "#ffedd5";
    return "#dbeafe";
}

function labelForColor(c) {
    if (c === "red") return "Severe";
    if (c === "orange") return "Semi-Routine";
    return "Routine";
}

function formatModelAccuracy(value) {
    if (value === null || value === undefined || value === "") return "Unavailable";
    if (typeof value === "number") return `${Math.round((value > 0 && value <= 1 ? value * 100 : value))}%`;
    return String(value);
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
        weeks.get(key).slots.push({ value: toDateTimeLocalValue(cursor), label: cursor.toISOString() });
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
                label: date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
                slots: [],
            });
        }
        days.get(key).slots.push({
            ...slot,
            timeLabel: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
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

function hasVisibleFields(value) {
    return Object.entries(value || {}).some(([, fieldValue]) => {
        if (fieldValue === null || fieldValue === undefined || fieldValue === "") return false;
        if (Array.isArray(fieldValue)) return fieldValue.length > 0;
        return true;
    });
}

function renderFieldList(value) {
    const entries = Object.entries(value || {}).filter(([, fieldValue]) => {
        if (fieldValue === null || fieldValue === undefined || fieldValue === "") return false;
        if (Array.isArray(fieldValue)) return fieldValue.length > 0;
        return true;
    });
    if (!entries.length) return <div style={{ fontSize: 12, color: "#666" }}>No additional details.</div>;
    return (
        <div style={{ display: "grid", gap: 4 }}>
            {entries.map(([key, fieldValue]) => (
                <div key={key} style={{ fontSize: 12, lineHeight: 1.4, wordBreak: "break-word" }}>
                    <b>{formatFieldLabel(key)}:</b>{" "}
                    {typeof fieldValue === "string" && /^https?:\/\//i.test(fieldValue) ? (
                        <a href={fieldValue} target="_blank" rel="noreferrer">{fieldValue}</a>
                    ) : typeof fieldValue === "object" ? (
                        JSON.stringify(fieldValue)
                    ) : (
                        String(fieldValue)
                    )}
                </div>
            ))}
        </div>
    );
}

function formatFieldLabel(value) {
    return String(value || "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/^./, (char) => char.toUpperCase());
}

function btn(kind) {
    const base = { padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer", fontSize: 13 };
    return kind === "primary" ? { ...base, background: "#e7f3ff" } : { ...base, background: "#fff" };
}

const styles = {
    page: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: 24, background: "#f5f7fb" },
    wrap: { width: "min(1240px, 100%)", margin: "0 auto" },
    toolbar: { display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" },
    smallButton: { padding: "6px 10px", borderRadius: 8 },
    error: { color: "crimson", marginBottom: 12, textAlign: "center" },
    summary: { marginBottom: 16, color: "#555", textAlign: "center" },
    columns: { display: "grid", gridTemplateColumns: "repeat(3, minmax(300px, 1fr))", gap: 16 },
    column: { border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden", background: "#fff", boxShadow: "0 12px 36px rgba(15, 23, 42, 0.06)" },
    columnHeader: { padding: "12px 14px", color: "#fff", fontWeight: 700, textAlign: "center" },
    columnBody: { padding: 12, maxHeight: 560, overflow: "auto" },
    caseCard: { width: "100%", textAlign: "left", padding: 14, marginBottom: 10, borderRadius: 14, border: "1px solid #e5e7eb", background: "#f8fafc", cursor: "pointer" },
    caseCardTop: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
    mutedText: { fontSize: 12, color: "#64748b" },
    openPill: { padding: "4px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 },
    backdrop: { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1000 },
    modal: { maxHeight: "calc(100vh - 48px)", overflow: "auto", background: "#fff", borderRadius: 20, boxShadow: "0 24px 80px rgba(15, 23, 42, 0.24)", padding: 20 },
    modalHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 },
    section: { border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", padding: 16 },
    sectionTitle: { fontWeight: 800, fontSize: 16, marginBottom: 12 },
    badge: { display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 },
    badgeActive: { background: "#dcfce7", color: "#166534" },
    badgeIdle: { background: "#e2e8f0", color: "#475569" },
    infoRow: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, fontSize: 14, marginBottom: 6 },
    infoLabel: { color: "#64748b", fontWeight: 600 },
    topGrid: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 },
    midGrid: { display: "grid", gridTemplateColumns: "1.45fr 0.9fr", gap: 14, alignItems: "start" },
    ratingPill: { display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: 999, color: "#fff", fontWeight: 700 },
    readableText: { margin: 0, lineHeight: 1.6, color: "#0f172a" },
    transcript: { whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14, color: "#0f172a", maxHeight: 240, overflow: "auto" },
    accuracyValue: { fontSize: 28, fontWeight: 800, color: "#0f172a" },
    summaryLabel: { fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 },
    answerCard: { padding: "10px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" },
    checkboxRow: { display: "flex", alignItems: "center", gap: 6 },
    overrideBox: { marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #e2e8f0", background: "#f8fafc" },
    selectedLevelPill: { display: "inline-flex", alignItems: "center", padding: "8px 12px", borderRadius: 999, background: "#e2e8f0", color: "#0f172a", fontWeight: 700, fontSize: 13 },
    lockedNotice: { padding: "12px 14px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569" },
    imageDisclaimer: { fontSize: 12, color: "#991b1b", background: "#fff1f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px", marginBottom: 10 },
    queryBox: { border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff", marginBottom: 10 },
    imagesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 },
    imageCard: { border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" },
    image: { width: "100%", height: 132, objectFit: "cover", borderRadius: 8, background: "#f1f5f9" },
    textInput: { flex: 1, minWidth: 220, padding: 8, borderRadius: 8, border: "1px solid #ddd" },
    modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 },
    weekNav: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 },
    fieldLabel: { display: "grid", gap: 6 },
    select: { width: "100%", padding: 8, borderRadius: 8, border: "1px solid #cbd5e1", minWidth: 220 },
    textarea: { width: "100%", padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", resize: "vertical" },
};
