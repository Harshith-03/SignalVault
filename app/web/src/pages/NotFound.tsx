import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";

export default function NotFound() {
  return (
    <EmptyState title="Page not found">
      That address isn't part of the vault. <Link className="font-medium text-ink underline" to="/">Back to Overview</Link>
    </EmptyState>
  );
}
