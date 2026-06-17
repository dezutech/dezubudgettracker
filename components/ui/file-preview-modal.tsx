"use client";

import { useState } from "react";
import { Download, FileText, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type FilePreviewModalProps = {
  open: boolean;
  url: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  title?: string;
  onClose: () => void;
};

function isImage(mimeType?: string | null) {
  return Boolean(mimeType?.startsWith("image/"));
}

function isPdf(mimeType?: string | null, fileName?: string | null) {
  return mimeType === "application/pdf" || Boolean(fileName?.toLowerCase().endsWith(".pdf"));
}

function extensionForDownload(mimeType?: string | null, fileName?: string | null) {
  if (mimeType === "application/pdf" || fileName?.toLowerCase().endsWith(".pdf")) return "pdf";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "file";
}

function friendlyDownloadName(title: string, mimeType?: string | null, fileName?: string | null) {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "preview";
  return `${base}.${extensionForDownload(mimeType, fileName)}`;
}

export function FilePreviewModal({
  open,
  url,
  fileName,
  mimeType,
  title = "Preview",
  onClose,
}: FilePreviewModalProps) {
  const [downloading, setDownloading] = useState(false);
  if (!open || !url) return null;

  const downloadName = friendlyDownloadName(title, mimeType, fileName);
  const image = isImage(mimeType);
  const pdf = isPdf(mimeType, fileName);

  async function handleDownload() {
    if (!url) return;
    setDownloading(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-5">
      <button type="button" aria-label="Close preview" className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="theme-surface relative flex h-full max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl ring-1 ring-border">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-card-foreground">{title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading}
              className="theme-hover flex h-9 items-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-3 text-xs font-medium text-foreground ring-1 ring-border transition-colors disabled:pointer-events-none disabled:opacity-60"
            >
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--theme-primary-soft)] hover:text-[var(--theme-primary)]"
              aria-label="Close preview"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-auto bg-background/45 p-3 sm:p-5", image && "touch-pan-x touch-pan-y")}>
          {image ? (
            <div className="flex min-h-full items-center justify-center">
              <img
                src={url}
                alt={title}
                className="max-h-full max-w-full rounded-xl object-contain ring-1 ring-border"
              />
            </div>
          ) : pdf ? (
            <iframe
              src={url}
              title={title}
              className="h-full min-h-[70dvh] w-full rounded-xl bg-card ring-1 ring-border"
            />
          ) : (
            <div className="flex min-h-full items-center justify-center">
              <div className="max-w-sm rounded-xl bg-card/90 p-5 text-center ring-1 ring-border">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--theme-primary-soft)] text-[var(--theme-primary)]">
                  <FileText size={26} />
                </div>
                <p className="mt-3 text-sm font-semibold text-card-foreground">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">Preview is not available for this file type. Use Download to save a copy.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
