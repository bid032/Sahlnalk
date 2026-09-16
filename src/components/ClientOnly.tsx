import { useEffect, useState, type ComponentType, type ReactNode, Suspense, lazy } from "react";

/**
 * Renders `children` only after hydration on the client.
 * Prevents SSR from importing browser-only libs (three.js, gsap plugins).
 */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Lazy-load a heavy client-only component with SSR-safe fallback.
 * Usage: const HeroCanvas = lazyClient(() => import("@/components/HeroCanvas").then(m => ({ default: m.HeroCanvas })))
 */
export function lazyClient<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  fallback: ReactNode = null,
) {
  const Lazy = lazy(loader);
  return function LazyClientComponent(props: React.ComponentProps<T>) {
    return (
      <ClientOnly fallback={fallback}>
        <Suspense fallback={fallback}>
          <Lazy {...(props as any)} />
        </Suspense>
      </ClientOnly>
    );
  };
}
