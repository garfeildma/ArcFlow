import type { PaymentIntent } from "../lib/types";

const labels: Record<PaymentIntent["status"], string> = {
  created: "Created",
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  expired: "Expired"
};

export function StatusPill({ status }: { status: PaymentIntent["status"] }) {
  return <span className={`status status-${status}`}>{labels[status]}</span>;
}
