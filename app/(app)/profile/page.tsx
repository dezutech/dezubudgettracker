"use client";

import { useState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Camera, Eye, EyeOff, CheckCircle2, Upload, Trash2, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { saveOfflineProfile } from "@/lib/offline/profile";

// ─── Avatar helpers ────────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return (email ?? "?")[0].toUpperCase();
}

function Avatar({
  url, name, email, size = 80,
}: {
  url?: string | null; name?: string | null; email?: string | null; size?: number;
}) {
  const initials = getInitials(name, email);
  const fontSize = Math.round(size * 0.33);

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? "Avatar"}
        width={size}
        height={size}
        className="rounded-full object-cover ring-2 ring-zinc-700"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full bg-emerald-500 flex items-center justify-center text-zinc-950 font-bold ring-2 ring-zinc-700"
      style={{ width: size, height: size, fontSize }}
    >
      {initials}
    </div>
  );
}

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_SIZE_MB = 5;
const MAX_AVATAR_SIZE = MAX_AVATAR_SIZE_MB * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

function validateImageFile(file: File) {
  if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) return "Upload a JPG, PNG, WebP, or safe SVG image.";
  if (file.size > MAX_AVATAR_SIZE) return `Profile picture must be ${MAX_AVATAR_SIZE_MB}MB or smaller.`;
  return "";
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

function fileExtension(file: File) {
  if (file.type === "image/svg+xml") return "svg";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/png") return "png";
  return "jpg";
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

async function prepareProfileImage(file: File) {
  const validation = validateImageFile(file);
  if (validation) throw new Error(validation);
  if (file.type === "image/svg+xml") {
    const text = await file.text();
    if (!isSafeSvg(text)) throw new Error("This SVG contains unsafe content. Upload a simple SVG or use JPG, PNG, or WebP.");
    const safeFile = new File([text], file.name, { type: file.type });
    return { file: safeFile, previewUrl: await fileToDataUrl(safeFile) };
  }
  return { file, previewUrl: await fileToDataUrl(file) };
}

async function uploadProfileImage(userId: string, file: File) {
  const supabase = createClient();
  const path = `${userId}/${crypto.randomUUID()}.${fileExtension(file)}`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    const message = error.message.toLowerCase().includes("bucket not found")
      ? "Avatar storage is not configured. Please create the avatars bucket in Supabase."
      : error.message;
    return { publicUrl: null, error: message };
  }
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl, error: "" };
}

function ProfilePictureUpload({
  avatarUrl,
  displayName,
  email,
  error,
  onImageFile,
  onRemove,
}: {
  avatarUrl: string;
  displayName: string;
  email: string;
  error: string;
  onImageFile: (file: File) => void;
  onRemove: () => void;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onImageFile(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Profile Picture</label>
      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer items-center gap-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 transition-colors",
          dragging ? "border-[var(--theme-primary)] bg-[var(--theme-primary-soft)]" : "hover:border-[var(--theme-primary)] hover:bg-[var(--theme-primary-soft)]"
        )}
      >
        <div className="relative shrink-0">
          <Avatar url={avatarUrl} name={displayName} email={email} size={64} />
          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 ring-2 ring-zinc-900">
            <Camera size={11} className="text-zinc-400" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-100">Upload Image</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Tap to upload on mobile, or drag and drop on desktop. JPG, PNG, WebP, or safe SVG. Max {MAX_AVATAR_SIZE_MB}MB.
          </p>
        </div>
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 sm:flex">
          {avatarUrl ? <ImageIcon size={16} /> : <Upload size={16} />}
        </div>
      </label>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={inputId} className="theme-hover inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--theme-card)] px-3 text-xs font-semibold text-foreground ring-1 ring-border transition-colors">
          <Upload size={13} />
          Upload Image
        </label>
        {avatarUrl && (
          <button type="button" onClick={onRemove} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/10">
            <Trash2 size={13} />
            Remove Photo
          </button>
        )}
      </div>
      {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{error}</p>}
    </div>
  );
}

// ─── Section wrappers ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl bg-[var(--theme-card)] ring-1 ring-[var(--theme-border)]">
      <div className="border-b border-[var(--theme-border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      </div>
      <div className="px-5 py-5 flex flex-col gap-4">{children}</div>
    </div>
  );
}

// ─── ProfilePage ──────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, isLoggingOut, refreshProfile, isGuest } = useAuth();

  // Profile form
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl,   setAvatarUrl]   = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg,    setProfileMsg]    = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Password form
  const [newPassword,  setNewPassword]  = useState("");
  const [confirmPw,    setConfirmPw]    = useState("");
  const [showNewPw,    setShowNewPw]    = useState(false);
  const [savingPw,     setSavingPw]     = useState(false);
  const [pwMsg,        setPwMsg]        = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Pre-fill from loaded profile
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
      setAvatarFile(null);
      setAvatarRemoved(false);
      setAvatarError("");
    }
  }, [profile]);

  useEffect(() => {
    if (!authLoading && !isLoggingOut && !user && !isGuest) {
      router.replace("/login");
    }
  }, [authLoading, isLoggingOut, user, isGuest, router]);

  if (authLoading || isLoggingOut) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!user && !isGuest) {
    return null;
  }

  // ─── Save profile ────────────────────────────────────────────────────────────

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) { setProfileMsg({ type: "err", text: "Display name is required." }); return; }

    setSavingProfile(true);
    setProfileMsg(null);
    try {
      let nextAvatarUrl = avatarRemoved ? null : avatarUrl || null;

      if (isGuest) {
        const saved = saveOfflineProfile({ displayName: displayName.trim(), avatarUrl: nextAvatarUrl });
        setAvatarUrl(saved.avatar_url ?? "");
        setAvatarFile(null);
        setAvatarRemoved(false);
        await refreshProfile();
        setProfileMsg({ type: "ok", text: "Offline profile updated on this device." });
        return;
      }

      if (!user) return;
      const supabase = createClient();
      if (avatarFile) {
        const upload = await uploadProfileImage(user.id, avatarFile);
        if (upload.error || !upload.publicUrl) {
          setAvatarError(upload.error || "Could not upload profile image. Your initials will still be used.");
          nextAvatarUrl = avatarRemoved ? null : profile?.avatar_url ?? null;
          setAvatarUrl(nextAvatarUrl ?? "");
          setAvatarFile(null);
          setAvatarRemoved(false);
          return;
        }
        nextAvatarUrl = upload.publicUrl;
      }

      // Update the profiles table
      const { error: dbError } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          avatar_url:   nextAvatarUrl,
        })
        .eq("id", user.id);

      if (dbError) { setProfileMsg({ type: "err", text: dbError.message }); return; }

      // Also update auth user metadata so getUser() stays in sync
      await supabase.auth.updateUser({
        data: { display_name: displayName.trim(), avatar_url: nextAvatarUrl },
      });

      setAvatarUrl(nextAvatarUrl ?? "");
      setAvatarFile(null);
      setAvatarRemoved(false);
      await refreshProfile();
      setProfileMsg({ type: "ok", text: "Profile updated successfully." });
    } finally {
      setSavingProfile(false);
    }
  }

  // ─── Change password ──────────────────────────────────────────────────────────

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);

    if (!newPassword)           { setPwMsg({ type: "err", text: "New password is required." }); return; }
    if (newPassword.length < 8) { setPwMsg({ type: "err", text: "Password must be at least 8 characters." }); return; }
    if (newPassword !== confirmPw) { setPwMsg({ type: "err", text: "Passwords do not match." }); return; }

    setSavingPw(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
      if (authError) { setPwMsg({ type: "err", text: authError.message }); return; }

      setNewPassword(""); setConfirmPw("");
      setPwMsg({ type: "ok", text: "Password changed successfully." });
    } finally {
      setSavingPw(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="px-5 py-7 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-50 tracking-tight">Profile</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Manage your account information</p>
      </div>

      {/* Avatar preview */}
      <div className="flex items-center gap-4 rounded-2xl bg-[var(--theme-card)] p-5 ring-1 ring-[var(--theme-border)]">
        <div className="relative">
            <Avatar url={avatarUrl || profile?.avatar_url} name={displayName || profile?.display_name} email={user?.email ?? "offline@device.local"} size={64} />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-zinc-800 ring-2 ring-zinc-900 flex items-center justify-center">
            <Camera size={11} className="text-zinc-400" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100 truncate">
            {displayName || profile?.display_name || "No name set"}
          </p>
          <p className="text-xs text-zinc-500 truncate">{isGuest ? "Offline Mode" : user?.email}</p>
        </div>
      </div>

      {/* Profile form */}
      <Section title="Personal Information">
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your full name"
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={isGuest ? "Offline Mode" : user?.email ?? ""}
              disabled
              className="h-9 w-full cursor-not-allowed rounded-lg border border-[var(--theme-border)] bg-[var(--theme-muted)] px-3 text-sm text-[var(--theme-muted-foreground)]"
            />
            <p className="text-xs text-zinc-600">{isGuest ? "You can sign in later to back up your profile." : "Email cannot be changed."}</p>
          </div>

          <ProfilePictureUpload
            avatarUrl={avatarUrl}
            displayName={displayName || profile?.display_name || "Offline User"}
            email={user?.email ?? "offline@device.local"}
            error={avatarError}
            onImageFile={(file) => {
              setAvatarError("");
              void prepareProfileImage(file)
                .then((prepared) => {
                  setAvatarFile(prepared.file);
                  setAvatarUrl(prepared.previewUrl);
                  setAvatarRemoved(false);
                })
                .catch((error) => {
                  setAvatarError(error instanceof Error ? error.message : "Could not use this image.");
                });
            }}
            onRemove={() => {
              setAvatarFile(null);
              setAvatarUrl("");
              setAvatarRemoved(true);
              setAvatarError("");
            }}
          />

          {profileMsg && (
            <p className={cn(
              "text-xs rounded-lg px-3 py-2.5 flex items-center gap-1.5",
              profileMsg.type === "ok"
                ? "text-emerald-400 bg-emerald-500/10"
                : "text-rose-400 bg-rose-500/10"
            )}>
              {profileMsg.type === "ok" && <CheckCircle2 size={12} />}
              {profileMsg.text}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors disabled:pointer-events-none disabled:bg-[var(--theme-muted)] disabled:text-[var(--theme-muted-foreground)]"
            >
              {savingProfile && <Loader2 size={13} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </Section>

      {/* Change password */}
      {!isGuest && (
      <Section title="Change Password">
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNewPw ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className={cn(
                  "h-9 w-full rounded-lg border bg-zinc-800 pl-3 pr-10 text-sm text-zinc-100",
                  "placeholder:text-zinc-500 focus:outline-none transition-colors",
                  "focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60",
                  newPassword && newPassword.length < 8 ? "border-rose-500/50" : "border-zinc-700"
                )}
              />
              <button
                type="button"
                onClick={() => setShowNewPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                tabIndex={-1}
              >
                {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Confirm New Password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Repeat new password"
              className={cn(
                "h-9 w-full rounded-lg border bg-zinc-800 px-3 text-sm text-zinc-100",
                "placeholder:text-zinc-500 focus:outline-none transition-colors",
                "focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60",
                confirmPw && confirmPw !== newPassword ? "border-rose-500/50" : "border-zinc-700"
              )}
            />
          </div>

          {pwMsg && (
            <p className={cn(
              "text-xs rounded-lg px-3 py-2.5 flex items-center gap-1.5",
              pwMsg.type === "ok"
                ? "text-emerald-400 bg-emerald-500/10"
                : "text-rose-400 bg-rose-500/10"
            )}>
              {pwMsg.type === "ok" && <CheckCircle2 size={12} />}
              {pwMsg.text}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPw}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors disabled:pointer-events-none disabled:bg-[var(--theme-muted)] disabled:text-[var(--theme-muted-foreground)]"
            >
              {savingPw && <Loader2 size={13} className="animate-spin" />}
              Update Password
            </button>
          </div>
        </form>
      </Section>
      )}

      {/* Account info */}
      <Section title="Account">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">User ID</span>
            <span className="text-zinc-400 font-mono text-xs truncate max-w-[180px]">{isGuest ? "offline" : user?.id}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Member since</span>
            <span className="text-zinc-400 text-xs">
              {isGuest ? "Offline Mode" : new Date(user?.created_at ?? Date.now()).toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric",
              })}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Email confirmed</span>
            <span className={cn("text-xs font-medium", isGuest || user?.email_confirmed_at ? "text-emerald-400" : "text-amber-400")}>
              {isGuest ? "Offline" : user?.email_confirmed_at ? "Yes" : "Pending confirmation"}
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}
