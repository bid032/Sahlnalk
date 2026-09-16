import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/cart")({
  beforeLoad: () => {
    throw redirect({ to: "/checkout" });
  },
  component: () => null,
});
