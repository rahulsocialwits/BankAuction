import { redirect } from "next/navigation";

// /admin/sources/health redirects to /admin/health (the existing Source Health dashboard).
export default function SourcesHealthPage() {
  redirect("/admin/health");
}
