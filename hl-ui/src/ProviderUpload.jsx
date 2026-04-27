import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { API_BASE } from "./config.js";
import { getPdfUrl, listPatientPdfs } from "./ollamaChatClient";
import pdfWorkerSrc from "react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export default function ProviderUpload() {
  const [searchParams] = useSearchParams();
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState("");
  const [query, setQuery] = useState("");

  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientPdfs, setPatientPdfs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState("");

  const [pdfUrl, setPdfUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.1);
  const requestedPatientId = searchParams.get("patientId") || "";

  useEffect(() => {
    let cancelled = false;

    async function loadPatients() {
      try {
        setPatientsLoading(true);
        setPatientsError("");
        const res = await fetch(`${API_BASE}/api/patients?count=100`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }

        const entries = Array.isArray(data?.entry) ? data.entry : [];
        const normalized = entries
          .map((entry) => normalizePatient(entry?.resource))
          .filter(Boolean);

        if (!cancelled) {
          setPatients(normalized);
          const requestedPatient = requestedPatientId
            ? normalized.find((patient) => patient.id === requestedPatientId)
            : null;
          if (requestedPatientId) {
            setQuery(requestedPatientId);
          }
          if (requestedPatient) {
            setSelectedPatient(requestedPatient);
          } else if (normalized.length > 0) {
            setSelectedPatient(normalized[0]);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setPatientsError(error?.message || "Failed to load patients.");
        }
      } finally {
        if (!cancelled) {
          setPatientsLoading(false);
        }
      }
    }

    loadPatients();
    return () => {
      cancelled = true;
    };
  }, [requestedPatientId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPatientDocs() {
      if (!selectedPatient?.id) {
        setPatientPdfs([]);
        setDocsError("");
        return;
      }

      try {
        setDocsLoading(true);
        setDocsError("");
        setPatientPdfs([]);
        setPdfUrl(null);
        setFileName("");
        setNumPages(null);
        setPageNumber(1);

        const pdfs = await listPatientPdfs(selectedPatient.id);
        if (!cancelled) {
          setPatientPdfs(pdfs);
          if (pdfs.length > 0) {
            const firstFile = pdfs[0];
            setFileName(firstFile);
            setPdfUrl(getPdfUrl(firstFile));
          }
        }
      } catch (error) {
        if (!cancelled) {
          setDocsError(error?.message || "Failed to load patient documents.");
        }
      } finally {
        if (!cancelled) {
          setDocsLoading(false);
        }
      }
    }

    loadPatientDocs();
    return () => {
      cancelled = true;
    };
  }, [selectedPatient]);

  const filteredPatients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((patient) =>
      [patient.id, patient.name, patient.birthDate, patient.gender]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [patients, query]);

  const normalizedQuery = query.trim();
  const hasExactMatch = !!(
    normalizedQuery &&
    patients.find((patient) => patient.id.toLowerCase() === normalizedQuery.toLowerCase())
  );

  function openPatientById(patientId) {
    const normalizedId = String(patientId || "").trim();
    if (!normalizedId) return;
    const existingPatient = patients.find(
      (patient) => patient.id.toLowerCase() === normalizedId.toLowerCase()
    );
    setSelectedPatient(
      existingPatient || {
        id: normalizedId,
        name: normalizedId,
        birthDate: "",
        gender: "",
      }
    );
  }

  function viewBackendPdf(filename) {
    setFileName(filename);
    setPdfUrl(getPdfUrl(filename));
    setNumPages(null);
    setPageNumber(1);
  }

  function onDocumentLoadSuccess({ numPages: loadedPages }) {
    setNumPages(loadedPages);
    setPageNumber(1);
  }

  const activeDocLabel = fileName
    ? stripPatientPrefix(fileName, selectedPatient?.id)
    : "No document selected";

  return (
    <div style={page}>
      <div style={sidebar}>
        <div style={headerBlock}>
          <h2 style={title}>Patient Lookup</h2>
          <div style={subtext}>Search prior patients and open uploaded records.</div>
        </div>

        <input
          type="text"
          placeholder="Search by patient ID, name, birth date, or gender"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && normalizedQuery) {
              openPatientById(normalizedQuery);
            }
          }}
          style={searchInput}
        />

        {normalizedQuery && !hasExactMatch ? (
          <button
            type="button"
            onClick={() => openPatientById(normalizedQuery)}
            style={manualLookupButton}
          >
            Open documents for patient ID {normalizedQuery}
          </button>
        ) : null}

        {patientsLoading ? <div style={message}>Loading patients...</div> : null}
        {patientsError ? <div style={errorBanner}>{patientsError}</div> : null}
        {!patientsLoading && !patientsError && filteredPatients.length === 0 ? (
          <div style={message}>No matching patients found.</div>
        ) : null}

        <div style={patientList}>
          {filteredPatients.map((patient) => {
            const isActive = patient.id === selectedPatient?.id;
            return (
              <button
                key={patient.id}
                type="button"
                onClick={() => setSelectedPatient(patient)}
                style={{
                  ...patientButton,
                  ...(isActive ? patientButtonActive : null),
                }}
              >
                <div style={patientName}>{patient.name || "Unnamed patient"}</div>
                <div style={patientMeta}>ID: {patient.id}</div>
                <div style={patientMeta}>
                  {[patient.birthDate || "Unknown DOB", patient.gender || "Unknown gender"].join(" • ")}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={mainPanel}>
        <div style={detailHeader}>
          <div>
            <div style={detailTitle}>{selectedPatient?.name || "Select a patient"}</div>
            <div style={detailMeta}>
              {selectedPatient
                ? `Patient ID ${selectedPatient.id}`
                : "Choose a patient from the list to review documents."}
            </div>
          </div>
        </div>

        <div style={docPillRow}>
          {docsLoading ? <div style={message}>Loading documents...</div> : null}
          {!docsLoading && docsError ? <div style={errorBanner}>{docsError}</div> : null}
          {!docsLoading && !docsError && selectedPatient && patientPdfs.length === 0 ? (
            <div style={message}>No uploaded documents found for this patient.</div>
          ) : null}
          {!docsLoading &&
            !docsError &&
            patientPdfs.map((pdfName) => (
              <button
                key={pdfName}
                type="button"
                onClick={() => viewBackendPdf(pdfName)}
                style={{
                  ...docPill,
                  ...(fileName === pdfName ? docPillActive : null),
                }}
              >
                {stripPatientPrefix(pdfName, selectedPatient?.id)}
              </button>
            ))}
        </div>

        {pdfUrl ? (
          <div style={viewerWrap}>
            <div style={toolbar}>
              <span style={toolbarFile}>{activeDocLabel}</span>
              <div style={toolbarControls}>
                <button
                  type="button"
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                  disabled={pageNumber <= 1}
                  style={toolButton(pageNumber <= 1)}
                >
                  Prev
                </button>
                <span style={toolbarText}>
                  Page {pageNumber} of {numPages ?? "..."}
                </span>
                <button
                  type="button"
                  onClick={() => setPageNumber((p) => Math.min(numPages || p, p + 1))}
                  disabled={!numPages || pageNumber >= numPages}
                  style={toolButton(!numPages || pageNumber >= numPages)}
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.max(0.6, +(s - 0.2).toFixed(1)))}
                  style={toolButton(false)}
                >
                  -
                </button>
                <span style={toolbarText}>{Math.round(scale * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(1)))}
                  style={toolButton(false)}
                >
                  +
                </button>
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={openLink}>
                  Open in new tab
                </a>
              </div>
            </div>

            <div style={viewerFrame}>
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={(e) => setDocsError(`Failed to load PDF: ${e.message}`)}
                loading={<div style={message}>Loading PDF...</div>}
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  renderAnnotationLayer
                  renderTextLayer
                />
              </Document>
            </div>
          </div>
        ) : (
          <div style={emptyState}>
            <div style={emptyIcon}>Files</div>
            <div style={message}>Select a patient document to preview it here.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function normalizePatient(resource) {
  if (!resource?.id) return null;
  const firstName = resource?.name?.[0];
  const given = Array.isArray(firstName?.given) ? firstName.given.join(" ") : "";
  const family = firstName?.family || "";
  const fullName = [given, family].filter(Boolean).join(" ").trim();

  return {
    id: resource.id,
    name: fullName || resource.id,
    birthDate: resource.birthDate || "",
    gender: resource.gender || "",
  };
}

function stripPatientPrefix(fileName, patientId) {
  if (!fileName) return "";
  if (!patientId) return fileName;
  const prefix = `${patientId}_`;
  return fileName.startsWith(prefix) ? fileName.slice(prefix.length) : fileName;
}

function toolButton(disabled) {
  return {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    background: disabled ? "#e2e8f0" : "#fff",
    color: disabled ? "#94a3b8" : "#0f172a",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
  };
}

const page = {
  minHeight: "calc(100vh - 120px)",
  display: "grid",
  gridTemplateColumns: "320px minmax(0, 1fr)",
  gap: 16,
  padding: 16,
  background: "#f6f8fb",
};

const sidebar = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 16,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#fff",
  minHeight: 0,
};

const headerBlock = {
  display: "grid",
  gap: 4,
};

const title = {
  margin: 0,
  fontSize: 22,
  color: "#0f172a",
};

const subtext = {
  fontSize: 13,
  color: "#64748b",
};

const searchInput = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  fontSize: 14,
};

const manualLookupButton = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #c7dbff",
  background: "#e7f3ff",
  color: "#1d4ed8",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  textAlign: "left",
};

const patientList = {
  display: "grid",
  gap: 8,
  overflow: "auto",
  minHeight: 0,
};

const patientButton = {
  textAlign: "left",
  padding: 12,
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  background: "#fff",
  cursor: "pointer",
};

const patientButtonActive = {
  borderColor: "#60a5fa",
  background: "#eff6ff",
};

const patientName = {
  fontSize: 14,
  fontWeight: 700,
  color: "#0f172a",
  marginBottom: 4,
};

const patientMeta = {
  fontSize: 12,
  color: "#64748b",
};

const mainPanel = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minWidth: 0,
};

const detailHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: 16,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#fff",
};

const detailTitle = {
  fontSize: 20,
  fontWeight: 800,
  color: "#0f172a",
};

const detailMeta = {
  fontSize: 13,
  color: "#64748b",
  marginTop: 4,
};

const docPillRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#fff",
};

const docPill = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
  color: "#0f172a",
};

const docPillActive = {
  borderColor: "#60a5fa",
  background: "#eff6ff",
};

const viewerWrap = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#fff",
  overflow: "hidden",
};

const toolbar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: 12,
  background: "#0f172a",
};

const toolbarFile = {
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
};

const toolbarControls = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const toolbarText = {
  color: "#e2e8f0",
  fontSize: 13,
};

const openLink = {
  color: "#93c5fd",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 13,
};

const viewerFrame = {
  flex: 1,
  overflow: "auto",
  background: "#e2e8f0",
  display: "flex",
  justifyContent: "center",
  padding: "16px 0",
};

const emptyState = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  borderRadius: 12,
  border: "1px dashed #cbd5e1",
  background: "#fff",
  minHeight: 320,
};

const emptyIcon = {
  fontSize: 28,
  fontWeight: 700,
  color: "#94a3b8",
};

const message = {
  fontSize: 13,
  color: "#64748b",
};

const errorBanner = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "#fee2e2",
  color: "#b91c1c",
  fontSize: 13,
};
