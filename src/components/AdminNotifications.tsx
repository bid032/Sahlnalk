import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useApp } from "@/contexts/AppContext";

type OrderRow = {
  id: string;
  order_number: string;
  total: number | null;
  currency: string | null;
  customer_email: string | null;
  created_at: string;
  status: string | null;
  payment_gateway: string | null;
};

const STORAGE_KEY = "admin_notifications_seen_ids";
const MAX_SEEN = 200;

function playBeep() {
  try {
    const AC =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g).connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 600);
  } catch {
    /* ignore */
  }
}

export function AdminNotifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { canModerate, isLoading } = useAdminRole();
  const { lang } = useApp();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // BroadcastChannel and window storage listener for real-time cross-tab notification sync
  useEffect(() => {
    if (typeof window === "undefined") return;

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("rk_admin_notifications") : null;

    const syncFromStorage = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            setSeenIds(new Set(arr));
          }
        }
      } catch { }
    };

    if (channel) {
      channel.onmessage = (msg) => {
        if (msg.data?.type === "SEEN_UPDATED" && Array.isArray(msg.data?.seenIds)) {
          setSeenIds(new Set(msg.data.seenIds));
        }
      };
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        syncFromStorage();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      if (channel) channel.close();
    };
  }, []);

  const persistSeen = (next: Set<string>) => {
    setSeenIds(new Set(next));
    if (typeof window !== "undefined") {
      const arr = Array.from(next).slice(-MAX_SEEN);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("rk_admin_notifications");
          bc.postMessage({ type: "SEEN_UPDATED", seenIds: arr });
          bc.close();
        }
      } catch { }
    }
  };

  const markSeen = (ids: string[]) => {
    const next = new Set(seenIds);
    let changed = false;
    for (const id of ids) {
      if (!next.has(id)) {
        next.add(id);
        changed = true;
      }
    }
    if (changed) persistSeen(next);
  };

  // Load recent orders excluding unpaid pending PayPal attempts & auto-marking delivered as read
  useEffect(() => {
    if (!canModerate) return;
    let alive = true;
    supabase
      .from("orders")
      .select("id, order_number, total, currency, customer_email, created_at, status, payment_gateway")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!alive) return;
        const allRows = (data as OrderRow[] | null) ?? [];
        // Exclude unpaid PayPal orders (matching admin.orders.tsx logic)
        const rows = allRows
          .filter((r) => {
            if (r.payment_gateway === "paypal") {
              const st = (r.status ?? "").toLowerCase();
              return st === "paid" || st === "delivered" || st === "completed";
            }
            return true;
          })
          .slice(0, 15);

        setOrders(rows);

        // Auto-mark any delivered/completed/cancelled orders as seen so badge clears immediately
        const closedIds = rows
          .filter((r) => {
            const st = (r.status ?? "").toLowerCase();
            return st === "delivered" || st === "completed" || st === "cancelled" || st === "canceled" || st === "refunded";
          })
          .map((r) => r.id);

        if (closedIds.length > 0) {
          const next = new Set(seenIds);
          let changed = false;
          for (const id of closedIds) {
            if (!next.has(id)) {
              next.add(id);
              changed = true;
            }
          }
          if (changed) persistSeen(next);
        }

        if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
          persistSeen(new Set(rows.map((r) => r.id)));
        }
      });
    return () => {
      alive = false;
    };
  }, [canModerate]);


  // Realtime subscribe with cross-tab deduplication & DELETE handling
  useEffect(() => {
    if (!canModerate) return;
    const channelName = `admin-orders-notifications-${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          // Instantly refresh all admin order queries on screen for ANY change (INSERT, UPDATE, DELETE)
          qc.invalidateQueries({ queryKey: ["admin-orders"] });
          qc.invalidateQueries({ queryKey: ["admin-pending-count"] });
          qc.invalidateQueries({ queryKey: ["admin-stats"] });
          qc.invalidateQueries({ queryKey: ["admin-sales-details"] });

          // Handle DELETE event: Immediately remove deleted order from notifications list
          if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setOrders((prev) => prev.filter((o) => o.id !== deletedId));
            }
            return;
          }

          const row = payload.new as OrderRow;
          if (!row) return;

          const st = (row.status ?? "").toLowerCase();
          const isClosed = st === "delivered" || st === "completed" || st === "cancelled" || st === "canceled" || st === "refunded";

          if (isClosed) {
            markSeen([row.id]);
            setOrders((prev) => prev.map((o) => (o.id === row.id ? row : o)));
            return;
          }

          // Strictly block any notification if the order is NOT paid and NOT a manual transfer with proof screenshot
          const isPaid = row.status === "paid" || row.status === "completed" || row.status === "delivered";
          const isWalletProofUploaded = row.payment_gateway === "wallet_instapay" && Boolean((row as any).payment_proof_url);

          if (!isPaid && !isWalletProofUploaded) {
            return;
          }

          // Update orders list state in memory so count & badge update
          setOrders((prev) => {
            const idx = prev.findIndex((o) => o.id === row.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = row;
              return copy;
            }
            return [row, ...prev].slice(0, 15);
          });

          // Multi-tab deduplication lock: prevent playing sound & toast in multiple open tabs
          const lockKey = `rk_notified_order_${row.id}`;
          try {
            if (localStorage.getItem(lockKey)) {
              // Another open tab already handled sound & toast notification for this order!
              return;
            }
            localStorage.setItem(lockKey, String(Date.now()));
            setTimeout(() => {
              try { localStorage.removeItem(lockKey); } catch { }
            }, 60_000);
          } catch { }

          // First open tab plays audio beep & shows toast + desktop notification
          playBeep();
          toast.success(
            lang === "ar"
              ? `طلب جديد تم دفعه بنجاح #${row.order_number}`
              : `New paid order #${row.order_number}`,
            {
              description:
                (row.customer_email ?? "") +
                (row.total
                  ? ` • ${row.total} ${row.currency ?? "EGP"}`
                  : ""),
              action: {
                label: lang === "ar" ? "فتح" : "Open",
                onClick: () => navigate({ to: "/admin/orders" }),
              },
            }
          );
          if ("Notification" in window && Notification.permission === "granted") {
            try {
              new Notification(
                lang === "ar"
                  ? `طلب جديد تم دفعه بنجاح #${row.order_number}`
                  : `New paid order #${row.order_number}`,
                { body: row.customer_email ?? "" }
              );
            } catch {
              /* ignore */
            }
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [canModerate, lang, qc]);

  // Ask for browser notifications once
  useEffect(() => {
    if (!canModerate) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      // Delay to avoid intrusive prompt on first paint
      const id = setTimeout(() => {
        Notification.requestPermission().catch(() => { });
      }, 3000);
      return () => clearTimeout(id);
    }
  }, [canModerate]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (isLoading || !canModerate) return null;

  const isOrderClosed = (status: string | null | undefined) => {
    const s = (status ?? "").toLowerCase();
    return s === "delivered" || s === "completed" || s === "cancelled" || s === "canceled" || s === "refunded";
  };

  const unseen = orders.filter((o) => !seenIds.has(o.id) && !isOrderClosed(o.status)).length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          // Mark all delivered/closed orders as read when opening notification dropdown
          const closedIds = orders.filter((o) => isOrderClosed(o.status)).map((o) => o.id);
          if (closedIds.length > 0) markSeen(closedIds);
        }}
        className="relative size-8 sm:size-9 grid place-items-center rounded-lg border border-border hover:bg-muted hover:text-brand transition-colors"
      >
        <Bell className="size-4" />
        {unseen > 0 && (
          <span className="absolute -top-1 -end-1 min-w-4 h-4 sm:min-w-5 sm:h-5 px-1 rounded-full bg-red-500 text-white text-[9px] sm:text-[10px] font-bold grid place-items-center animate-pulse">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 mt-2 w-[320px] max-h-[70vh] overflow-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl z-[10001]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h4 className="text-sm font-bold">
              {lang === "ar" ? "الطلبات الأخيرة" : "Recent orders"}
            </h4>
            <div className="flex items-center gap-3">
              {unseen > 0 && (
                <button
                  type="button"
                  onClick={() => markSeen(orders.map((o) => o.id))}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-brand transition-colors"
                >
                  {lang === "ar" ? "تعليم كمقروء" : "Mark all read"}
                </button>
              )}
              <Link
                to="/admin/orders"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-brand hover:underline"
              >
                {lang === "ar" ? "عرض الكل" : "View all"}
              </Link>
            </div>
          </div>
          {orders.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {lang === "ar" ? "لا توجد طلبات بعد" : "No orders yet"}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((o) => {
                const isNew = !seenIds.has(o.id);
                return (
                  <li key={o.id}>
                    <Link
                      to="/admin/orders"
                      onClick={() => {
                        markSeen([o.id]);
                        setOpen(false);
                      }}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors ${isNew ? "bg-red-500/5" : ""
                        }`}
                    >
                      <span
                        className={`mt-1 size-2 rounded-full shrink-0 ${isNew ? "bg-red-500 animate-pulse" : "bg-muted-foreground/30"
                          }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold truncate">
                            #{o.order_number}
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {new Date(o.created_at).toLocaleTimeString(
                              lang === "ar" ? "ar-EG" : "en-US",
                              { hour: "2-digit", minute: "2-digit" }
                            )}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {o.customer_email ?? "-"}
                        </div>
                        <div className="text-xs font-semibold text-brand">
                          {o.total ?? 0} {o.currency ?? "EGP"}
                          {o.status ? ` • ${o.status}` : ""}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
