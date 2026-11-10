export function jobPath(job: { id: string; name: string; customer: { name: string } }) {
  const slug = `${job.customer.name} ${job.name}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trabajo";
  return `/trabajos/${job.id}/${slug}`;
}
