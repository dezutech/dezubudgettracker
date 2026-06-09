"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Banknote,
  Building2,
  CreditCard,
  Plus,
  ShoppingBag,
  Smartphone,
  Upload,
  Wallet as WalletIcon,
  X,
  Loader2,
  Trash2,
} from "lucide-react";
import { WalletCard, AddWalletCard, type WalletDisplay } from "./wallet-card";
import { WalletSummary } from "./wallet-summary";
import { createClient } from "@/lib/supabase/client";
import { loggedSupabase } from "@/lib/supabase/query";
import { useAuth } from "@/context/auth-context";
import { useCurrency } from "@/context/currency-context";
import { CurrencyInputPrefix } from "@/components/ui/currency-input-prefix";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { archiveWallet, createTransaction, createWallet, getWallets, updateWallet, type WalletType, type WalletColor } from "@/lib/db";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";

// ─── type → default color ─────────────────────────────────────────────────────

const TYPE_COLOR: Record<WalletType, WalletColor> = {
  "Bank Account": "sky",
  Cash:           "amber",
  "E-Wallet":     "violet",
  "Credit Card":  "rose",
  BNPL:           "rose",
};

const WALLET_TYPES: WalletType[] = [
  "Bank Account",
  "Cash",
  "E-Wallet",
  "Credit Card",
  "BNPL",
];

const WALLET_ICONS = ["Bank Account", "Cash", "E-Wallet", "Credit Card", "BNPL", "wallet"];
const LOGO_BUCKET = "wallet-logos";
const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const COLOR_SWATCHES: Array<{ label: WalletColor; value: string }> = [
  { label: "sky", value: "#38bdf8" },
  { label: "amber", value: "#fbbf24" },
  { label: "violet", value: "#a78bfa" },
  { label: "emerald", value: "#34d399" },
  { label: "rose", value: "#fb7185" },
];

type LogoMode = "logo" | "icon";
type LogoSelection = {
  file: File | null;
  previewUrl: string;
  extractedColor: string | null;
};

function normalizeWalletType(type: string): WalletType {
  const value = type.toLowerCase();
  if (value === "bank account" || value === "bank" || value === "savings") return "Bank Account";
  if (value === "gcash" || value === "maya" || value === "e-wallet" || value === "ewallet") return "E-Wallet";
  if (value === "credit card" || value === "credit") return "Credit Card";
  if (value === "bnpl" || value === "buy now pay later" || value === "buy now, pay later") return "BNPL";
  return "Cash";
}

function getWalletColor(type: string): WalletColor {
  return TYPE_COLOR[normalizeWalletType(type)];
}

function isSafeSvg(svg: string) {
  const lower = svg.toLowerCase();
  return !(
    lower.includes("<script") ||
    lower.includes("<foreignobject") ||
    /\son[a-z]+\s*=/.test(lower) ||
    /href\s*=\s*["'](?!#|data:image\/)/.test(lower) ||
    /xlink:href\s*=\s*["'](?!#|data:image\/)/.test(lower)
  );
}

function extensionForFile(file: File) {
  if (file.type === "image/svg+xml") return "svg";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/png") return "png";
  return "jpg";
}

function validateLogoFile(file: File) {
  if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
    return "Upload a PNG, JPG, WebP, or safe SVG image.";
  }
  if (file.size > MAX_LOGO_SIZE) {
    return "Logo must be 2MB or smaller.";
  }
  return "";
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read logo file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not preview this logo."));
    image.src = src;
  });
}

async function extractDominantColor(src: string) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const size = 48;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3];
    if (alpha < 80) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max > 245 && min > 235) continue;
    if (max < 24 && min < 24) continue;
    r += red;
    g += green;
    b += blue;
    count += 1;
  }

  return count > 0 ? rgbToHex(r / count, g / count, b / count) : null;
}

async function prepareLogoFile(file: File): Promise<LogoSelection> {
  const validationError = validateLogoFile(file);
  if (validationError) throw new Error(validationError);

  if (file.type === "image/svg+xml") {
    const text = await file.text();
    if (!isSafeSvg(text)) throw new Error("This SVG contains unsafe content. Upload a simple SVG or use PNG, JPG, or WebP.");
    const safeFile = new File([text], file.name, { type: file.type });
    const previewUrl = URL.createObjectURL(safeFile);
    const extractedColor = await extractDominantColor(previewUrl).catch(() => null);
    return { file: safeFile, previewUrl, extractedColor };
  }

  const previewUrl = await fileToDataUrl(file);
  const extractedColor = await extractDominantColor(previewUrl).catch(() => null);
  return { file, previewUrl, extractedColor };
}

async function uploadWalletLogo(userId: string, file: File) {
  const supabase = createClient();
  const path = `${userId}/${crypto.randomUUID()}.${extensionForFile(file)}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function colorToHex(color: string | null | undefined, fallback: WalletColor = "emerald") {
  if (color?.startsWith("#")) return color;
  return COLOR_SWATCHES.find((swatch) => swatch.label === color)?.value
    ?? COLOR_SWATCHES.find((swatch) => swatch.label === fallback)?.value
    ?? "#34d399";
}

function WalletTypePreviewIcon({
  icon,
  color,
}: {
  icon: string;
  color: string;
}) {
  const normalized = normalizeWalletType(icon);
  const iconProps = { size: 18, style: { color }, strokeWidth: 1.75 };
  if (normalized === "Bank Account") return <Building2 {...iconProps} />;
  if (normalized === "Cash") return <Banknote {...iconProps} />;
  if (normalized === "E-Wallet") return <Smartphone {...iconProps} />;
  if (normalized === "Credit Card") return <CreditCard {...iconProps} />;
  if (normalized === "BNPL") return <ShoppingBag {...iconProps} />;
  return <WalletIcon {...iconProps} />;
}

function WalletLogoControls({
  mode,
  icon,
  color,
  logoPreviewUrl,
  logoError,
  extractedColor,
  manualColor,
  onModeChange,
  onIconChange,
  onColorChange,
  onLogoFile,
  onRemoveLogo,
}: {
  mode: LogoMode;
  icon: string;
  color: string;
  logoPreviewUrl: string;
  logoError: string;
  extractedColor: string | null;
  manualColor: boolean;
  onModeChange: (mode: LogoMode) => void;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string, manual: boolean) => void;
  onLogoFile: (file: File) => void;
  onRemoveLogo: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const inputId = useId();
  const accentHex = colorToHex(color);
  const previewLabel = mode === "logo" && logoPreviewUrl ? "Custom logo" : normalizeWalletType(icon);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-medium text-muted-foreground">Wallet Logo</label>
        <div className="grid grid-cols-2 rounded-lg bg-muted/70 p-1 text-xs font-medium ring-1 ring-border/60">
          <button
            type="button"
            onClick={() => onModeChange("logo")}
            className={cn("rounded-md px-3 py-1.5 transition-colors", mode === "logo" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            Upload Logo
          </button>
          <button
            type="button"
            onClick={() => onModeChange("icon")}
            className={cn("rounded-md px-3 py-1.5 transition-colors", mode === "icon" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            Choose Icon
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-card p-3 text-card-foreground shadow-sm ring-1 ring-border">
        <div className="mb-3 h-1 rounded-full" style={{ backgroundColor: accentHex }} />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-border"
              style={{ backgroundColor: `${accentHex}24` }}
            >
              {mode === "logo" && logoPreviewUrl ? (
                <img src={logoPreviewUrl} alt="Wallet logo preview" className="h-full w-full object-contain p-1.5" />
              ) : (
                <WalletTypePreviewIcon icon={icon} color={accentHex} />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-card-foreground">Wallet Preview</p>
              <span
                className="mt-1 inline-flex max-w-full rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
                style={{ backgroundColor: `${accentHex}1f`, color: accentHex }}
              >
                <span className="truncate">{previewLabel}</span>
              </span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-muted-foreground">Accent</p>
            <p className="text-sm font-bold tabular-nums text-card-foreground">{formatCurrency(0)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-muted/35 p-3 ring-1 ring-border/70">
        {mode === "logo" ? (
          <div className="min-w-0">
            <input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onLogoFile(file);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={inputId} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-card px-3 text-xs font-semibold text-card-foreground ring-1 ring-border transition-colors hover:bg-muted">
                <Upload size={13} strokeWidth={2.4} />
                Upload
              </label>
              {logoPreviewUrl && (
                <button type="button" onClick={onRemoveLogo} className="h-9 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-card-foreground">
                  Remove
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">PNG, JPG, WebP, or safe SVG. Max 2MB.</p>
            {extractedColor && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Auto color: <span className="font-semibold" style={{ color: extractedColor }}>{extractedColor}</span>
                {manualColor ? " · manual override active" : ""}
              </p>
            )}
          </div>
        ) : (
          <div className="min-w-0">
            <select
              value={icon}
              onChange={(event) => onIconChange(event.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-card-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {WALLET_ICONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Use the default wallet icon instead of an uploaded logo.</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Accent Color</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_SWATCHES.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onColorChange(item.label, true)}
              className={cn("h-8 rounded-lg px-3 text-xs font-medium capitalize transition-colors ring-1", color === item.label ? "text-zinc-950 ring-white/20" : "text-muted-foreground ring-border hover:ring-ring/40")}
              style={{ backgroundColor: color === item.label ? item.value : `${item.value}22` }}
            >
              {item.label}
            </button>
          ))}
          {extractedColor && (
            <button
              type="button"
              onClick={() => onColorChange(extractedColor, false)}
              className={cn("h-8 rounded-lg px-3 text-xs font-semibold ring-1", color === extractedColor ? "text-zinc-950 ring-white/20" : "text-muted-foreground ring-border")}
              style={{ backgroundColor: color === extractedColor ? extractedColor : `${extractedColor}24` }}
            >
              Auto
            </button>
          )}
        </div>
      </div>

      {logoError && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{logoError}</p>
      )}
    </div>
  );
}

// ─── AddWalletModal ───────────────────────────────────────────────────────────

function AddWalletModal({
  open,
  userId,
  isOffline,
  onClose,
  onCreated,
}: {
  open: boolean;
  userId: string | null;
  isOffline: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { currency } = useCurrency();
  const [name, setName]       = useState("");
  const [type, setType]       = useState<WalletType>("Bank Account");
  const [balance, setBalance] = useState("");
  const [limit, setLimit]     = useState("");
  const [icon, setIcon]       = useState("Bank Account");
  const [color, setColor]     = useState<string>(TYPE_COLOR["Bank Account"]);
  const [manualColor, setManualColor] = useState(false);
  const [logoMode, setLogoMode] = useState<LogoMode>("icon");
  const [logoSelection, setLogoSelection] = useState<LogoSelection>({ file: null, previewUrl: "", extractedColor: null });
  const [logoError, setLogoError] = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const isDebtType = type === "Credit Card" || type === "BNPL";

  function reset() {
    setName(""); setType("Bank Account");
    setBalance(""); setLimit(""); setIcon("Bank Account"); setColor(TYPE_COLOR["Bank Account"]);
    setManualColor(false); setLogoMode("icon"); setLogoSelection({ file: null, previewUrl: "", extractedColor: null });
    setLogoError(""); setError("");
  }

  function handleClose() { reset(); onClose(); }

  function handleTypeChange(nextType: WalletType) {
    setType(nextType);
    if (!manualColor) setColor(TYPE_COLOR[nextType]);
    if (logoMode === "icon") setIcon(nextType);
  }

  async function handleLogoFile(file: File) {
    setLogoError("");
    try {
      const nextLogo = await prepareLogoFile(file);
      setLogoSelection(nextLogo);
      setLogoMode("logo");
      if (nextLogo.extractedColor && !manualColor) setColor(nextLogo.extractedColor);
    } catch (uploadError) {
      setLogoSelection({ file: null, previewUrl: "", extractedColor: null });
      setLogoError(uploadError instanceof Error ? uploadError.message : "Could not use this logo.");
    }
  }

  async function handleSubmit() {
    setError("");

    if (!name.trim()) { setError("Wallet name is required."); return; }

    const bal = parseFloat(balance);
    if (balance.trim() === "" || isNaN(bal)) {
      setError("Enter a valid balance (use 0 if none).");
      return;
    }

    if (isDebtType) {
      const lim = parseFloat(limit);
      if (!limit.trim() || isNaN(lim) || lim <= 0) {
        setError("Enter a valid credit limit.");
        return;
      }
    }

    setSaving(true);
    try {
      if (isOffline) {
        await createWallet({
          userId: OFFLINE_USER_ID,
          name: name.trim(),
          type,
          balance: isDebtType ? -Math.abs(bal) : bal,
          currency,
          limit: isDebtType ? Number(limit) : undefined,
          icon,
          color,
          logoUrl: logoMode === "logo" ? logoSelection.previewUrl || undefined : undefined,
          isArchived: false,
        });
        reset();
        onCreated();
        onClose();
        return;
      }

      if (!userId) {
        setError("Please sign in to add a wallet.");
        return;
      }

      const supabase = createClient();
      const logoUrl = logoMode === "logo" && logoSelection.file
        ? await uploadWalletLogo(userId, logoSelection.file)
        : null;
      const { error: insertError } = await supabase.from("wallets").insert({
        user_id: userId,
        name:       name.trim(),
        type,
        balance:    isDebtType ? -Math.abs(bal) : bal,
        color,
        icon,
        logo_url:   logoUrl,
      });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      reset();
      onCreated();
      onClose();
    } catch {
      setError("Failed to save wallet. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={handleClose} />

      <div className="dezu-modal-panel relative w-full bg-zinc-900 shadow-2xl ring-1 ring-white/10 sm:max-w-md sm:rounded-2xl">
        {/* header */}
        <div className="dezu-modal-header flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-50">New Wallet</h2>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* form */}
        <div className="dezu-modal-body flex flex-col gap-4 px-5 py-5">
          {/* wallet type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Wallet Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {WALLET_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => handleTypeChange(t)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors",
                    type === t
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <span>{t}</span>
                  {t === "BNPL" && (
                    <span className="block text-[10px] font-normal text-zinc-500">Buy Now, Pay Later</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Wallet Name</label>
            <Input
              placeholder={`e.g. ${type === "Bank Account" ? "Main Savings" : type === "Cash" ? "Pocket Cash" : `${type} Wallet`}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-zinc-800 border-zinc-700 h-9"
            />
          </div>

          {/* balance + limit */}
          <div className={cn("grid gap-3", isDebtType ? "grid-cols-2" : "grid-cols-1")}>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">
                {isDebtType ? "Current Debt" : "Initial Balance"}
              </label>
              <div className="relative">
                <CurrencyInputPrefix />
                <Input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  className="pl-10 bg-zinc-800 border-zinc-700 h-9"
                />
              </div>
            </div>
            {isDebtType && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Credit Limit</label>
                <div className="relative">
                  <CurrencyInputPrefix />
                  <Input
                    type="number"
                    min="1"
                    placeholder="25,000"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    className="pl-10 bg-zinc-800 border-zinc-700 h-9"
                  />
                </div>
              </div>
            )}
          </div>

          <WalletLogoControls
            mode={logoMode}
            icon={icon}
            color={color}
            logoPreviewUrl={logoSelection.previewUrl}
            logoError={logoError}
            extractedColor={logoSelection.extractedColor}
            manualColor={manualColor}
            onModeChange={(mode) => {
              setLogoMode(mode);
              if (mode === "icon") {
                setLogoSelection({ file: null, previewUrl: "", extractedColor: null });
                setLogoError("");
              }
            }}
            onIconChange={setIcon}
            onColorChange={(nextColor, isManual) => {
              setColor(nextColor);
              setManualColor(isManual);
            }}
            onLogoFile={(file) => void handleLogoFile(file)}
            onRemoveLogo={() => {
              setLogoSelection({ file: null, previewUrl: "", extractedColor: null });
              setLogoError("");
            }}
          />

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* footer */}
        <div className="dezu-modal-footer flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Add Wallet
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WalletsView (main) ───────────────────────────────────────────────────────

function EditWalletModal({
  wallet,
  userId,
  isOffline,
  onClose,
  onSaved,
}: {
  wallet: WalletDisplay | null;
  userId: string | null;
  isOffline: boolean;
  onClose: () => void;
  onSaved: (wallet: WalletDisplay) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<WalletType>("Cash");
  const [balance, setBalance] = useState("");
  const [color, setColor] = useState<string>("amber");
  const [icon, setIcon] = useState("wallet");
  const [manualColor, setManualColor] = useState(false);
  const [logoMode, setLogoMode] = useState<LogoMode>("icon");
  const [logoSelection, setLogoSelection] = useState<LogoSelection>({ file: null, previewUrl: "", extractedColor: null });
  const [logoUrl, setLogoUrl] = useState("");
  const [logoError, setLogoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!wallet) return;
    const normalizedType = normalizeWalletType(wallet.type);
    queueMicrotask(() => {
      setName(wallet.name);
      setType(normalizedType);
      setBalance(String(wallet.balance));
      setColor((wallet.color as WalletColor | null) ?? getWalletColor(normalizedType));
      setIcon(wallet.icon ?? wallet.type ?? "wallet");
      setLogoMode(wallet.logo_url ? "logo" : "icon");
      setLogoSelection({ file: null, previewUrl: wallet.logo_url ?? "", extractedColor: null });
      setLogoUrl(wallet.logo_url ?? "");
      setManualColor(Boolean(wallet.color));
      setLogoError("");
      setError("");
    });
  }, [wallet]);

  function handleTypeChange(nextType: WalletType) {
    setType(nextType);
    if (!manualColor) setColor(getWalletColor(nextType));
    if (logoMode === "icon") setIcon(nextType);
  }

  async function handleLogoFile(file: File) {
    setLogoError("");
    try {
      const nextLogo = await prepareLogoFile(file);
      setLogoSelection(nextLogo);
      setLogoMode("logo");
      if (nextLogo.extractedColor && !manualColor) setColor(nextLogo.extractedColor);
    } catch (uploadError) {
      setLogoError(uploadError instanceof Error ? uploadError.message : "Could not use this logo.");
    }
  }

  async function handleSave() {
    if (!wallet) return;
    setError("");
    if (!name.trim()) { setError("Wallet name is required."); return; }
    const parsedBalance = Number(balance);
    if (!balance.trim() || Number.isNaN(parsedBalance)) { setError("Enter a valid balance."); return; }

    setSaving(true);
    try {
      if (!wallet.id) { setError("Missing wallet id. Close and reopen this wallet, then try again."); return; }
      if (isOffline) {
        const nextLogoUrl = logoMode === "logo"
          ? logoSelection.previewUrl || logoUrl || undefined
          : undefined;
        await updateWallet(Number(wallet.id), {
          name: name.trim(),
          type,
          balance: parsedBalance,
          color,
          icon,
          logoUrl: nextLogoUrl,
        });
        onSaved({ ...wallet, name: name.trim(), type, balance: parsedBalance, color, icon, logo_url: nextLogoUrl ?? null });
        onClose();
        return;
      }

      if (!userId) { setError("Please sign in to edit a wallet."); return; }
      const supabase = createClient();
      const nextLogoUrl = logoMode === "logo"
        ? logoSelection.file
          ? await uploadWalletLogo(userId, logoSelection.file)
          : logoUrl || null
        : null;
      const payload = { name: name.trim(), type, balance: parsedBalance, color, icon, logo_url: nextLogoUrl };
      const { error: updateError } = await loggedSupabase(
        "wallets update",
        supabase
          .from("wallets")
          .update(payload)
          .eq("id", wallet.id)
          .eq("user_id", userId)
      );
      if (updateError) { setError(updateError.message); return; }
      onSaved({ ...wallet, ...payload });
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update wallet.");
    } finally {
      setSaving(false);
    }
  }

  if (!wallet) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="dezu-modal-panel relative w-full bg-zinc-900 shadow-2xl ring-1 ring-white/10 sm:max-w-md sm:rounded-2xl">
        <div className="dezu-modal-header flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-50">Edit Wallet</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="dezu-modal-body flex flex-col gap-4 px-5 py-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Wallet Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-800 border-zinc-700 h-9" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Wallet Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {WALLET_TYPES.map((item) => (
                <button
                  key={item}
                  onClick={() => handleTypeChange(item)}
                  className={cn("px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors", type === item ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200")}
                >
                  <span>{item}</span>
                  {item === "BNPL" && (
                    <span className="block text-[10px] font-normal text-zinc-500">Buy Now, Pay Later</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Balance</label>
            <div className="relative">
              <CurrencyInputPrefix />
              <Input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} className="pl-10 bg-zinc-800 border-zinc-700 h-9" />
            </div>
          </div>
          <WalletLogoControls
            mode={logoMode}
            icon={icon}
            color={color}
            logoPreviewUrl={logoSelection.previewUrl}
            logoError={logoError}
            extractedColor={logoSelection.extractedColor}
            manualColor={manualColor}
            onModeChange={(mode) => {
              setLogoMode(mode);
              setLogoError("");
              if (mode === "icon") setLogoSelection({ file: null, previewUrl: "", extractedColor: null });
              if (mode === "logo" && !logoSelection.previewUrl && logoUrl) setLogoSelection({ file: null, previewUrl: logoUrl, extractedColor: null });
            }}
            onIconChange={setIcon}
            onColorChange={(nextColor, isManual) => {
              setColor(nextColor);
              setManualColor(isManual);
            }}
            onLogoFile={(file) => void handleLogoFile(file)}
            onRemoveLogo={() => {
              setLogoSelection({ file: null, previewUrl: "", extractedColor: null });
              setLogoUrl("");
              setLogoError("");
            }}
          />
          {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="dezu-modal-footer flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors disabled:opacity-60 disabled:pointer-events-none">
            {saving && <Loader2 size={13} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteWalletModal({
  wallet,
  deleting,
  error,
  onClose,
  onConfirm,
}: {
  wallet: WalletDisplay | null;
  deleting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!wallet) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-zinc-900 rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden">
        <div className="px-5 py-5 flex flex-col gap-4 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center">
            <Trash2 size={24} className="text-rose-400" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-50">Delete wallet?</h3>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{wallet.name} will be hidden from your wallet list.</p>
          </div>
          {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">Cancel</button>
          <button onClick={onConfirm} disabled={deleting} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-rose-500 hover:bg-rose-400 text-[var(--theme-danger-foreground)] transition-colors disabled:opacity-60 disabled:pointer-events-none">
            {deleting && <Loader2 size={13} className="animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferWalletModal({
  open,
  wallets,
  initialFromWalletId,
  userId,
  isOffline,
  onClose,
  onTransferred,
}: {
  open: boolean;
  wallets: WalletDisplay[];
  initialFromWalletId: string | null;
  userId: string | null;
  isOffline: boolean;
  onClose: () => void;
  onTransferred: (fromId: string, toId: string, amount: number) => void;
}) {
  const { formatCurrency } = useCurrency();
  const [fromWalletId, setFromWalletId] = useState("");
  const [toWalletId, setToWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setFromWalletId(initialFromWalletId ?? "");
      setToWalletId("");
      setAmount("");
      setDate(new Date().toISOString().split("T")[0]);
      setDescription("");
      setError("");
    });
  }, [initialFromWalletId, open]);

  const selectedFromWallet = wallets.find((wallet) => String(wallet.id) === fromWalletId);
  const parsedAmount = Number(amount);
  const sourceType = selectedFromWallet ? normalizeWalletType(selectedFromWallet.type) : null;
  const isDebtSource = sourceType === "Credit Card" || sourceType === "BNPL";
  const exceedsBalance =
    Boolean(selectedFromWallet) &&
    !isDebtSource &&
    amount.trim() !== "" &&
    !Number.isNaN(parsedAmount) &&
    parsedAmount > (selectedFromWallet?.balance ?? 0);

  function reset() {
    setFromWalletId("");
    setToWalletId("");
    setAmount("");
    setDate(new Date().toISOString().split("T")[0]);
    setDescription("");
    setError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleTransfer() {
    setError("");
    const parsedAmount = Number(amount);
    const fromWallet = wallets.find((wallet) => String(wallet.id) === fromWalletId);
    const toWallet = wallets.find((wallet) => String(wallet.id) === toWalletId);

    if (!fromWallet) { setError("Select a source wallet."); return; }
    if (!toWallet) { setError("Select a destination wallet."); return; }
    if (fromWallet.id === toWallet.id) { setError("From wallet and To wallet cannot be the same."); return; }
    if (!amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }

    const sourceType = normalizeWalletType(fromWallet.type);
    const isDebtSource = sourceType === "Credit Card" || sourceType === "BNPL";
    if (!isDebtSource && fromWallet.balance < parsedAmount) {
      setError("Insufficient balance in the source wallet.");
      return;
    }

    setSaving(true);
    try {
      if (isOffline) {
        await createTransaction({
          userId: OFFLINE_USER_ID,
          walletId: Number(fromWallet.id),
          toWalletId: Number(toWallet.id),
          categoryId: 0,
          type: "transfer",
          amount: parsedAmount,
          date,
          name: description.trim() || "Transfer",
          notes: description.trim() || undefined,
        });
        onTransferred(String(fromWallet.id), String(toWallet.id), parsedAmount);
        reset();
        onClose();
        return;
      }

      if (!userId) { setError("Please sign in to transfer funds."); return; }
      const supabase = createClient();
      const sourceId = String(fromWallet.id);
      const destinationId = String(toWallet.id);
      const nextSourceBalance = fromWallet.balance - parsedAmount;
      const nextDestinationBalance = toWallet.balance + parsedAmount;

      const { error: sourceError } = await supabase
        .from("wallets")
        .update({ balance: nextSourceBalance })
        .eq("id", sourceId)
        .eq("user_id", userId);

      if (sourceError) { setError(sourceError.message); return; }

      const { error: destinationError } = await supabase
        .from("wallets")
        .update({ balance: nextDestinationBalance })
        .eq("id", destinationId)
        .eq("user_id", userId);

      if (destinationError) {
        await supabase
          .from("wallets")
          .update({ balance: fromWallet.balance })
          .eq("id", sourceId)
          .eq("user_id", userId);
        setError(destinationError.message);
        return;
      }

      const { error: transactionError } = await supabase.from("transactions").insert({
        user_id: userId,
        wallet_id: sourceId,
        destination_wallet_id: destinationId,
        category_id: null,
        amount: parsedAmount,
        transaction_type: "transfer",
        description: description.trim() || null,
        transaction_date: date,
      });

      if (transactionError) {
        await Promise.all([
          supabase
            .from("wallets")
            .update({ balance: fromWallet.balance })
            .eq("id", sourceId)
            .eq("user_id", userId),
          supabase
            .from("wallets")
            .update({ balance: toWallet.balance })
            .eq("id", destinationId)
            .eq("user_id", userId),
        ]);
        setError(transactionError.message);
        return;
      }

      onTransferred(sourceId, destinationId, parsedAmount);
      reset();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to transfer funds.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={handleClose} />
      <div className="dezu-modal-panel relative w-full bg-zinc-900 shadow-2xl ring-1 ring-white/10 sm:max-w-md sm:rounded-2xl">
        <div className="dezu-modal-header flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-50">Transfer Funds</h2>
          <button onClick={handleClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="dezu-modal-body flex flex-col gap-4 px-5 py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">From Wallet</label>
              <select value={fromWalletId} onChange={(e) => setFromWalletId(e.target.value)} className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60">
                <option value="">Select</option>
                {wallets.map((wallet) => <option key={wallet.id} value={String(wallet.id)}>{wallet.name}</option>)}
              </select>
              {selectedFromWallet && (
                <p className="text-[11px] text-zinc-500">
                  Balance: {formatCurrency(selectedFromWallet.balance)}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">To Wallet</label>
              <select value={toWalletId} onChange={(e) => setToWalletId(e.target.value)} className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60">
                <option value="">Select</option>
                {wallets.map((wallet) => <option key={wallet.id} value={String(wallet.id)}>{wallet.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Amount</label>
              <div className="relative">
                <CurrencyInputPrefix />
                <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="pl-10 bg-zinc-800 border-zinc-700 h-9" />
              </div>
              {exceedsBalance && (
                <p className="text-[11px] text-amber-400">
                  Amount exceeds the selected wallet balance.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-zinc-800 border-zinc-700 h-9" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Notes / Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note" className="bg-zinc-800 border-zinc-700 h-9" />
          </div>

          {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="dezu-modal-footer flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)] transition-colors">Cancel</button>
          <button onClick={handleTransfer} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors disabled:opacity-60 disabled:pointer-events-none">
            {saving && <Loader2 size={13} className="animate-spin" />}
            Transfer
          </button>
        </div>
      </div>
    </div>
  );
}

export function WalletsView() {
  const router = useRouter();
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const { currency } = useCurrency();
  const userId = user?.id ?? null;
  const [wallets, setWallets] = useState<WalletDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [editTarget, setEditTarget] = useState<WalletDisplay | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WalletDisplay | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const loadRequestId = useRef(0);

  const loadWallets = useCallback(async (
    isMounted?: () => boolean,
    options?: { silent?: boolean }
  ) => {
    const requestId = ++loadRequestId.current;
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    setLoadError("");
    const isCurrent = () => requestId === loadRequestId.current && (!isMounted || isMounted());

    try {
      if (authLoading || isLoggingOut) return;
      if (isGuest) {
        const localWallets = await getWallets(OFFLINE_USER_ID);
        if (!isCurrent()) return;
        setWallets(localWallets.map((wallet) => ({
          id: wallet.id,
          name: wallet.name,
          type: normalizeWalletType(wallet.type),
          balance: wallet.balance,
          color: wallet.color,
          icon: wallet.icon,
          logo_url: wallet.logoUrl ?? null,
          currency: wallet.currency,
        })));
        return;
      }

      if (!userId) {
        return;
      }

      const supabase = createClient();
      const { data, error } = await loggedSupabase(
        "wallets",
          supabase
            .from("wallets")
            .select("id,name,type,balance,color,icon,logo_url,created_at")
            .eq("user_id", userId)
            .eq("is_deleted", false)
          .order("created_at", { ascending: true })
      );

      if (!isCurrent()) return;

      if (error) {
        setLoadError(error.message);
        setWallets([]);
        return;
      }

      setWallets(
        (data ?? []).map((wallet) => ({
          id: wallet.id,
          name: wallet.name,
          type: normalizeWalletType(wallet.type),
          balance: Number(wallet.balance),
          color: wallet.color,
          icon: wallet.icon,
          logo_url: wallet.logo_url,
          currency,
        }))
      );
    } catch (error) {
      if (!isCurrent()) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load wallets.");
      setWallets([]);
    } finally {
      if (!silent && (!isMounted || isMounted())) setLoading(false);
    }
  }, [authLoading, isGuest, isLoggingOut, userId]);

  useEffect(() => {
    let mounted = true;
    if (authLoading || isLoggingOut) {
      loadRequestId.current += 1;
      queueMicrotask(() => {
        if (!mounted) return;
        setLoadError("");
        if (isLoggingOut) {
          setWallets([]);
          setLoading(false);
        } else {
          setLoading(true);
        }
      });
      return () => {
        mounted = false;
      };
    }

    if (!isGuest && !userId) {
      loadRequestId.current += 1;
      queueMicrotask(() => {
        if (!mounted) return;
        setLoadError("");
        setWallets([]);
        setLoading(false);
      });
      router.replace("/login");
      return () => {
        mounted = false;
      };
    }

    queueMicrotask(() => {
      loadWallets(() => mounted);
    });
    return () => {
      mounted = false;
    };
  }, [authLoading, isGuest, isLoggingOut, loadWallets, router, userId]);

  if (authLoading || isLoggingOut) return null;
  if (!isGuest && !userId) return null;

  function handleWalletSaved(updatedWallet: WalletDisplay) {
    setWallets((current) =>
      current.map((wallet) => wallet.id === updatedWallet.id ? updatedWallet : wallet)
    );
    void loadWallets(undefined, { silent: true });
  }

  function handleTransferSaved(fromId: string, toId: string, amount: number) {
    const fromWallet = wallets.find((wallet) => String(wallet.id) === fromId);
    const toWallet = wallets.find((wallet) => String(wallet.id) === toId);
    setWallets((current) =>
      current.map((wallet) => {
        if (String(wallet.id) === fromId) return { ...wallet, balance: wallet.balance - amount };
        if (String(wallet.id) === toId) return { ...wallet, balance: wallet.balance + amount };
        return wallet;
      })
    );
    setToast(`Transfer completed: ${fromWallet?.name ?? "Source"} to ${toWallet?.name ?? "Destination"}`);
    window.setTimeout(() => setToast(""), 3500);
    void loadWallets(undefined, { silent: true });
  }

  async function handleDeleteWallet() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      if (!user?.id) {
        if (isGuest) {
          await archiveWallet(Number(deleteTarget.id));
          setWallets((current) => current.filter((wallet) => wallet.id !== deleteTarget.id));
          setDeleteTarget(null);
          void loadWallets(undefined, { silent: true });
          return;
        }
        setDeleteError("Please sign in to delete a wallet.");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase
        .from("wallets")
        .update({ is_deleted: true })
        .eq("id", deleteTarget.id)
        .eq("user_id", user.id);

      if (error) {
        setDeleteError(error.message);
        return;
      }

      setWallets((current) => current.filter((wallet) => wallet.id !== deleteTarget.id));
      setDeleteTarget(null);
      void loadWallets(undefined, { silent: true });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete wallet.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {toast && (
        <div className="fixed right-4 top-4 z-[60] rounded-xl border border-emerald-500/20 bg-zinc-900 px-4 py-3 text-sm font-medium text-emerald-300 shadow-2xl">
          {toast}
        </div>
      )}
      <div className="px-5 py-7 max-w-6xl mx-auto space-y-7">
        {/* header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-50 tracking-tight">Wallets</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {loading ? "Loading…" : `${wallets.length} account${wallets.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              aria-label="Transfer"
              onClick={() => {
                setTransferSourceId(null);
                setTransferOpen(true);
              }}
              disabled={wallets.length < 2}
              className="theme-hover flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-3 text-xs font-semibold text-foreground ring-1 ring-border transition-colors disabled:pointer-events-none disabled:opacity-50 sm:h-auto sm:px-4 sm:py-2 sm:text-sm"
            >
              <ArrowLeftRight size={14} strokeWidth={2.5} />
              <span className="hidden min-[390px]:inline sm:inline">Transfer</span>
            </button>
            <button
              aria-label="Add Wallet"
              onClick={() => setAddOpen(true)}
              className="flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 sm:h-auto sm:px-4 sm:py-2 sm:text-sm"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span className="hidden min-[390px]:inline sm:inline">Add Wallet</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {loadError}
          </div>
        ) : (
          <>
            {/* summary strip */}
            <WalletSummary wallets={wallets} />

            {/* wallet grid */}
            <div>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                All Accounts
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {wallets.length === 0 ? (
                  <div className="col-span-2 grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:col-span-3 lg:grid-cols-3">
                    <div className="col-span-2 flex min-h-[120px] flex-col justify-center rounded-xl border border-border bg-card/60 p-4 sm:col-span-1 sm:min-h-[220px] sm:p-6">
                      <p className="text-sm font-medium text-card-foreground">No wallets yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">Add your first wallet to start tracking balances.</p>
                    </div>
                    <AddWalletCard onClick={() => setAddOpen(true)} />
                  </div>
                ) : (
                  <>
                    {wallets.map((wallet) => (
                    <WalletCard
                      key={wallet.id}
                      wallet={wallet}
                      txCount={0}
                      monthlyIncome={0}
                      monthlyExpenses={0}
                      onEdit={() => setEditTarget(wallet)}
                      onDelete={() => setDeleteTarget(wallet)}
                      onTransfer={() => {
                        setTransferSourceId(String(wallet.id));
                        setTransferOpen(true);
                      }}
                    />
                    ))}
                    <AddWalletCard onClick={() => setAddOpen(true)} />
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <AddWalletModal
        open={addOpen}
        userId={isGuest ? OFFLINE_USER_ID : user?.id ?? null}
        isOffline={isGuest}
        onClose={() => setAddOpen(false)}
        onCreated={loadWallets}
      />
      <TransferWalletModal
        open={transferOpen}
        wallets={wallets}
        initialFromWalletId={transferSourceId}
        userId={isGuest ? OFFLINE_USER_ID : user?.id ?? null}
        isOffline={isGuest}
        onClose={() => {
          setTransferSourceId(null);
          setTransferOpen(false);
        }}
        onTransferred={handleTransferSaved}
      />
      <EditWalletModal
        wallet={editTarget}
        userId={isGuest ? OFFLINE_USER_ID : user?.id ?? null}
        isOffline={isGuest}
        onClose={() => setEditTarget(null)}
        onSaved={handleWalletSaved}
      />
      <DeleteWalletModal
        wallet={deleteTarget}
        deleting={deleting}
        error={deleteError}
        onClose={() => {
          setDeleteError("");
          setDeleteTarget(null);
        }}
        onConfirm={handleDeleteWallet}
      />
    </>
  );
}
