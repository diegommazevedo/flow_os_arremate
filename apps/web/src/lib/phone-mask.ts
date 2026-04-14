/** Mascara telefone mostrando apenas os últimos 4 dígitos. */
export function maskPhoneTail(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length < 4) return "****";
  return `****${d.slice(-4)}`;
}
