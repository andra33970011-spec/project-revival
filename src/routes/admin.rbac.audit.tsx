// Redirect: /admin/rbac/audit → /admin/audit.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/rbac/audit")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/audit" });
  },
});
