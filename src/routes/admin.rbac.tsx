// Redirect: /admin/rbac → /admin/users (RBAC sudah menyatu di Manajemen User).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/rbac")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/users" });
  },
});
