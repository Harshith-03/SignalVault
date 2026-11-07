import { Compass, Gauge } from "lucide-react";
import { ButtonLink, EmptyState } from "../components/ui";

export default function NotFound() {
  return (
    <div className="pt-6 sm:pt-12">
      <EmptyState title="Page not found" icon={<Compass size={20} />}>
        That address isn't part of the vault.
        <div className="mt-5 flex justify-center">
          <ButtonLink to="/" variant="primary" icon={<Gauge size={15} />}>Back to Overview</ButtonLink>
        </div>
      </EmptyState>
    </div>
  );
}
