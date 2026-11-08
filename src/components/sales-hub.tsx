"use client";
import Link from "next/link";
import { BookOpen, ClipboardList, FileText, Banknote, ChartNoAxesCombined, Users, type LucideIcon } from "lucide-react";

type Tile = { title: string; icon: LucideIcon; href: string; newLabel?: string; onNew?: () => void };

// Portada de Ventas: cada bloque entra en su lista y, si procede, tiene su botón de alta rápida.
export default function SalesHub({
  onNewInvoice,
  onNewQuote,
  onNewCustomer,
  pending,
}: {
  onNewInvoice: () => void;
  onNewQuote: () => void;
  onNewCustomer: () => void;
  pending: number;
}) {
  const tiles: Tile[] = [
    { title: "Facturas", icon: FileText, href: "/facturas-venta", newLabel: "Nueva", onNew: onNewInvoice },
    { title: "Presupuestos", icon: ClipboardList, href: "/presupuestos", newLabel: "Nuevo", onNew: onNewQuote },
    { title: "Clientes", icon: Users, href: "/clientes", newLabel: "Nuevo", onNew: onNewCustomer },
    { title: "Cobros", icon: Banknote, href: "/cobros" },
    { title: "Catálogo de materiales", icon: BookOpen, href: "/catalogo" },
    { title: "Informes y trimestres", icon: ChartNoAxesCombined, href: "/trimestres" },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">VENTAS</div>
          <h1 className="mt-2">Ventas</h1>
          <p className="subtitle">
            Presupuestos, facturas y cobros.{pending > 0 && ` Tienes ${pending} ${pending === 1 ? "factura pendiente" : "facturas pendientes"} de cobro.`}
          </p>
        </div>
      </div>
      <div className="hub-grid">
        {tiles.map((t) => (
          <div className="hub-tile" key={t.title}>
            <Link href={t.href} prefetch>
              <t.icon size={34} strokeWidth={1.6} />
              <strong>{t.title}</strong>
            </Link>
            {t.onNew && (
              <button type="button" onClick={t.onNew}>{t.newLabel}</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
