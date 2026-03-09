import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { triageClient } from "./triageClient";

const START_HOUR = 8;
const END_HOUR = 17;
const SLOT_MINUTES = 30;
const DESKTOP_ROW_HEIGHT = 56;

export default function ProviderSchedule() {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [draggingRiskId, setDraggingRiskId] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [savingRiskId, setSavingRiskId] = useState(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 980 : false
  );

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 980);
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSchedule() {
      try {
        setLoading(true);
        setError("");
        const json = await triageClient.getScheduleWeek({
          start: formatDateKey(weekStart),
        });
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError(e?.message || "Failed to load schedule.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSchedule();
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const days = data?.days || buildEmptyDays(weekStart);
  const total = data?.total ?? 0;
  const weekLabel = useMemo(() => formatWeekLabel(weekStart), [weekStart]);

  async function moveAppointment(riskId, nextLocalDate) {
    if (!data) return;

    const nextIso = nextLocalDate.toISOString();
    const previousData = data;
    const nextData = updateAppointmentInSchedule(data, riskId, nextIso);
    if (!nextData) return;

    setData(nextData);
    setSavingRiskId(riskId);
    setError("");

    try {
      await triageClient.setFlag(riskId, {
        scheduled: true,
        appointmentAt: nextIso,
      });
    } catch (e) {
      setData(previousData);
      setError(e?.message || "Failed to reschedule appointment.");
    } finally {
      setSavingRiskId(null);
      setDraggingRiskId(null);
      setDragTarget(null);
    }
  }

  return (
    <div style={page}>
      <div style={hero}>
        <div>
          <div style={eyebrow}>Provider Scheduling</div>
          <h1 style={title}>Weekly calendar</h1>
          <p style={subtitle}>
            Scheduled triage appointments flow here automatically from the triage board once
            `appointmentAt` is saved.
          </p>
          <p style={hintText}>
            Drag an appointment card to another day or half-hour slot to reschedule it.
          </p>
        </div>

        <div style={heroActions}>
          <button type="button" style={secondaryBtn} onClick={() => navigate("/provider/triage")}>
            Open triage board
          </button>
        </div>
      </div>

      <div style={toolbar}>
        <div style={toolbarLeft}>
          <button type="button" style={navBtn} onClick={() => shiftWeek(setWeekStart, -7)}>
            Previous week
          </button>
          <button type="button" style={navBtn} onClick={() => setWeekStart(startOfWeek(new Date()))}>
            This week
          </button>
          <button type="button" style={navBtn} onClick={() => shiftWeek(setWeekStart, 7)}>
            Next week
          </button>
        </div>

        <div style={toolbarRight}>
          <div style={weekBadge}>{weekLabel}</div>
          <div style={countBadge}>{total} scheduled</div>
        </div>
      </div>

      {error ? <div style={errorCard}>Error: {error}</div> : null}

      <div style={calendarShell}>
        {isMobile ? (
          <MobileAgenda days={days} loading={loading} />
        ) : (
          <DesktopWeekGrid
            days={days}
            loading={loading}
            draggingRiskId={draggingRiskId}
            dragTarget={dragTarget}
            savingRiskId={savingRiskId}
            onAppointmentDragStart={setDraggingRiskId}
            onAppointmentDragEnd={() => {
              setDraggingRiskId(null);
              setDragTarget(null);
            }}
            onDayDragOver={(dateKey, event) => {
              if (!draggingRiskId) return;
              event.preventDefault();
              setDragTarget({
                date: dateKey,
                slotIndex: getSlotIndexFromPointer(event.currentTarget, event.clientY),
              });
            }}
            onDayDragLeave={(dateKey, event) => {
              if (!draggingRiskId) return;
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setDragTarget((prev) => (prev?.date === dateKey ? null : prev));
              }
            }}
            onDayDrop={async (dateKey, event) => {
              if (!draggingRiskId) return;
              event.preventDefault();
              const slotIndex = getSlotIndexFromPointer(event.currentTarget, event.clientY);
              await moveAppointment(draggingRiskId, getDateForSlot(dateKey, slotIndex));
            }}
          />
        )}
      </div>
    </div>
  );
}

function DesktopWeekGrid({
  days,
  loading,
  draggingRiskId,
  dragTarget,
  savingRiskId,
  onAppointmentDragStart,
  onAppointmentDragEnd,
  onDayDragOver,
  onDayDragLeave,
  onDayDrop,
}) {
  return (
    <div>
      <div style={gridShell}>
        <div style={timeHeaderCell} />
        {days.map((day) => (
          <div key={day.date} style={dayHeaderCell}>
            <div style={dayHeaderDow}>{formatDayName(day.date)}</div>
            <div style={dayHeaderDate}>{formatDayNumber(day.date)}</div>
            <div style={dayHeaderCount}>{day.appointments.length} appt</div>
          </div>
        ))}

        <div style={timeRail}>
          {buildHourRows().map((hour) => (
            <div key={hour} style={timeCell}>
              {formatHour(hour)}
            </div>
          ))}
        </div>

        {days.map((day) => (
          <div
            key={day.date}
            style={dayColumn}
            onDragOver={(event) => onDayDragOver(day.date, event)}
            onDragLeave={(event) => onDayDragLeave(day.date, event)}
            onDrop={(event) => void onDayDrop(day.date, event)}
          >
            {buildHourRows().map((hour) => (
              <div key={hour} style={hourSlot} />
            ))}

            {dragTarget?.date === day.date ? (
              <div
                style={{
                  ...dropIndicator,
                  top: getSlotTop(dragTarget.slotIndex),
                }}
              />
            ) : null}

            {day.appointments.map((item) => (
              <AppointmentBlock
                key={item.riskId}
                item={item}
                isDragging={draggingRiskId === item.riskId}
                isSaving={savingRiskId === item.riskId}
                onDragStart={() => onAppointmentDragStart(item.riskId)}
                onDragEnd={onAppointmentDragEnd}
              />
            ))}

            {!loading && day.appointments.length === 0 ? (
              <div style={emptyDay}>Open</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileAgenda({ days, loading }) {
  return (
    <div>
      {days.map((day) => (
        <section key={day.date} style={mobileDayCard}>
          <div style={mobileDayHeader}>
            <div>
              <div style={mobileDayTitle}>{formatLongDay(day.date)}</div>
              <div style={mobileDayMeta}>{day.appointments.length} scheduled</div>
            </div>
          </div>

          <div style={mobileHint}>Desktop drag and drop is enabled on larger screens.</div>

          {loading ? <div style={agendaEmpty}>Loading...</div> : null}

          {!loading && day.appointments.length === 0 ? (
            <div style={agendaEmpty}>No appointments scheduled.</div>
          ) : null}

          {!loading && day.appointments.length > 0
            ? day.appointments.map((item) => (
                <div key={item.riskId} style={agendaCard}>
                  <div style={agendaTop}>
                    <span style={chip(item.color)}>{labelForColor(item.color)}</span>
                    <span style={agendaTime}>{formatTime(item.appointmentAt)}</span>
                  </div>
                  <div style={agendaName}>{item.patientName}</div>
                  <div style={agendaMeta}>
                    Patient {item.patientId} | Case {item.riskId}
                  </div>
                </div>
              ))
            : null}
        </section>
      ))}
    </div>
  );
}

function AppointmentBlock({ item, isDragging, isSaving, onDragStart, onDragEnd }) {
  const startDate = new Date(item.appointmentAt);
  const minutes = startDate.getHours() * 60 + startDate.getMinutes();
  const clampedStart = clampMinutes(minutes);
  const top = ((clampedStart - START_HOUR * 60) / SLOT_MINUTES) * (DESKTOP_ROW_HEIGHT / 2);

  return (
    <div
      draggable={!isSaving}
      style={{
        ...appointmentCard,
        top,
        opacity: isDragging ? 0.45 : 1,
        cursor: isSaving ? "progress" : "grab",
        borderLeft: `4px solid ${colorBg(item.color)}`,
        background: colorTint(item.color),
      }}
      title={`${item.patientName} at ${formatTime(item.appointmentAt)}`}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div style={appointmentTime}>
        {formatTime(item.appointmentAt)}
        {isSaving ? " | Saving" : ""}
      </div>
      <div style={appointmentName}>{item.patientName}</div>
      <div style={appointmentMeta}>
        {item.patientId} | {labelForColor(item.color)}
      </div>
    </div>
  );
}

function shiftWeek(setter, days) {
  setter((prev) => {
    const next = new Date(prev);
    next.setDate(prev.getDate() + days);
    return startOfWeek(next);
  });
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function buildEmptyDays(start) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      date: formatDateKey(day),
      appointments: [],
    };
  });
}

function buildHourRows() {
  return Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index);
}

function buildSlotCount() {
  return ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;
}

function formatDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function clampMinutes(minutes) {
  const min = START_HOUR * 60;
  const max = END_HOUR * 60 - SLOT_MINUTES;
  return Math.max(min, Math.min(minutes, max));
}

function getSlotIndexFromPointer(columnElement, clientY) {
  const rect = columnElement.getBoundingClientRect();
  const slotHeight = DESKTOP_ROW_HEIGHT / 2;
  const relativeY = Math.max(0, Math.min(clientY - rect.top, rect.height - 1));
  return Math.max(0, Math.min(buildSlotCount() - 1, Math.floor(relativeY / slotHeight)));
}

function getDateForSlot(dateKey, slotIndex) {
  const date = new Date(`${dateKey}T00:00:00`);
  const totalMinutes = START_HOUR * 60 + slotIndex * SLOT_MINUTES;
  date.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return date;
}

function getSlotTop(slotIndex) {
  return slotIndex * (DESKTOP_ROW_HEIGHT / 2);
}

function updateAppointmentInSchedule(scheduleData, riskId, nextIso) {
  if (!scheduleData) return null;

  const nextAppointments = (scheduleData.appointments || []).map((item) =>
    item.riskId === riskId ? { ...item, appointmentAt: nextIso } : item
  );

  if (!nextAppointments.some((item) => item.riskId === riskId)) {
    return scheduleData;
  }

  nextAppointments.sort((a, b) => {
    const diff = new Date(a.appointmentAt).getTime() - new Date(b.appointmentAt).getTime();
    if (diff !== 0) return diff;
    return String(a.patientName || "").localeCompare(String(b.patientName || ""));
  });

  const nextDays = (scheduleData.days || []).map((day) => ({
    ...day,
    appointments: nextAppointments.filter((item) => item.appointmentAt.slice(0, 10) === day.date),
  }));

  return {
    ...scheduleData,
    appointments: nextAppointments,
    days: nextDays,
  };
}

function formatWeekLabel(date) {
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(start.getDate() + 6);
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startLabel} - ${endLabel}`;
}

function formatDayName(dateKey) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
}

function formatDayNumber(dateKey) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatLongDay(dateKey) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatHour(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function colorBg(color) {
  if (color === "red") return "#c2410c";
  if (color === "orange") return "#ea580c";
  return "#1e40af";
}

function colorTint(color) {
  if (color === "red") return "#fff1f2";
  if (color === "orange") return "#fff7ed";
  return "#eff6ff";
}

function labelForColor(color) {
  if (color === "red") return "Severe";
  if (color === "orange") return "Semi-Routine";
  return "Routine";
}

function chip(color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: 999,
    background: colorTint(color),
    border: `1px solid ${colorBg(color)}`,
    color: colorBg(color),
    fontSize: 11,
    fontWeight: 800,
  };
}

const page = {
  minHeight: "100vh",
  background:
    "linear-gradient(180deg, rgba(234,244,255,0.9) 0%, rgba(246,248,251,1) 22%, rgba(255,255,255,1) 100%)",
  padding: "8px 0 32px",
};

const hero = {
  maxWidth: 1240,
  margin: "0 auto 18px",
  padding: "28px 18px 0",
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const eyebrow = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.1,
  textTransform: "uppercase",
  color: "#0f766e",
  marginBottom: 10,
};

const title = {
  margin: 0,
  fontSize: 34,
  lineHeight: 1,
  color: "#0f172a",
};

const subtitle = {
  marginTop: 12,
  maxWidth: 700,
  fontSize: 15,
  lineHeight: 1.5,
  color: "#475569",
};

const hintText = {
  marginTop: 10,
  marginBottom: 0,
  fontSize: 13,
  color: "#0f766e",
  fontWeight: 700,
};

const heroActions = {
  display: "flex",
  gap: 10,
  alignItems: "center",
};

const secondaryBtn = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  fontWeight: 800,
  cursor: "pointer",
};

const toolbar = {
  maxWidth: 1240,
  margin: "0 auto 18px",
  padding: "0 18px",
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
  flexWrap: "wrap",
};

const toolbarLeft = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const toolbarRight = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const navBtn = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #dbe5f4",
  background: "#ffffff",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer",
};

const weekBadge = {
  padding: "10px 14px",
  borderRadius: 999,
  background: "#0f172a",
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 800,
};

const countBadge = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #bae6fd",
  background: "#f0f9ff",
  color: "#0c4a6e",
  fontSize: 13,
  fontWeight: 800,
};

const errorCard = {
  maxWidth: 1240,
  margin: "0 auto 18px",
  padding: "12px 18px",
  borderRadius: 16,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  fontWeight: 700,
};

const calendarShell = {
  maxWidth: 1240,
  margin: "0 auto",
  padding: "0 18px",
};

const gridShell = {
  display: "grid",
  gridTemplateColumns: "88px repeat(7, minmax(150px, 1fr))",
  border: "1px solid #dbe5f4",
  borderRadius: 26,
  overflow: "hidden",
  background: "#ffffff",
  boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
};

const timeHeaderCell = {
  background: "#eff6ff",
  borderBottom: "1px solid #dbe5f4",
};

const dayHeaderCell = {
  padding: "14px 12px",
  background: "#eff6ff",
  borderLeft: "1px solid #dbe5f4",
  borderBottom: "1px solid #dbe5f4",
};

const dayHeaderDow = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  color: "#0369a1",
};

const dayHeaderDate = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 900,
  color: "#0f172a",
};

const dayHeaderCount = {
  marginTop: 6,
  fontSize: 12,
  color: "#64748b",
};

const timeRail = {
  display: "grid",
  gridAutoRows: `${DESKTOP_ROW_HEIGHT}px`,
  background: "#f8fafc",
};

const timeCell = {
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 700,
  color: "#64748b",
  borderBottom: "1px solid #edf2f7",
};

const dayColumn = {
  position: "relative",
  display: "grid",
  gridAutoRows: `${DESKTOP_ROW_HEIGHT}px`,
  borderLeft: "1px solid #edf2f7",
  background:
    "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(248,250,252,0.65) 100%)",
  minHeight: `${(END_HOUR - START_HOUR) * DESKTOP_ROW_HEIGHT}px`,
};

const hourSlot = {
  borderBottom: "1px solid #edf2f7",
};

const appointmentCard = {
  position: "absolute",
  left: 8,
  right: 8,
  minHeight: 44,
  padding: "8px 10px",
  borderRadius: 16,
  boxShadow: "0 10px 18px rgba(15, 23, 42, 0.08)",
  overflow: "hidden",
  zIndex: 2,
};

const dropIndicator = {
  position: "absolute",
  left: 6,
  right: 6,
  height: 24,
  borderRadius: 12,
  background: "rgba(14, 165, 233, 0.18)",
  border: "2px dashed #0ea5e9",
  pointerEvents: "none",
  zIndex: 1,
};

const appointmentTime = {
  fontSize: 12,
  fontWeight: 900,
  color: "#0f172a",
};

const appointmentName = {
  marginTop: 4,
  fontSize: 13,
  fontWeight: 800,
  color: "#0f172a",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const appointmentMeta = {
  marginTop: 4,
  fontSize: 11,
  color: "#475569",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const emptyDay = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 12,
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px dashed #cbd5e1",
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "center",
  background: "rgba(255,255,255,0.85)",
};

const mobileDayCard = {
  borderRadius: 20,
  border: "1px solid #dbe5f4",
  background: "#ffffff",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.06)",
  padding: 16,
  marginBottom: 14,
};

const mobileDayHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
};

const mobileDayTitle = {
  fontSize: 18,
  fontWeight: 900,
  color: "#0f172a",
};

const mobileDayMeta = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748b",
};

const mobileHint = {
  marginBottom: 10,
  fontSize: 12,
  color: "#0f766e",
  fontWeight: 700,
};

const agendaEmpty = {
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  padding: 14,
  color: "#64748b",
  fontWeight: 700,
};

const agendaCard = {
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: 14,
  background: "#fcfdff",
  marginTop: 10,
};

const agendaTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
};

const agendaTime = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0f172a",
};

const agendaName = {
  marginTop: 10,
  fontSize: 15,
  fontWeight: 800,
  color: "#0f172a",
};

const agendaMeta = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748b",
};
