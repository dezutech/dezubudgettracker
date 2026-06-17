"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileText, Paperclip, Trash2, Upload, X } from "lucide-react";
import { FilePreviewModal } from "@/components/ui/file-preview-modal";
import { cn } from "@/lib/utils";
import {
  EMPTY_RECEIPT,
  formatReceiptSize,
  getReceiptMetadata,
  isReceiptImage,
  type ReceiptDraft,
  type ReceiptMetadata,
  validateReceiptFile,
} from "@/lib/receipts";

type ReceiptAttachmentProps = {
  value?: Partial<ReceiptMetadata> | null;
  draft: ReceiptDraft;
  onDraftChange: (draft: ReceiptDraft) => void;
  compact?: boolean;
  readOnly?: boolean;
};

export function ReceiptAttachment({
  value,
  draft,
  onDraftChange,
  compact = false,
  readOnly = false,
}: ReceiptAttachmentProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const receipt = getReceiptMetadata(value);
  const hasExisting = Boolean(receipt.receipt_url && !draft.remove);
  const hasDraft = Boolean(draft.file);

  useEffect(() => {
    if (!draft.file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(draft.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.file]);

  const display = useMemo<ReceiptMetadata>(() => {
    if (draft.file && previewUrl) {
      return {
        receipt_url: previewUrl,
        receipt_path: null,
        receipt_file_name: draft.file.name,
        receipt_mime_type: draft.file.type,
        receipt_size: draft.file.size,
      };
    }
    if (hasExisting) return receipt;
    return EMPTY_RECEIPT;
  }, [draft.file, hasExisting, previewUrl, receipt]);

  const hasReceipt = Boolean(display.receipt_url);

  function handleFile(file?: File) {
    setError("");
    if (!file) return;
    const validationError = validateReceiptFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    onDraftChange({ file, remove: false });
  }

  function clearReceipt() {
    setError("");
    onDraftChange({ file: null, remove: hasExisting });
    if (inputRef.current) inputRef.current.value = "";
  }

  if (readOnly && !hasReceipt) return null;

  return (
    <div className={cn("rounded-xl border border-border bg-card/80 p-3 text-card-foreground", compact && "p-2.5")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Paperclip size={14} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-card-foreground">Receipt</p>
            {!hasReceipt && !readOnly && <p className="text-[11px] text-muted-foreground">JPG, PNG, WebP, or PDF up to 5MB</p>}
          </div>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="theme-hover flex h-8 items-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-2.5 text-xs font-medium text-foreground ring-1 ring-border transition-colors"
          >
            <Upload size={13} />
            {hasReceipt || hasDraft ? "Replace" : "Upload"}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      {hasReceipt && (
        <div className="mt-3 flex items-center gap-3">
          {isReceiptImage(display.receipt_mime_type) ? (
            <button type="button" onClick={() => setPreviewOpen(true)} className="h-14 w-14 overflow-hidden rounded-lg bg-[var(--theme-card)] ring-1 ring-border">
              <img src={display.receipt_url ?? ""} alt={display.receipt_file_name ?? "Receipt"} className="h-full w-full object-cover" />
            </button>
          ) : (
            <button type="button" onClick={() => setPreviewOpen(true)} className="theme-selected-soft flex h-14 w-14 items-center justify-center rounded-lg ring-1">
              <FileText size={22} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-card-foreground">{display.receipt_file_name ?? "Receipt"}</p>
            <p className="text-xs text-muted-foreground">{display.receipt_mime_type ?? "File"} {formatReceiptSize(display.receipt_size) && `- ${formatReceiptSize(display.receipt_size)}`}</p>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--theme-primary)] hover:underline"
            >
              <Eye size={11} />
              View receipt
            </button>
          </div>
          {!readOnly && (
            <button type="button" onClick={clearReceipt} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label="Remove receipt">
              {hasDraft ? <X size={14} /> : <Trash2 size={14} />}
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300">{error}</p>}
      <FilePreviewModal
        open={previewOpen}
        url={display.receipt_url}
        fileName={display.receipt_file_name}
        mimeType={display.receipt_mime_type}
        title="Receipt Preview"
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
