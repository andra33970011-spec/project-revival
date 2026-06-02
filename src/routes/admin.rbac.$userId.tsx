// Redirect: /admin/rbac/$userId → /admin/users (panel RBAC tersedia di baris user).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/rbac/$userId")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/users" });
  },
});
