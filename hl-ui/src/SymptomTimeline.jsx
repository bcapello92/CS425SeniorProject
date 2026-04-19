import React, { useState } from "react";
import "./SymptomTimeline.css";

const translations = {
    en: {
        header: "When did your symptoms start?",
        today: "Today",
        yesterday: "Yesterday",
        thisWeek: "This Week",
        longerAgo: "Longer Ago",
        selectTime: "Select time:",
        selectTimeOfDay: "Select time of day:",
        selectDay: "Select day:",
        selectDate: "Select date:",
        morning: "Morning",
        afternoon: "Afternoon",
        evening: "Evening",
        night: "Night",
        monday: "Monday",
        tuesday: "Tuesday",
        wednesday: "Wednesday",
        thursday: "Thursday",
        friday: "Friday",
        saturday: "Saturday",
        sunday: "Sunday",
        cancel: "Cancel",
        confirm: "Confirm",
        todayAt: "Today at",
        yesterdayTime: "Yesterday",
        last: "Last"
    },
    es: {
        header: "¿Cuándo comenzaron sus síntomas?",
        today: "Hoy",
        yesterday: "Ayer",
        thisWeek: "Esta Semana",
        longerAgo: "Hace Más Tiempo",
        selectTime: "Seleccione la hora:",
        selectTimeOfDay: "Seleccione el momento del día:",
        selectDay: "Seleccione el día:",
        selectDate: "Seleccione la fecha:",
        morning: "Mañana",
        afternoon: "Tarde",
        evening: "Noche",
        night: "Madrugada",
        monday: "Lunes",
        tuesday: "Martes",
        wednesday: "Miércoles",
        thursday: "Jueves",
        friday: "Viernes",
        saturday: "Sábado",
        sunday: "Domingo",
        cancel: "Cancelar",
        confirm: "Confirmar",
        todayAt: "Hoy a las",
        yesterdayTime: "Ayer",
        last: "El"
    }
};

export default function SymptomTimeline({ onSelect, onCancel, language = 'en' }) {
    const t = translations[language];
    const [mode, setMode] = useState("today"); // today, yesterday, week, longer

    const localTodayYYYYMMDD = (() => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    })();

    const nowInit = new Date();
    const initHour24 = nowInit.getHours();
    const initPeriod = initHour24 >= 12 ? "PM" : "AM";
    const initHour = initHour24 === 0 ? 12 : (initHour24 > 12 ? initHour24 - 12 : initHour24);

    const [selectedHour, setSelectedHour] = useState(String(initHour));
    const [selectedPeriod, setSelectedPeriod] = useState(initPeriod);
    const [selectedTimeOfDay, setSelectedTimeOfDay] = useState(null);
    const [selectedDay, setSelectedDay] = useState(null);
    const [selectedDate, setSelectedDate] = useState("");

    const timeOfDayOptions = [
        { key: "Morning", label: t.morning },
        { key: "Afternoon", label: t.afternoon },
        { key: "Evening", label: t.evening },
        { key: "Night", label: t.night }
    ];
    const weekDays = [
        { key: "Monday", label: t.monday },
        { key: "Tuesday", label: t.tuesday },
        { key: "Wednesday", label: t.wednesday },
        { key: "Thursday", label: t.thursday },
        { key: "Friday", label: t.friday },
        { key: "Saturday", label: t.saturday },
        { key: "Sunday", label: t.sunday }
    ];

    const handleSubmit = () => {
        let timestamp;
        const now = new Date();

        switch (mode) {
            case "today": {
                const hour24 = selectedPeriod === "PM" && selectedHour !== "12"
                    ? parseInt(selectedHour) + 12
                    : selectedPeriod === "AM" && selectedHour === "12"
                        ? 0
                        : parseInt(selectedHour);

                timestamp = new Date(now);
                timestamp.setHours(hour24, 0, 0, 0);
                break;
            }

            case "yesterday": {
                timestamp = new Date(now);
                timestamp.setDate(timestamp.getDate() - 1);

                // Map time of day to approximate hours
                const timeMap = {
                    "Morning": 8,
                    "Afternoon": 14,
                    "Evening": 18,
                    "Night": 22
                };
                timestamp.setHours(timeMap[selectedTimeOfDay] || 12, 0, 0, 0);
                break;
            }

            case "week": {
                if (!selectedDay) return;

                // Find the most recent occurrence of selected day
                const dayKeys = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                const targetDay = dayKeys.indexOf(selectedDay);
                const currentDay = now.getDay() === 0 ? 6 : now.getDay() - 1; // Convert Sunday=0 to Monday=0
                let daysAgo = currentDay - targetDay;
                if (daysAgo <= 0) daysAgo += 7;

                timestamp = new Date(now);
                timestamp.setDate(timestamp.getDate() - daysAgo);
                timestamp.setHours(12, 0, 0, 0);
                break;
            }

            case "longer": {
                if (!selectedDate) return;
                timestamp = new Date(selectedDate);
                timestamp.setHours(12, 0, 0, 0);
                break;
            }

            default:
                return;
        }

        const humanReadable = formatHumanReadable(mode, timestamp);
        onSelect({
            timestamp: timestamp.toISOString(),
            humanReadable,
            mode
        });
    };

    const formatHumanReadable = (mode, date) => {
        switch (mode) {
            case "today":
                return `${t.todayAt} ${selectedHour}:00 ${selectedPeriod}`;
            case "yesterday":
                const timeLabel = timeOfDayOptions.find(opt => opt.key === selectedTimeOfDay)?.label || selectedTimeOfDay;
                return `${t.yesterdayTime} ${timeLabel?.toLowerCase()}`;
            case "week":
                const dayLabel = weekDays.find(d => d.key === selectedDay)?.label || selectedDay;
                return `${t.last} ${dayLabel}`;
            case "longer":
                return date.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            default:
                return "";
        }
    };

    const canSubmit = () => {
        switch (mode) {
            case "today": {
                if (!selectedHour || !selectedPeriod) return false;
                const h = parseInt(selectedHour);
                const hour24 = selectedPeriod === "PM" && h !== 12
                    ? h + 12
                    : selectedPeriod === "AM" && h === 12
                        ? 0
                        : h;
                return hour24 <= new Date().getHours();
            }
            case "yesterday": return selectedTimeOfDay !== null;
            case "week": return selectedDay !== null;
            case "longer": {
                if (!selectedDate) return false;
                // Safely compare the chosen YYYY-MM-DD strictly against the local current day
                return selectedDate <= localTodayYYYYMMDD;
            }
            default: return false;
        }
    };

    return (
        <div className="symptom-timeline-container">
            <div className="timeline-header">
                <h3>⏰ {t.header}</h3>
            </div>

            {/* Mode Tabs */}
            <div className="timeline-tabs">
                <button
                    className={mode === "today" ? "active" : ""}
                    onClick={() => setMode("today")}
                >
                    {t.today}
                </button>
                <button
                    className={mode === "yesterday" ? "active" : ""}
                    onClick={() => setMode("yesterday")}
                >
                    {t.yesterday}
                </button>
                <button
                    className={mode === "week" ? "active" : ""}
                    onClick={() => setMode("week")}
                >
                    {t.thisWeek}
                </button>
                <button
                    className={mode === "longer" ? "active" : ""}
                    onClick={() => setMode("longer")}
                >
                    {t.longerAgo}
                </button>
            </div>

            {/* Content for each mode */}
            <div className="timeline-content">
                {mode === "today" && (
                    <div className="time-picker">
                        <label>{t.selectTime}</label>
                        <div className="time-inputs">
                            <select value={selectedHour} onChange={(e) => setSelectedHour(e.target.value)}>
                                {[...Array(12)].map((_, i) => {
                                    const hour = i + 1;
                                    const hour24 = selectedPeriod === "PM" && hour !== 12
                                        ? hour + 12
                                        : (selectedPeriod === "AM" && hour === 12 ? 0 : hour);
                                    const isFuture = hour24 > new Date().getHours();
                                    return <option key={hour} value={hour} disabled={isFuture}>{hour}</option>;
                                })}
                            </select>
                            <span>:</span>
                            <span>00</span>
                            <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                                <option value="AM">AM</option>
                                <option value="PM" disabled={new Date().getHours() < 12}>PM</option>
                            </select>
                        </div>
                    </div>
                )}

                {mode === "yesterday" && (
                    <div className="time-of-day-picker">
                        <label>{t.selectTimeOfDay}</label>
                        <div className="time-buttons">
                            {timeOfDayOptions.map(time => (
                                <button
                                    key={time.key}
                                    className={selectedTimeOfDay === time.key ? "active" : ""}
                                    onClick={() => setSelectedTimeOfDay(time.key)}
                                >
                                    {time.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {mode === "week" && (
                    <div className="week-picker">
                        <label>{t.selectDay}</label>
                        <div className="day-buttons">
                            {weekDays.map(day => {
                                const targetDay = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(day.key);
                                const currentDay = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
                                const isFutureDay = targetDay > currentDay;

                                return (
                                    <button
                                        key={day.key}
                                        className={selectedDay === day.key ? "active" : ""}
                                        onClick={() => setSelectedDay(day.key)}
                                        disabled={isFutureDay}
                                    >
                                        {day.label.slice(0, 3)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {mode === "longer" && (
                    <div className="date-picker">
                        <label>{t.selectDate}</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            max={localTodayYYYYMMDD}
                        />
                    </div>
                )}
            </div>

            {/* Action buttons */}
            <div className="timeline-actions">
                <button className="cancel-btn" onClick={onCancel}>
                    {t.cancel}
                </button>
                <button
                    className="submit-btn"
                    onClick={handleSubmit}
                    disabled={!canSubmit()}
                >
                    {t.confirm}
                </button>
            </div>
        </div>
    );
}
