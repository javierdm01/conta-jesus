"use client";
import Link from "next/link";
import { ShoppingCart, Calculator, Truck, Users, type LucideIcon } from "lucide-react";

type Tile = { title: string; icon: LucideIcon; href: string; newLabel?: string; onNew?: () => void };

// Portada de Clientes y proveedores: cada bloque entra en su lista y, si procede, tiene su alta rápida.
export default function ContactsHub({ onNewCustomer, onNewSupplier }: { onNewCustomer: () => void; onNewSupplier: () => void }) {
  const tiles: Tile[] = [
    { title: "Clientes", icon: Users, href: "/clientes", newLabel: "Nuevo", onNew: onNewCustomer },
    { title: "Proveedores", icon: Truck, href: "/proveedores", newLabel: "Nuevo", onNew: onNewSupplier },
    { title: "Cuentas de proveedores", icon: Calculator, href: "/cuentas" },
    { title: "Pedidos a proveedores", icon: ShoppingCart, href: "/pedidos" },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">CONTACTOS</div>
          <h1 className="mt-2">Clientes y proveedores</h1>
          <p className="subtitle">Tus contactos, lo que les compras y lo que les pides.</p>
        </div>
      </div>
      <div className="hub-grid">
        {tiles.map((t) => (
          <div className="hub-tile" key={t.title}>
            <Link href={t.href} prefetch>
              <t.icon size={34} strokeWidth={1.6} />
              <strong>{t.title}</strong>
            </Link>
            {t.onNew && <button type="button" onClick={t.onNew}>{t.newLabel}</button>}
          </div>
        ))}
      </div>
    </>
  );
}
