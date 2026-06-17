"use client";

import { createClient } from "@/lib/supabase/client";

export const RECEIPT_BUCKET = "receipts";
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export type ReceiptMetadata = {
  receipt_url: string | null;
  receipt_path: string | null;
  receipt_file_name: string | null;
  receipt_mime_type: string | null;
  receipt_size: number | null;
};

export type ReceiptDraft = {
  file: File | null;
  remove: boolean;
};

export const EMPTY_RECEIPT: ReceiptMetadata = {
  receipt_url: null,
  receipt_path: null,
  receipt_file_name: null,
  receipt_mime_type: null,
  receipt_size: null,
};

export function getReceiptMetadata(record?: Partial<ReceiptMetadata> | null): ReceiptMetadata {
  return {
    receipt_url: record?.receipt_url ?? null,
    receipt_path: record?.receipt_path ?? null,
    receipt_file_name: record?.receipt_file_name ?? null,
    receipt_mime_type: record?.receipt_mime_type ?? null,
    receipt_size: record?.receipt_size ?? null,
  };
}

export function validateReceiptFile(file: File): string | null {
  if (!RECEIPT_MIME_TYPES.includes(file.type as (typeof RECEIPT_MIME_TYPES)[number])) {
    return "Receipt must be a JPG, PNG, WebP, or PDF file.";
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return "Receipt must be 5MB or smaller.";
  }
  return null;
}

export function isReceiptImage(mimeType?: string | null) {
  return Boolean(mimeType?.startsWith("image/"));
}

export function formatReceiptSize(size?: number | null) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read receipt file."));
    reader.readAsDataURL(file);
  });
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "receipt";
}

export async function buildLocalReceiptMetadata(file: File): Promise<ReceiptMetadata> {
  return {
    receipt_url: await fileToDataUrl(file),
    receipt_path: null,
    receipt_file_name: file.name,
    receipt_mime_type: file.type,
    receipt_size: file.size,
  };
}

export async function uploadReceiptFile(userId: string, scope: "bills" | "transactions", file: File): Promise<ReceiptMetadata> {
  const supabase = createClient();
  const path = `${userId}/${scope}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    throw new Error(error.message.toLowerCase().includes("bucket not found")
      ? "Receipt storage is not configured. Please create the receipts bucket in Supabase."
      : error.message);
  }
  const { data } = supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(path);
  return {
    receipt_url: data.publicUrl,
    receipt_path: path,
    receipt_file_name: file.name,
    receipt_mime_type: file.type,
    receipt_size: file.size,
  };
}

export async function removeReceiptFile(path?: string | null) {
  if (!path) return;
  const supabase = createClient();
  await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
}

export async function resolveReceiptMetadata(options: {
  current?: ReceiptMetadata | null;
  draft: ReceiptDraft;
  isOffline: boolean;
  userId: string;
  scope: "bills" | "transactions";
}): Promise<ReceiptMetadata> {
  const current = options.current ?? EMPTY_RECEIPT;
  if (options.draft.remove) {
    if (!options.isOffline) await removeReceiptFile(current.receipt_path);
    return EMPTY_RECEIPT;
  }
  if (!options.draft.file) return current;
  const validationError = validateReceiptFile(options.draft.file);
  if (validationError) throw new Error(validationError);
  if (!options.isOffline) await removeReceiptFile(current.receipt_path);
  return options.isOffline
    ? buildLocalReceiptMetadata(options.draft.file)
    : uploadReceiptFile(options.userId, options.scope, options.draft.file);
}
