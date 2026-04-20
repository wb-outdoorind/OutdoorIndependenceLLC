"use client";

import type React from "react";
import Image from "next/image";
import Link from "next/link";

type MetadataItem = {
  label: string;
  value: React.ReactNode;
};

type PrintableDocumentShellProps = {
  backHref: string;
  backLabel?: string;
  title: string;
  subtitle?: string;
  documentId?: string;
  metadataItems?: MetadataItem[];
  footerNote?: string;
  children: React.ReactNode;
};

export default function PrintableDocumentShell({
  backHref,
  backLabel = "Back",
  title,
  subtitle,
  documentId,
  metadataItems = [],
  footerNote,
  children,
}: PrintableDocumentShellProps) {
  return (
    <main className="print-doc-page" style={{ paddingBottom: 28 }}>
      <style jsx global>{`
        @media print {
          @page {
            size: auto;
            margin: 4mm 6.5mm;
          }

          .no-print,
          .app-topnav,
          .app-footer,
          .app-topnav-menu-wrap,
          .app-shell > button[aria-label="Go back"] {
            display: none !important;
          }

          .app-shell::before {
            display: none !important;
          }

          .app-content {
            padding: 0 !important;
          }

          .print-doc-page {
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
          }

          .print-sheet {
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            max-width: 100% !important;
            background: #fff !important;
            padding: 0 !important;
            gap: 6px !important;
          }

          .print-keep-together {
            break-inside: avoid-page !important;
            page-break-inside: avoid !important;
          }

          .print-sheet,
          .print-sheet * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-sheet .print-metadata-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 5px !important;
            padding: 7px 9px !important;
          }

          .print-sheet .print-metadata-item {
            min-height: 26px !important;
            gap: 1px !important;
          }

          .print-sheet .print-title-block {
            gap: 3px !important;
          }

          .print-sheet .print-title-block h1 {
            font-size: 28px !important;
            line-height: 1.02 !important;
            margin: 0 !important;
          }

          .print-sheet .print-section-checklist {
            break-inside: auto !important;
            page-break-inside: auto !important;
            gap: 4px !important;
            padding: 6px 7px !important;
          }

          .print-sheet .print-checklist-table {
            font-size: 10.85px !important;
          }

          .print-sheet .print-checklist-table tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .print-sheet .print-checklist-table th {
            padding: 5px 7px !important;
          }

          .print-sheet .print-checklist-table td {
            padding: 4px 7px !important;
          }

          .print-sheet .print-notes-block {
            padding: 6px 8px !important;
            gap: 3px !important;
          }

          .print-sheet .print-notes-content {
            min-height: 0 !important;
            line-height: 1.3 !important;
          }

          .print-sheet .print-signatures-block {
            padding: 6px 8px !important;
            gap: 8px !important;
          }

          .print-sheet .print-signature-line {
            min-height: 14px !important;
            padding-bottom: 2px !important;
          }

          .print-sheet .print-footer-note {
            font-size: 9px !important;
            color: #727272 !important;
            padding-top: 2px !important;
            margin-top: 1px !important;
          }

          html,
          body {
            background: #fff !important;
            color: #111 !important;
          }
        }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Link
          href={backHref}
          style={{
            textDecoration: "none",
            color: "inherit",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.04)",
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          ← {backLabel}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(126,255,167,0.35)",
            background: "rgba(126,255,167,0.14)",
            color: "inherit",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Print / Save PDF
        </button>
      </div>

      <div
        className="print-sheet"
        style={{
          background: "#fff",
          color: "#111",
          border: "1px solid #cbcbcb",
          borderRadius: 12,
          maxWidth: 860,
          margin: "0 auto",
          padding: 20,
          boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
          display: "grid",
          gap: 12,
          overflow: "hidden",
        }}
      >
        <div
          className="print-block"
          style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Image
              src="/App_Logo.png"
              alt="Outdoor Independence LLC logo"
              width={156}
              height={30}
              style={{ width: "auto", height: 30, objectFit: "contain", filter: "invert(1)" }}
              priority
            />
          </div>
          {documentId ? <div style={{ fontSize: 11, color: "#666" }}>{documentId}</div> : null}
        </div>

        <div className="print-block print-title-block print-keep-together" style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              color: "#5f5f5f",
              fontWeight: 600,
            }}
          >
            Outdoor Independence LLC Operations App
          </div>
          <h1 style={{ margin: 0, fontSize: 35, lineHeight: 1.05, fontWeight: 800 }}>{title}</h1>
          {subtitle ? <div style={{ fontSize: 12, color: "#505050" }}>{subtitle}</div> : null}
        </div>

        {metadataItems.length ? (
          <div
            className="print-block print-metadata-grid print-keep-together"
            style={{
              border: "1px solid #c4c4c4",
              borderRadius: 8,
              padding: "10px 12px",
              display: "grid",
              gap: 10,
              fontSize: 12,
              background: "#fafafa",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            }}
          >
            {metadataItems.map((item) => (
              <div
                key={item.label}
                className="print-metadata-item"
                style={{
                  display: "grid",
                  gap: 2,
                  alignContent: "start",
                  minHeight: 40,
                }}
              >
                <span
                  style={{
                    opacity: 0.78,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.035em",
                    fontWeight: 700,
                  }}
                >
                  {item.label}
                </span>
                <span style={{ fontWeight: 700, fontSize: 12.5, lineHeight: 1.25 }}>{item.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {children}

        {footerNote ? (
          <div
            className="print-block print-footer-note"
            style={{ fontSize: 11, color: "#4f4f4f", borderTop: "1px solid #dbdbdb", paddingTop: 7 }}
          >
            {footerNote}
          </div>
        ) : null}
      </div>
    </main>
  );
}
