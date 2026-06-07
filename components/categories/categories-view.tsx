"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Plus, Pencil, Trash2, X, Loader2, Tag,
  Utensils, ShoppingCart, Car, Zap, Tv, ShoppingBag,
  Heart, BookOpen, Home, Repeat, Briefcase, Laptop,
  TrendingUp, Gift, CirclePlus, Music, Film, Coffee,
  Plane, Coins, PiggyBank, Wallet, CreditCard, Banknote,
  Dumbbell, Pizza, Bus, Smartphone, Globe, Package,
  GraduationCap, Stethoscope, Fuel, Building2, Store,
  UtensilsCrossed, Bike,
} from "lucide-react";
import {
  ensureSupabaseDefaultCategories,
  type SupabaseCategory,
} from "@/lib/supabase/categories";
import { createClient } from "@/lib/supabase/client";
import { loggedSupabase } from "@/lib/supabase/query";
import { useAuth } from "@/context/auth-context";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  countTransactionsByCategory,
  createCategory,
  deleteCategory,
  getCategories,
  getNextSortOrder,
  updateCategory,
  type DbCategory,
} from "@/lib/db";
import { OFFLINE_USER_ID } from "@/lib/offline/constants";

type CategoryType = "expense" | "income";

function localCategoryToSupabase(category: DbCategory): SupabaseCategory {
  return {
    id: String(category.id),
    user_id: category.userId,
    name: category.name,
    type: category.type === "both" ? "expense" : category.type,
    icon: category.icon,
    color: category.color,
    is_default: category.isDefault,
    created_at: category.createdAt,
    updated_at: category.updatedAt,
    synced_at: null,
    is_deleted: false,
  };
}

// ─── icon registry ────────────────────────────────────────────────────────────

type IconEntry = { name: string; icon: LucideIcon };

const ICONS: IconEntry[] = [
  // food
  { name: "Utensils",       icon: Utensils       },
  { name: "UtensilsCrossed",icon: UtensilsCrossed },
  { name: "Pizza",          icon: Pizza          },
  { name: "Coffee",         icon: Coffee         },
  { name: "Store",          icon: Store          },
  // groceries / shopping
  { name: "ShoppingCart",   icon: ShoppingCart   },
  { name: "ShoppingBag",    icon: ShoppingBag    },
  { name: "Package",        icon: Package        },
  // transport
  { name: "Car",            icon: Car            },
  { name: "Bus",            icon: Bus            },
  { name: "Bike",           icon: Bike           },
  { name: "Plane",          icon: Plane          },
  { name: "Fuel",           icon: Fuel           },
  // utilities
  { name: "Zap",            icon: Zap            },
  { name: "Globe",          icon: Globe          },
  { name: "Smartphone",     icon: Smartphone     },
  { name: "Home",           icon: Home           },
  // entertainment
  { name: "Tv",             icon: Tv             },
  { name: "Film",           icon: Film           },
  { name: "Music",          icon: Music          },
  // subscriptions / repeat
  { name: "Repeat",         icon: Repeat         },
  // health
  { name: "Heart",          icon: Heart          },
  { name: "Dumbbell",       icon: Dumbbell       },
  { name: "Stethoscope",    icon: Stethoscope    },
  // education
  { name: "BookOpen",       icon: BookOpen       },
  { name: "GraduationCap",  icon: GraduationCap  },
  // income / finance
  { name: "Briefcase",      icon: Briefcase      },
  { name: "Building2",      icon: Building2      },
  { name: "Laptop",         icon: Laptop         },
  { name: "TrendingUp",     icon: TrendingUp     },
  { name: "Coins",          icon: Coins          },
  { name: "PiggyBank",      icon: PiggyBank      },
  { name: "Wallet",         icon: Wallet         },
  { name: "CreditCard",     icon: CreditCard     },
  { name: "Banknote",       icon: Banknote       },
  { name: "Gift",           icon: Gift           },
  { name: "CirclePlus",     icon: CirclePlus     },
];

const ICON_MAP = new Map<string, LucideIcon>(
  ICONS.map(({ name, icon }) => [name, icon])
);

function getIcon(name: string): LucideIcon {
  return ICON_MAP.get(name) ?? Tag;
}

// ─── color registry ───────────────────────────────────────────────────────────

type ColorEntry = { name: string; dot: string; text: string; bg: string };

const COLORS: ColorEntry[] = [
  { name: "orange",  dot: "bg-orange-400",  text: "text-orange-400",  bg: "bg-orange-500/10"  },
  { name: "amber",   dot: "bg-amber-400",   text: "text-amber-400",   bg: "bg-amber-500/10"   },
  { name: "yellow",  dot: "bg-yellow-400",  text: "text-yellow-400",  bg: "bg-yellow-500/10"  },
  { name: "lime",    dot: "bg-lime-400",    text: "text-lime-400",    bg: "bg-lime-500/10"    },
  { name: "emerald", dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10" },
  { name: "teal",    dot: "bg-teal-400",    text: "text-teal-400",    bg: "bg-teal-500/10"    },
  { name: "sky",     dot: "bg-sky-400",     text: "text-sky-400",     bg: "bg-sky-500/10"     },
  { name: "blue",    dot: "bg-blue-400",    text: "text-blue-400",    bg: "bg-blue-500/10"    },
  { name: "indigo",  dot: "bg-indigo-400",  text: "text-indigo-400",  bg: "bg-indigo-500/10"  },
  { name: "violet",  dot: "bg-violet-400",  text: "text-violet-400",  bg: "bg-violet-500/10"  },
  { name: "purple",  dot: "bg-purple-400",  text: "text-purple-400",  bg: "bg-purple-500/10"  },
  { name: "pink",    dot: "bg-pink-400",    text: "text-pink-400",    bg: "bg-pink-500/10"    },
  { name: "rose",    dot: "bg-rose-400",    text: "text-rose-400",    bg: "bg-rose-500/10"    },
  { name: "zinc",    dot: "bg-zinc-400",    text: "text-zinc-400",    bg: "bg-zinc-500/10"    },
];

const COLOR_MAP = new Map<string, ColorEntry>(
  COLORS.map((c) => [c.name, c])
);

function getColor(name: string): ColorEntry {
  return COLOR_MAP.get(name) ?? COLORS[COLORS.length - 1];
}

// ─── IconPicker ───────────────────────────────────────────────────────────────

function IconPicker({
  selected,
  selectedColor,
  onChange,
}: {
  selected: string;
  selectedColor: string;
  onChange: (name: string) => void;
}) {
  const activeDot = getColor(selectedColor).dot;
  return (
    <div className="grid grid-cols-8 gap-1 max-h-44 overflow-y-auto pr-0.5 py-0.5">
      {ICONS.map(({ name, icon: Icon }) => {
        const isActive = selected === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            title={name}
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0",
              isActive
                ? `${activeDot} text-zinc-950 ring-2 ring-offset-1 ring-offset-zinc-900 ring-white/30`
                : "theme-pill bg-[var(--theme-card)]"
            )}
          >
            <Icon size={15} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}

// ─── ColorPicker ─────────────────────────────────────────────────────────────

function ColorPicker({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button
          key={c.name}
          type="button"
          onClick={() => onChange(c.name)}
          title={c.name}
          className={cn(
            "w-7 h-7 rounded-full transition-all",
            c.dot,
            selected === c.name
              ? "ring-2 ring-offset-2 ring-offset-zinc-900 ring-white scale-110"
              : "opacity-60 hover:opacity-100 hover:scale-105"
          )}
        />
      ))}
    </div>
  );
}

// ─── AddEditModal ─────────────────────────────────────────────────────────────

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; category: SupabaseCategory };

function AddEditModal({
  state,
  userId,
  isOffline,
  onClose,
  onSaved,
}: {
  state: ModalState;
  userId: string | null;
  isOffline: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const isEdit = state.mode === "edit";

  const [name,    setName]    = useState("");
  const [type,    setType]    = useState<CategoryType>("expense");
  const [icon,    setIcon]    = useState("Utensils");
  const [color,   setColor]   = useState("orange");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  // pre-fill when editing
  useEffect(() => {
    if (state.mode === "edit") {
      const c = state.category;
      setName(c.name);
      setType(c.type);
      setIcon(c.icon ?? "Tag");
      setColor(c.color ?? "zinc");
    } else {
      setName(""); setType("expense"); setIcon("Utensils"); setColor("orange");
    }
    setError("");
  }, [state]);

  async function handleSave() {
    if (!name.trim()) { setError("Category name is required."); return; }
    setSaving(true);
    setError("");
    try {
      if (isOffline) {
        if (state.mode === "add") {
          await createCategory({
            userId: OFFLINE_USER_ID,
            name: name.trim(),
            type,
            icon,
            color,
            isDefault: false,
            sortOrder: await getNextSortOrder(),
          });
        } else if (state.mode === "edit") {
          await updateCategory(Number(state.category.id), {
            name: name.trim(),
            icon,
            color,
            ...(!state.category.is_default && { type }),
          });
        }
        await onSaved();
        onClose();
        return;
      }

      if (!userId) {
        setError("Please sign in to save a category.");
        return;
      }

      const supabase = createClient();
      if (state.mode === "add") {
        const { error: insertError } = await supabase.from("categories").insert({
          user_id: userId,
          name:      name.trim(),
          type,
          icon,
          color,
          is_default: false,
        });

        if (insertError) {
          setError(insertError.message);
          return;
        }
      } else if (state.mode === "edit") {
        const { error: updateError } = await supabase
          .from("categories")
          .update({
          name:  name.trim(),
          icon,
          color,
          ...(!state.category.is_default && { type }),
          })
          .eq("id", state.category.id)
          .eq("user_id", userId);

        if (updateError) {
          setError(updateError.message);
          return;
        }
      }
      await onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save category.");
    } finally {
      setSaving(false);
    }
  }

  if (state.mode === "closed") return null;

  const colorInfo = getColor(color);
  const IconPreview = getIcon(icon);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />

      <div className="theme-surface relative w-full sm:max-w-md sm:rounded-2xl ring-1 ring-border shadow-2xl flex flex-col max-h-[95dvh]">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            {/* live preview */}
            <div className={`w-8 h-8 rounded-lg ${colorInfo.bg} flex items-center justify-center`}>
              <IconPreview size={15} className={colorInfo.text} strokeWidth={1.75} />
            </div>
            <h2 className="text-base font-semibold text-zinc-50">
              {isEdit ? "Edit Category" : "New Category"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="theme-icon-button w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* scrollable form body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-5">
          {/* name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Food & Dining"
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-colors"
            />
          </div>

          {/* type — only editable for custom or new */}
          {(state.mode === "add" || !state.category.is_default) && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Type
              </label>
              <div className="theme-pill-list flex items-center gap-0 p-1 rounded-lg w-fit">
                {(["expense", "income"] as CategoryType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "px-5 py-1.5 rounded-md text-sm font-medium transition-colors capitalize",
                      type === t
                        ? t === "expense"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-emerald-500/20 text-emerald-300"
                        : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* icon picker */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Icon
            </label>
            <IconPicker
              selected={icon}
              selectedColor={color}
              onChange={setIcon}
            />
          </div>

          {/* color picker */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Color
            </label>
            <ColorPicker selected={color} onChange={setColor} />
          </div>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* footer */}
        <div className="px-5 py-4 border-t border-zinc-800 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="theme-hover px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Add Category"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

function DeleteConfirmModal({
  category,
  txCount,
  deleting,
  error,
  onConfirm,
  onClose,
}: {
  category: SupabaseCategory | null;
  txCount: number;
  deleting: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!category) return null;

  const colorInfo = getColor(category.color ?? "zinc");
  const Icon      = getIcon(category.icon ?? "Tag");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 theme-overlay backdrop-blur-sm" onClick={onClose} />

      <div className="theme-surface relative w-full max-w-sm rounded-2xl ring-1 ring-border shadow-2xl overflow-hidden">
        <div className="px-5 py-5 flex flex-col gap-4">
          {/* icon */}
          <div className="flex items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center">
              <Trash2 size={24} className="text-rose-400" strokeWidth={1.75} />
            </div>
          </div>

          {/* copy */}
          <div className="text-center flex flex-col gap-1.5">
            <h3 className="text-base font-semibold text-zinc-50">
              Delete category?
            </h3>
            {/* category preview */}
            <div className="flex items-center justify-center gap-2 py-1">
              <div className={`w-6 h-6 rounded-lg ${colorInfo.bg} flex items-center justify-center`}>
                <Icon size={12} className={colorInfo.text} strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium text-zinc-200">
                {category.name}
              </span>
            </div>

            {txCount > 0 ? (
              <p className="text-xs text-zinc-400 leading-relaxed">
                <span className="text-amber-400 font-medium">{txCount} transaction{txCount !== 1 ? "s" : ""}</span>{" "}
                use this category. They will keep their data but the category name won't be displayed.
              </p>
            ) : (
              <p className="text-xs text-zinc-500 leading-relaxed">
                This category has no transactions. It will be permanently removed.
              </p>
            )}

            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* actions */}
        <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-2">
          <button
            onClick={onClose}
            className="theme-hover flex-1 py-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-rose-500 hover:bg-rose-400 text-[var(--theme-danger-foreground)] transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {deleting && <Loader2 size={13} className="animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CategoryRow ─────────────────────────────────────────────────────────────

function CategoryRow({
  category,
  onEdit,
  onDelete,
}: {
  category: SupabaseCategory;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon      = getIcon(category.icon ?? "Tag");
  const colorInfo = getColor(category.color ?? "zinc");

  return (
    <div className="theme-hover flex items-center gap-3 px-4 py-3 rounded-xl bg-card ring-1 ring-border transition-colors group">
      {/* icon */}
      <div className={`w-9 h-9 rounded-xl ${colorInfo.bg} flex items-center justify-center shrink-0`}>
        <Icon size={16} className={colorInfo.text} strokeWidth={1.75} />
      </div>

      {/* name + badges */}
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-zinc-100">{category.name}</span>
        {category.is_default && (
          <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded leading-none">
            Default
          </span>
        )}
      </div>

      {/* action buttons — always visible on mobile, hover on desktop */}
      <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          title="Edit"
          className="theme-icon-button w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        >
          <Pencil size={13} strokeWidth={2} />
        </button>
        {!category.is_default && (
          <button
            onClick={onDelete}
            title="Delete"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        )}
        {/* spacer to align rows that have no delete button */}
        {category.is_default && <div className="w-8" />}
      </div>
    </div>
  );
}

// ─── CategoriesView (main) ────────────────────────────────────────────────────

type TypeFilter = "all" | "expense" | "income";

export function CategoriesView() {
  const { user, loading: authLoading, isLoggingOut, isGuest } = useAuth();
  const [filter,       setFilter]       = useState<TypeFilter>("all");
  const [modal,        setModal]        = useState<ModalState>({ mode: "closed" });
  const [deleteTarget, setDeleteTarget] = useState<SupabaseCategory | null>(null);
  const [deleteTxCount,setDeleteTxCount]= useState(0);
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState("");
  const [categories,   setCategories]   = useState<SupabaseCategory[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState("");
  const loadRequestId = useRef(0);

  const loadCategories = useCallback(async (
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
        const rows = await getCategories(OFFLINE_USER_ID);
        if (!isCurrent()) return;
        setCategories(rows.map(localCategoryToSupabase));
        return;
      }

      if (!user?.id) {
        if (!isCurrent()) return;
        setCategories([]);
        return;
      }

      const rows = await ensureSupabaseDefaultCategories(user.id);
      if (!isCurrent()) return;
      setCategories(rows);
    } catch (error) {
      if (!isCurrent()) return;
      setCategories([]);
      setLoadError(error instanceof Error ? error.message : "Failed to load categories.");
    } finally {
      if (!silent && (!isMounted || isMounted())) setLoading(false);
    }
  }, [authLoading, isGuest, isLoggingOut, user?.id]);

  useEffect(() => {
    let mounted = true;
    loadCategories(() => mounted);
    return () => {
      mounted = false;
    };
  }, [loadCategories]);

  // when a delete target is selected, fetch its transaction count
  useEffect(() => {
    if (!deleteTarget) { setDeleteTxCount(0); return; }
    let mounted = true;
    const targetId = deleteTarget.id;

    async function loadTransactionCount() {
      try {
        if (isGuest) {
          const count = await countTransactionsByCategory(Number(targetId));
          if (mounted) setDeleteTxCount(count);
          return;
        }

        const supabase = createClient();
        const { count, error } = await supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("category_id", targetId)
          .eq("is_deleted", false);

        if (!mounted) return;
        setDeleteTxCount(error ? 0 : count ?? 0);
      } catch {
        if (mounted) setDeleteTxCount(0);
      }
    }

    loadTransactionCount();
    return () => {
      mounted = false;
    };
  }, [deleteTarget, isGuest]);

  const filtered = useMemo(() => {
    if (filter === "all") return categories;
    return categories.filter((c) => c.type === filter);
  }, [categories, filter]);

  const expenseCategories = useMemo(
    () => filtered.filter((c) => c.type === "expense"),
    [filtered]
  );
  const incomeCategories = useMemo(
    () => filtered.filter((c) => c.type === "income"),
    [filtered]
  );

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      if (isGuest) {
        if (deleteTarget.is_default) {
          setDeleteError("Default categories cannot be deleted.");
          return;
        }
        await deleteCategory(Number(deleteTarget.id));
        void loadCategories(undefined, { silent: true });
        setDeleteTarget(null);
        return;
      }

      const supabase = createClient();
      if (!user?.id) {
        setDeleteError("Please sign in to delete a category.");
        return;
      }

      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("user_id", user.id)
        .eq("is_default", false);

      if (error) {
        setDeleteError(error.message);
        return;
      }

      void loadCategories(undefined, { silent: true });
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete category.");
    } finally {
      setDeleting(false);
    }
  }

  const typeCounts = useMemo(() => ({
    all:     categories.length,
    expense: categories.filter((c) => c.type === "expense").length,
    income:  categories.filter((c) => c.type === "income").length,
  }), [categories]);

  return (
    <>
      <div className="px-5 py-7 max-w-4xl mx-auto space-y-6">
        {/* page header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-50 tracking-tight">
              Categories
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {loading
                ? "Loading…"
                : `${categories.length} categories · Manage your income & expense types`}
            </p>
          </div>
          <button
            onClick={() => setModal({ mode: "add" })}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors shrink-0"
          >
            <Plus size={15} strokeWidth={2.5} />
            Add Category
          </button>
        </div>

        {/* type filter tabs */}
        <div className="theme-pill-list no-scrollbar flex w-full snap-x snap-mandatory scroll-px-3 flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain rounded-lg p-1.5 [-webkit-overflow-scrolling:touch] sm:w-fit sm:gap-0.5 sm:p-1">
          {(
            [
              { key: "all",     label: "All"     },
              { key: "expense", label: "Expense" },
              { key: "income",  label: "Income"  },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "flex min-h-10 min-w-max shrink-0 snap-start items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium leading-none transition-colors sm:min-h-0 sm:px-4 sm:py-1.5",
                filter === key ? "theme-selected" : "theme-pill"
              )}
            >
              {label}
              <span className={cn(
                "min-w-5 rounded px-1 text-center text-[10px] font-semibold tabular-nums leading-4",
                filter === key ? "opacity-70" : "text-zinc-600"
              )}>
                {typeCounts[key]}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : (
          <div className="space-y-8">
            {loadError && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {loadError}
              </div>
            )}

            {/* Expense section */}
            {expenseCategories.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                    Expense
                  </span>
                  <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
                    {expenseCategories.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {expenseCategories.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      category={cat}
                      onEdit={() => setModal({ mode: "edit", category: cat })}
                      onDelete={() => setDeleteTarget(cat)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Income section */}
            {incomeCategories.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                    Income
                  </span>
                  <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
                    {incomeCategories.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {incomeCategories.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      category={cat}
                      onEdit={() => setModal({ mode: "edit", category: cat })}
                      onDelete={() => setDeleteTarget(cat)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* empty state */}
            {expenseCategories.length === 0 && incomeCategories.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                  <Tag size={20} className="text-zinc-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-400">No categories</p>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    Add your first category to get started
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AddEditModal
        state={modal}
        userId={isGuest ? OFFLINE_USER_ID : user?.id ?? null}
        isOffline={isGuest}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={loadCategories}
      />
      <DeleteConfirmModal
        category={deleteTarget}
        txCount={deleteTxCount}
        deleting={deleting}
        error={deleteError}
        onConfirm={handleDelete}
        onClose={() => {
          setDeleteError("");
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
