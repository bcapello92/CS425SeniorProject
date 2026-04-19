import React, { useState, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { listPatientPdfs, getPdfUrl } from "./ollamaChatClient";

// Configure the PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url
).toString();

export default function ProviderUpload() {
	const [pdfUrl, setPdfUrl] = useState(null);
	const [fileName, setFileName] = useState(null);
	const [error, setError] = useState(null);

	// PDF viewer state
	const [numPages, setNumPages] = useState(null);
	const [pageNumber, setPageNumber] = useState(1);
	const [scale, setScale] = useState(1.2);

	// State for fetching patient PDFs
	const [patientId, setPatientId] = useState("");
	const [patientPdfs, setPatientPdfs] = useState([]);
	const [fetching, setFetching] = useState(false);

	const fileInputRef = useRef(null);

	const onDocumentLoadSuccess = ({ numPages }) => {
		setNumPages(numPages);
		setPageNumber(1);
	};

	// Handle local file drop/select
	const handleFile = (file) => {
		if (!file) return;
		if (!file.name.toLowerCase().endsWith(".pdf")) {
			setError("Please upload a PDF file.");
			return;
		}
		setError(null);
		setFileName(file.name);
		if (pdfUrl && pdfUrl.startsWith("blob:")) URL.revokeObjectURL(pdfUrl);
		setPdfUrl(URL.createObjectURL(file));
		setNumPages(null);
		setPageNumber(1);
	};

	const onDrop = (e) => {
		e.preventDefault();
		handleFile(e.dataTransfer.files?.[0]);
	};

	const onDragOver = (e) => e.preventDefault();

	// Fetch PDFs uploaded by the patient
	const handleFetchPdfs = async () => {
		if (!patientId.trim()) {
			setError("Please enter a Patient ID.");
			return;
		}
		setFetching(true);
		setError(null);
		setPatientPdfs([]);
		try {
			const pdfs = await listPatientPdfs(patientId.trim());
			setPatientPdfs(pdfs);
			if (pdfs.length === 0) {
				setError("No documents found for this Patient ID.");
			}
		} catch (err) {
			setError(err.message);
		} finally {
			setFetching(false);
		}
	};

	const viewBackendPdf = (filename) => {
		setFileName(filename);
		setPdfUrl(getPdfUrl(filename));
		setNumPages(null);
		setPageNumber(1);
	};

	const btnStyle = (disabled) => ({
		padding: "4px 12px",
		background: disabled ? "#f1f5f9" : "#2563eb",
		color: disabled ? "#94a3b8" : "white",
		border: "none",
		borderRadius: 6,
		cursor: disabled ? "not-allowed" : "pointer",
		fontWeight: 500,
		fontSize: "0.85em",
	});

	return (
		<div
			onDrop={onDrop}
			onDragOver={onDragOver}
			style={{ padding: "16px 24px", height: "calc(100vh - 120px)", display: "flex", flexDirection: "column", fontFamily: "Inter, sans-serif", boxSizing: "border-box" }}
		>
			{/* Header bar */}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
				{/* Left: Title + Search */}
				<div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 2 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
						<h2 style={{ color: "#1e3a8a", margin: 0, fontSize: "1.4em", whiteSpace: "nowrap" }}>📂 Documents</h2>
						<div style={{ display: "flex", gap: 8, flex: 1, maxWidth: 350 }}>
							<input
								type="text"
								placeholder="Patient ID..."
								value={patientId}
								onChange={(e) => setPatientId(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleFetchPdfs()}
								style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.95em" }}
							/>
							<button
								onClick={handleFetchPdfs}
								disabled={fetching}
								style={{ padding: "8px 16px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: fetching ? "not-allowed" : "pointer", fontWeight: 500, fontSize: "0.95em" }}
							>
								{fetching ? "Searching..." : "Search"}
							</button>
						</div>
					</div>

					{/* File Pills */}
					{patientPdfs.length > 0 && (
						<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
							<span style={{ fontSize: "0.85em", color: "#64748b", fontWeight: 600 }}>Results:</span>
							{patientPdfs.map((pdfName) => (
								<button
									key={pdfName}
									onClick={() => viewBackendPdf(pdfName)}
									style={{ padding: "4px 12px", background: fileName === pdfName ? "#eff6ff" : "white", border: fileName === pdfName ? "1px solid #93c5fd" : "1px solid #cbd5e1", borderRadius: 16, cursor: "pointer", fontSize: "0.85em", color: "#1e293b", display: "flex", alignItems: "center", gap: 6 }}
								>
									📄 {pdfName.replace(`${patientId}_`, "")}
								</button>
							))}
						</div>
					)}
				</div>

				{/* Right: Upload button */}
				<div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
					<input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
					<button
						onClick={() => fileInputRef.current?.click()}
						style={{ padding: "8px 16px", background: "#f0f9ff", color: "#1e40af", border: "1px dashed #93c5fd", borderRadius: 6, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 8, fontSize: "0.9em" }}
					>
						📁 Upload / Drop PDF Here
					</button>
				</div>
			</div>

			{error && (
				<div style={{ background: "#fee2e2", color: "#b91c1c", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: "0.9em" }}>
					⚠️ {error}
				</div>
			)}

			{/* PDF Viewer */}
			{pdfUrl ? (
				<div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
					{/* Toolbar */}
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, background: "#1e3a8a", borderRadius: 8, padding: "6px 16px" }}>
						<span style={{ color: "white", fontSize: "0.9em", fontWeight: 500 }}>📄 {fileName}</span>
						<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
							{/* Page navigation */}
							<button onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1} style={btnStyle(pageNumber <= 1)}>‹ Prev</button>
							<span style={{ color: "white", fontSize: "0.85em", minWidth: 80, textAlign: "center" }}>
								Page {pageNumber} of {numPages ?? "…"}
							</span>
							<button onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages} style={btnStyle(pageNumber >= numPages)}>Next ›</button>

							{/* Zoom */}
							<div style={{ width: 1, background: "#4a6fa5", height: 20, margin: "0 4px" }} />
							<button onClick={() => setScale(s => Math.max(0.5, +(s - 0.2).toFixed(1)))} style={btnStyle(false)}>−</button>
							<span style={{ color: "white", fontSize: "0.85em", minWidth: 40, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
							<button onClick={() => setScale(s => Math.min(3, +(s + 0.2).toFixed(1)))} style={btnStyle(false)}>+</button>

							{/* Open in new tab */}
							<div style={{ width: 1, background: "#4a6fa5", height: 20, margin: "0 4px" }} />
							<a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd", textDecoration: "none", fontSize: "0.85em", fontWeight: 500 }}>
								Open in new tab ↗
							</a>
						</div>
					</div>

					{/* Page render — scrollable */}
					<div style={{ flex: 1, overflow: "auto", background: "#e2e8f0", borderRadius: 8, display: "flex", justifyContent: "center", padding: "16px 0" }}>
						<Document
							file={pdfUrl}
							onLoadSuccess={onDocumentLoadSuccess}
							onLoadError={(e) => setError("Failed to load PDF: " + e.message)}
							loading={<div style={{ color: "#64748b", padding: 32 }}>Loading PDF…</div>}
						>
							<Page
								pageNumber={pageNumber}
								scale={scale}
								renderTextLayer={true}
								renderAnnotationLayer={true}
							/>
						</Document>
					</div>
				</div>
			) : (
				<div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "#f8fafc", borderRadius: 12, border: "1px dashed #cbd5e1" }}>
					<div style={{ fontSize: "3em", marginBottom: 16 }}>📁</div>
					<p style={{ margin: 0, fontSize: "1.1em", color: "#94a3b8" }}>Select a document or drop a local PDF anywhere on the screen.</p>
				</div>
			)}
		</div>
	);
}