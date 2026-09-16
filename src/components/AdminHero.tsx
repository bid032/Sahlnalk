import type { ComponentType, ReactNode } from "react";

type AdminHeroProps = {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
};

/**
 * Unified admin cover header - same spirit as /shop collection cover,
 * overview cover and users cover:
 * cyan gradient, white icon tile, white title, white-pill actions,
 * optional giant watermark icon + top badge pill.
 */
export function AdminHero({ icon: Icon, title, subtitle, badge, actions }: AdminHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] sm:rounded-3xl">
      {/* soft light blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.22) 0, transparent 28%)",
        }}
      />
      {/* giant watermark */}
      <Icon
        aria-hidden
        className="pointer-events-none absolute -bottom-8 end-6 size-36 rotate-[-8deg] text-white/25 select-none sm:size-44"
      />
      {/* bottom shade for legibility */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/40 via-transparent to-transparent"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
        <div className="flex min-w-0 flex-1 items-end gap-3 sm:gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white shadow-lg ring-2 ring-white sm:size-16">
            <Icon className="size-6 text-[#0b3fa0] sm:size-7" />
          </span>
          <div className="min-w-0 flex-1 pb-0.5">
            {badge ? (
              <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-md">
                {badge}
              </p>
            ) : null}
            <h1 className="truncate text-lg font-extrabold tracking-tight text-white drop-shadow-md sm:text-2xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 truncate text-[11px] text-white/85 drop-shadow sm:text-xs">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

/** White pill action button for use inside AdminHero. */
export function HeroAction({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-extrabold text-[#0b3fa0] shadow-lg transition hover:brightness-95 active:scale-95 disabled:opacity-50 sm:text-sm"
    >
      {children}
    </button>
  );
}

/** Translucent glass pill (secondary action / select wrapper) inside AdminHero. */
export function HeroGlass({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-2 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/25 sm:text-sm">
      {children}
    </span>
  );
}
