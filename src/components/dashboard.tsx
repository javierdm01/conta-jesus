"use client";
import { uuid } from "@/lib/uuid";
import { jobPath } from "@/lib/job-path";
import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Zap,
  LayoutDashboard,
  BriefcaseBusiness,
  Files,
  Truck,
  ChartNoAxesCombined,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  Camera,
  Clock,
  ImagePlus,
  Package,
  FilePlus2,
  LogOut,
  FolderOpen,
  Check,
  Download,
  RefreshCw,
  Trash2,
  Euro,
  Wallet,
  FolderUp,
  BookOpen,
  FileUp,
  TrendingUp,
  ChevronRight,
  Users,
  FileCheck2,
  Calculator,
  CalendarDays,
  Receipt,
  Mic,
} from "lucide-react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import SaleProducts, {
  productLine,
  type SaleProduct,
  type SaleProductLine,
} from "./sale-products";
import { matchesSearch } from "@/lib/product-search";
const InventoryWorkspace = dynamic(() => import("./inventory/workspace"), {
  loading: () => <PageSkeleton />,
});
const StockDocumentReview = dynamic(
  () => import("./inventory/document-review"),
  { loading: () => <PageSkeleton /> },
);
const PurchaseOrders = dynamic(() => import("./purchase-orders"), { loading: () => <PageSkeleton /> });
const Quarters = dynamic(() => import("./quarters"), { loading: () => <PageSkeleton /> });
const Expenses = dynamic(() => import("./expenses"), { loading: () => <PageSkeleton /> });
const VoiceDialog = dynamic(() => import("./voice-dialog"));
const ExpenseForm = dynamic(() => import("./expenses").then((m) => m.ExpenseForm));
import { AppSkeleton, PageSkeleton } from "./skeletons";
import { QuoteBuilder } from "./quote-builder";
import { MaterialPicker } from "./material-picker";
import { PersonPicker, type Person } from "./person-picker";
import { uploadDocument } from "@/lib/optimize-upload";
const Catalog = dynamic(() => import("./catalog"), { loading: () => <PageSkeleton /> });
const BulkUpload = dynamic(() => import("./bulk-upload"), { loading: () => <PageSkeleton /> });
const CreditReview = dynamic(() => import("./inventory/credit-review"), { loading: () => <PageSkeleton /> });
const SupplierAccounts = dynamic(() => import("./supplier-accounts"), { loading: () => <PageSkeleton /> });
const InvoicePage = dynamic(() => import("./invoice-page"), { loading: () => <PageSkeleton /> });
import HomeBoard from "./home-board";
const AnalyticsHome = dynamic(() => import("./analytics-home"), { ssr: false, loading: () => <PageSkeleton /> });
const ContactsHub = dynamic(() => import("./contacts-hub"), { loading: () => <PageSkeleton /> });
const SalesHub = dynamic(() => import("./sales-hub"), { loading: () => <PageSkeleton /> });
const InvoiceList = dynamic(() => import("./invoice-list"), { loading: () => <PageSkeleton /> });
const InvoiceDetail = dynamic(() => import("./invoice-detail"), { loading: () => <PageSkeleton /> });
const QuotesList = dynamic(() => import("./quotes-list"), { loading: () => <PageSkeleton /> });
const Hours = dynamic(() => import("./hours"), { loading: () => <PageSkeleton /> });
const TaxCalendar = dynamic(() => import("./tax-calendar"), { loading: () => <PageSkeleton /> });
const SystemHealth = dynamic(() => import("./system-health"));
const VoiceUsage = dynamic(() => import("./voice-usage"));
const ServiceChart = dynamic(() => import("./service-chart"), {
  loading: () => <div className="chart-loading">Preparando gráfico…</div>,
  ssr: false,
});

import { Button } from "./ui/button";
import { NavigationStatus } from "./navigation-status";
import { MoreMenu } from "./more-menu";
import { Dialog } from "./ui/dialog";
import { cents, dec, lineNet, quotePrice, sum } from "@/lib/money";
import type { OcrSuggestion } from "@/lib/ocr";
import { services, statuses } from "@/lib/validation";

import type {
  Customer,
  Supplier,
  Worker,
  Job,
  Doc,
  State,
  Sale,
  Metrics,
} from "@/lib/workspace-types";
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  value?: string;
  required?: boolean;
  full?: boolean;
  hint?: string;
  more?: boolean;
  locked?: boolean;
  /** Primera opción del selector (sin seleccionarla): abre el alta del elemento. */
  addNew?: { label: string; open: () => void };
  picker?: "customer" | "worker";
};
type Modal = {
  product?: SaleProduct;
  title: string;
  action: string;
  fields: Field[];
  fixed?: Record<string, unknown>;
  extra?: string;
  photos?: boolean;
};
const euro = (n: string | number | undefined | null) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    Number(n ?? 0),
  );
const number = (n: string | number) =>
  new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(
    Number(n),
  );
const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const fmtDate = (d: string | undefined) =>
  d
    ? new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid" }).format(
        new Date(d),
      )
    : "Sin fecha";
const nav = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/trabajos", label: "Trabajos", icon: BriefcaseBusiness },
  { href: "/ventas", label: "Ventas", icon: Receipt },
  { href: "/contactos", label: "Clientes y proveedores", icon: Users },
  { href: "/facturas", label: "Documentos", icon: Files },
  { href: "/inventario", label: "Almacén", icon: Package },
  { href: "/beneficios", label: "Beneficios", icon: ChartNoAxesCombined },
  { href: "/horas", label: "Horas", icon: Clock },
  { href: "/gastos", label: "Gastos", icon: Wallet },
  { href: "/catalogo", label: "Catálogo", icon: BookOpen },
  { href: "/calendario", label: "Calendario fiscal", icon: CalendarDays },
  { href: "/trimestres", label: "Trimestres", icon: Calculator },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];
// Cuatro destinos principales; lo demás va en el menú del perfil (2 clics).
const primaryHrefs = ["/", "/trabajos", "/ventas", "/contactos", "/inventario", "/facturas"];
const kindLabel: Record<string, string> = {
  AUTO: "Documento (detectando tipo)",
  PURCHASE: "Factura de compra",
  CREDIT: "Abono de proveedor",
  DELIVERY: "Albarán",
  SALE: "Factura de cliente",
  PHOTO: "Fotografía",
  ATTACHMENT: "Adjunto de factura",
};
const docStatus: Record<string, string> = {
  QUEUED: "Preparando lectura",
  PROCESSING: "Leyendo documento…",
  REVIEW: "Listo para revisar",
  FAILED: "Requiere atención",
  CONFIRMED: "Confirmado",
  ARCHIVED: "Archivado",
};
function Pill({ children }: { children: React.ReactNode }) {
  const text = String(children);
  return (
    <span
      className={`pill ${/En proceso|Leyendo/.test(text) ? "blue" : /Finalizado|Facturado|Cobrado|Confirmado|Aprobado|guardada/.test(text) ? "green" : /Pendiente|cola|atención/.test(text) ? "orange" : ""}`}
    >
      {children}
    </span>
  );
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <FolderOpen size={32} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  highlight = false,
  icon: Icon = Euro,
}: {
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
  icon?: typeof Euro;
}) {
  return (
    <div className={`stat ${highlight ? "highlight" : ""}`}>
      <div className="stat-label">
        {label}
        <Icon size={17} />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}
function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
// Contraseña inicial legible: sin caracteres ambiguos (0/O, 1/l/I).
const randomPassword = () => {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (n) => chars[n % chars.length],
  ).join("");
};
async function request(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error ?? "No se pudo guardar.");
  return data;
}

export function Dashboard({
  initialState,
  children,
}: {
  initialState: State;
  children?: React.ReactNode;
}) {
  const pathname = usePathname(),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [modal, setModal] = useState<Modal | null>(null),
    [upload, setUpload] = useState<string | null>(null),
    [bulk, setBulk] = useState(false),
    [archiving, setArchiving] = useState(false),
    [archiveResult, setArchiveResult] = useState<{ archived: number; skipped: { id: string; name: string; reason: string }[] } | null>(null),
    [review, setReview] = useState<Doc | null>(null),
    [add, setAdd] = useState(false),
    [menu, setMenu] = useState(false),
    [expense, setExpense] = useState(false),
    [voice, setVoice] = useState(false),
    [material, setMaterial] = useState(false),
    [quoteBuilder, setQuoteBuilder] = useState(false),
    [toast, setToast] = useState(""),
    [filter, setFilter] = useState("Todos"),
    [sort, setSort] = useState("gross");
  const router = useRouter();
  const [documentView, setDocumentView] = useState("all");
  const [searchScope, setSearchScope] = useState("all");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [deletingDocs, setDeletingDocs] = useState(false);
  const [openingReview, setOpeningReview] = useState<string | null>(null);
  const {
    data: state,
    error: loadError,
    mutate,
  } = useSWR<State>(
    "/api/state",
    async (url) => {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) {
        location.href = "/login";
        throw Error("La sesión ha terminado.");
      }
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      return data;
    },
    {
      fallbackData: initialState,
      revalidateOnMount: false,
      revalidateOnFocus: true,
      refreshInterval: 60000,
      dedupingInterval: 5000,
      keepPreviousData: true,
    },
  );
  const load = useCallback(async () => {
    try {
      await mutate();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [mutate]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [jobTabState, setJobTabState] = useState({ id: "", tab: "" }); // la pestaña recuerda a qué trabajo pertenece: otro trabajo vuelve a abrir en la primera
  useEffect(() => {
    const close = (e: MouseEvent) => !(e.target as HTMLElement).closest(".search") && setSearchOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const [customerQuery, setCustomerQuery] = useState("");
  const {
    data: productMatches,
    error: productSearchError,
    isLoading: productsSearching,
  } = useSWR<{ items: (SaleProduct & { onHand: string })[]; total: number }>(
    searchTerm
      ? `/api/search/products?q=${encodeURIComponent(searchTerm)}`
      : null,
    async (url: string) => {
      const r = await fetch(url);
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      return body;
    },
  );
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const {
    data: documentMatches,
    error: documentSearchError,
    isLoading: documentsSearching,
  } = useSWR<
    { id: string; originalName: string; number?: string; status: string }[]
  >(
    state?.user.role === "ADMIN" && searchTerm.length >= 2
      ? `/api/search?q=${encodeURIComponent(searchTerm)}`
      : null,
    async (url) => {
      const r = await fetch(url);
      return r.ok ? r.json() : [];
    },
    { dedupingInterval: 10000 },
  );
  const { data: queue } = useSWR<
    { id: string; status: string; error?: string }[]
  >(
    state?.documents.some((d) => ["QUEUED", "PROCESSING"].includes(d.status))
      ? "/api/documents/queue"
      : null,
    async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw Error("No se pudo actualizar la cola");
      return r.json();
    },
    { refreshInterval: 5000 },
  );
  useEffect(() => {
    if (
      queue &&
      state?.documents.some((d) =>
        queue.some((q) => q.id === d.id && q.status !== d.status),
      )
    )
      load();
  }, [queue, state?.documents, load]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    setQuery("");
    setFilter("Todos");
  }, [pathname]);
  useEffect(() => {
    if (loadError) setError(loadError.message);
  }, [loadError]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  const saved = async () => {
    setModal(null);
    setUpload(null);
    setReview(null);
    setToast("Guardado correctamente");
    await load();
  };
  if (!state && !error) return <AppSkeleton />;
  if (!state)
    return (
      <div className="p-10">
        <h1 className="brand">
          <Zap /> instala.
        </h1>
        <div className="screen-error" role="alert">
          <p>{error}</p>
          <Button onClick={load}>Volver a intentar</Button>
        </div>
      </div>
    );
  const s = state,
    isAdmin = s.user.role === "ADMIN",
    section = pathname.split("/")[1] ?? "",
    selected = s.jobs.find((j) => j.id === pathname.split("/")[2]);
  const activeJobs = s.jobs.filter((j) => !j.archivedAt);
  // Ventas agrupa sus pantallas (facturas, presupuestos, cobros, catálogo…); el resto, por su primer segmento.
  const navGroups: Record<string, string[]> = {
    ventas: ["ventas", "facturas-venta", "nueva-factura", "cobros", "presupuestos", "catalogo"],
    contactos: ["contactos", "clientes", "proveedores", "cuentas", "pedidos"],
  };
  const navActive = (href: string) =>
    href === "/" ? pathname === "/" : (navGroups[href.slice(1)] ?? [href.slice(1)]).includes(pathname.split("/")[1]);
  const visibleNav = isAdmin
    ? nav
    : nav.filter(
        (n) =>
          n.href === "/" ||
          n.href === "/trabajos" ||
          n.href === "/facturas" ||
          n.href === "/inventario",
      );
  const matches = (...values: (string | undefined)[]) =>
    matchesSearch(query, values);
  const jobs = s.jobs.filter(
    (j) =>
      (filter === "Retirados" ? !!j.archivedAt : !j.archivedAt) &&
      matches(
        j.name,
        j.number,
        j.customer.name,
        j.address,
        j.service,
        j.plannedAt,
        j.worker?.name,
      ) &&
      (filter === "Todos" || filter === "Retirados" || j.status === filter),
  );
  const allMetrics = s.jobs.flatMap((j) => (j.metrics ? [j.metrics] : [])),
    total = (key: keyof Metrics) =>
      sum(allMetrics.map((m) => m[key] ?? 0)).toString();
  const options = (rows: { id: string; name: string }[]) =>
    rows.map((r) => ({ value: r.id, label: r.name }));
  const field = (
    name: string,
    label: string,
    type = "text",
    value?: string,
    required = true,
  ): Field => ({ name, label, type, value, required });
  const select = (
    name: string,
    label: string,
    rows: { value: string; label: string }[],
    value?: string,
    required = true,
  ): Field => ({ name, label, type: "select", options: rows, value, required });
  const jobField = () =>
    select(
      "jobId",
      "Trabajo",
      activeJobs.map((j) => ({ value: j.id, label: `${j.number} · ${j.name}` })),
      selected && !selected.archivedAt ? selected.id : undefined,
    );
  const createJob = () =>
    setModal({
      title: "Crear trabajo",
      action: "job",
      fields: [
        field("name", "Nombre del trabajo"),
        { ...select("customerId", "Cliente", options(s.customers)), picker: "customer" as const },
        { ...field("address", "Dirección", "text", "", false), more: true },
        {
          ...select(
            "service",
            "Tipo de servicio",
            services.map((x) => ({ value: x, label: x })),
            "Otros",
          ),
          more: true,
        },
        {
          ...select("workerId", "Técnico responsable", options(s.workers), s.user.workerId ?? undefined, false),
          picker: "worker" as const,
          more: true,
        },
        { ...field("plannedAt", "Fecha prevista", "date", undefined, false), more: true },
      ],
    });
  const createContact = (
    type: "customer" | "supplier",
    existing?: Customer | Supplier,
  ) =>
    setModal({
      title: existing
        ? type === "customer"
          ? "Editar cliente"
          : "Editar proveedor"
        : type === "customer"
          ? "Añadir cliente"
          : "Añadir proveedor",
      action: existing ? `${type}Update` : type,
      fixed: existing ? { id: existing.id } : {},
      fields: [
        field(
          "name",
          type === "customer" ? "Nombre del cliente" : "Nombre del proveedor",
          "text",
          existing?.name,
        ),
        field("taxId", "NIF / CIF", "text", existing?.taxId ?? "", false),
        field("phone", "Teléfono", "tel", existing?.phone ?? "", false),
        field(
          "email",
          "Correo electrónico",
          "email",
          existing?.email ?? "",
          false,
        ),
        ...(type === "customer"
          ? [
              field(
                "address",
                "Dirección",
                "text",
                (existing as Customer)?.address ?? "",
                false,
              ),
            ]
          : [
              field(
                "contact",
                "Persona de contacto",
                "text",
                (existing as Supplier)?.contact ?? "",
                false,
              ),
              field(
                "terms",
                "Condiciones de compra y pago",
                "textarea",
                (existing as Supplier)?.terms ?? "",
                false,
              ),
            ]),
      ],
    });
  const editJob = (j: Job) =>
    setModal({
      title: "Editar trabajo",
      action: "jobUpdate",
      fixed: { id: j.id },
      fields: [
        field("name", "Nombre del trabajo", "text", j.name),
        select("customerId", "Cliente", options(s.customers), j.customer.id),
        field("address", "Dirección", "text", j.address, false),
        select(
          "service",
          "Tipo de servicio",
          services.map((x) => ({ value: x, label: x })),
          j.service,
        ),
        select(
          "workerId",
          "Técnico responsable",
          options(s.workers),
          j.worker?.id,
          false,
        ),
        field(
          "plannedAt",
          "Fecha prevista",
          "date",
          j.plannedAt?.slice(0, 10),
          false,
        ),
      ],
    });
  const editWorker = (w: Worker) =>
    setModal({
      title: "Editar trabajador",
      action: "workerUpdate",
      fixed: { id: w.id },
      fields: [
        field("name", "Nombre", "text", w.name),
        {
          ...field(
            "hourlyCost",
            "Coste laboral real por hora (€)",
            "number",
            w.hourlyCost,
          ),
          hint: "La nueva tarifa se aplica a los partes futuros. Los ya registrados conservan su coste.",
        },
        field("specialty", "Especialidad", "text", w.specialty ?? "", false),
      ],
    });
  // Alta de acceso: nuevo técnico/responsable, o acceso para un trabajador ya creado.
  const createUser = (w?: Worker) =>
    setModal({
      title: w ? `Dar acceso a ${w.name}` : "Nuevo usuario",
      action: "user-create",
      fixed: w ? { workerId: w.id, role: "TECHNICIAN" } : undefined,
      fields: [
        field("name", "Nombre", "text", w?.name),
        field("email", "Correo electrónico (será su usuario)", "email"),
        {
          ...field("password", "Contraseña inicial", "text", randomPassword()),
          hint: "Cópiala y entrégasela. Es la única vez que la verás; después puedes cambiarla desde su ficha.",
        },
        ...(w
          ? []
          : [
              select("role", "Tipo de acceso", [
                { value: "TECHNICIAN", label: "Técnico (solo sus trabajos)" },
                { value: "ADMIN", label: "Responsable (acceso completo)" },
              ]),
              {
                ...field(
                  "hourlyCost",
                  "Coste laboral real por hora (€)",
                  "number",
                  "",
                  false,
                ),
                hint: "Obligatorio para técnicos. No se usa en responsables.",
              },
              field("specialty", "Especialidad", "text", "", false),
            ]),
      ],
    });
  const resetUserPassword = (x: { id: string; name: string }) =>
    setModal({
      title: `Nueva contraseña para ${x.name}`,
      action: "user-password",
      fixed: { id: x.id },
      fields: [
        {
          ...field("password", "Nueva contraseña", "text", randomPassword()),
          hint: "Se cerrarán sus sesiones abiertas. Cópiala antes de guardar.",
        },
      ],
    });
  const setUserActive = async (
    x: { id: string; name: string },
    active: boolean,
  ) => {
    if (
      !active &&
      !window.confirm(
        `¿Desactivar a ${x.name}? Dejará de poder entrar; sus datos se conservan.`,
      )
    )
      return;
    try {
      await request("/api/operations/user-active", { id: x.id, active });
      setToast(active ? "Usuario reactivado." : "Usuario desactivado.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const createCost = () =>
    setModal({
      title: "Añadir material o gasto",
      action: "cost",
      fields: [
        jobField(),
        select(
          "type",
          "Tipo",
          (isAdmin
            ? [
                "Materiales",
                "Desplazamiento",
                "Subcontratación",
                "Otros",
                "Gastos generales asignados",
              ]
            : ["Materiales"]
          ).map((x) => ({ value: x, label: x })),
        ),
        field("description", "Descripción"),
        {
          ...field("amount", "Coste neto (€)", "number"),
          hint: "Importe sin IVA recuperable. Si proviene de un documento, regístralo en la revisión para evitar duplicarlo.",
        },
      ],
    });
  const createHours = () =>
    setModal({
      title: "Registrar horas",
      action: "hours",
      photos: true,
      fields: [
        { ...jobField(), locked: !!selected?.id, addNew: { label: "+ Agregar nuevo trabajo", open: createJob } },
        { ...select("workerId", "Técnico", options(s.workers), s.user.workerId ?? undefined), picker: "worker" as const },
        select(
          "activity",
          "Actividad",
          [
            "Instalación",
            "Reparación",
            "Diagnóstico",
            "Mantenimiento",
            "Desplazamiento",
            "Preparación",
            "Otras",
          ].map((x) => ({ value: x, label: x })),
        ),
        field("date", "Fecha", "date", today()),
        field("startTime", "Desde", "time", "08:00"),
        field("endTime", "Hasta", "time"),
        select("billable", "¿Son horas facturables?", [
          { value: "true", label: "Sí" },
          { value: "false", label: "No" },
        ]),
        field("notes", "Observaciones", "textarea", "", false),
      ],
    });
  const openInvoice = () => router.push(selected?.id ? `/nueva-factura/${selected.id}` : "/nueva-factura");
  const createQuote = () => setQuoteBuilder(true);
  const createSale = (doc?: Doc, product?: SaleProduct) => {
    setReview(null);
    setModal({
      title: "Registrar factura de cliente",
      action: "sale",
      product,
      fixed: doc ? { documentId: doc.id } : {},
      extra: doc?.text,
      fields: [
        jobField(),
        field("number", "Número de factura"),
        field("description", "Concepto"),
        field("date", "Fecha", "date", today()),
        field("dueAt", "Fecha de vencimiento", "date", undefined, false),
        field("net", "Base neta (€)", "number"),
        field("tax", "Impuestos (€)", "number"),
        field("withholding", "Retención (€)", "number", "0"),
        {
          ...field("collected", "Importe ya cobrado (€)", "number", "0"),
          hint: "El cobro incluye impuestos y descuenta la retención.",
        },
      ],
    });
  };
  const payment = (sale: Sale) =>
    setModal({
      title: `Cobro · ${sale.number}`,
      action: "payment",
      fixed: { saleId: sale.id },
      fields: [
        {
          ...field(
            "collected",
            "Total cobrado hasta ahora (€)",
            "number",
            sale.collected,
          ),
          hint: `Total de la factura: ${euro(dec(sale.net).plus(sale.tax).minus(sale.withholding).toString())}. Introduce el total acumulado.`,
        },
      ],
    });
  const quick = (action: string) => {
    setAdd(false);
    const actions: Record<string, () => void> = {
      job: createJob,
      supplier: () => createContact("supplier"),
      customer: () => createContact("customer"),
      cost: () => setMaterial(true),
      hours: createHours,
      quote: () => router.push("/presupuestos"),
      invoice: () => router.push("/facturas-venta"),
      purchase: () => setUpload("PURCHASE"),
      delivery: () => setUpload("DELIVERY"),
      bulk: () => setBulk(true),
      photo: () => setUpload("PHOTO"),
      expense: () => setExpense(true),
      voice: () => setVoice(true),
    };
    actions[action]?.();
  };
  const run = async (action: string, payload: unknown) => {
    try {
      await request(`/api/operations/${action}`, payload);
      await saved();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const setJobArchived = async (job: Job, archive: boolean) => {
    if (archive && !window.confirm(`¿Retirar «${job.name}» de la lista? Se conservarán sus facturas, horas, documentos, material y presupuesto. Las reservas de material se mantienen. Podrás recuperarlo desde Retirados.`)) return;
    try {
      await request(`/api/operations/${archive ? "job-archive" : "job-restore"}`, { jobId: job.id });
      await load();
      setToast(archive ? "Trabajo retirado. Puedes recuperarlo desde Retirados." : "Trabajo recuperado.");
      if (selected?.id === job.id) router.push("/trabajos");
    } catch (e) { setError((e as Error).message); }
  };
  const jobTable = (rows: Job[]) =>
    rows.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Trabajo / cliente</th>
              <th>Estado</th>
              <th>Fecha prevista</th>
              {isAdmin && (
                <>
                  <th>Facturado neto</th>
                  <th>Beneficio bruto</th>
                </>
              )}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} className="row-link" onClick={() => router.push(jobPath(j))}>
                <td>
                  <Link className="job-link" href={jobPath(j)}>
                    {j.name}
                  </Link>
                  <div className="muted">
                    {j.number} · {j.customer.name}
                  </div>
                </td>
                <td>
                  <Pill>{j.status}</Pill>
                </td>
                <td>{fmtDate(j.plannedAt)}</td>
                {isAdmin && (
                  <>
                    <td>{euro(j.metrics?.net)}</td>
                    <td
                      className={
                        Number(j.metrics?.net) > 0 && Number(j.metrics?.gross) < 0
                          ? "text-red-600"
                          : "font-semibold text-teal-800"
                      }
                    >
                      {Number(j.metrics?.net) > 0 ? euro(j.metrics?.gross) : "Pendiente de facturar"}
                      <div className="muted">
                        {j.metrics?.margin
                          ? `${j.metrics.margin} % de margen`
                          : "Sin ventas registradas"}
                      </div>
                    </td>
                  </>
                )}
                <td>
                  {isAdmin && <button className="text-button mr-3" aria-label={`${j.archivedAt ? "Recuperar" : "Eliminar de la lista"} ${j.name}`} onClick={(e) => { e.stopPropagation(); void setJobArchived(j, !j.archivedAt); }}>{j.archivedAt ? "Recuperar" : "Eliminar"}</button>}
                  <Link
                    prefetch={true}
                    href={jobPath(j)}
                    aria-label={`Abrir ${j.name}`}
                  >
                    <ChevronRight size={16} className="text-slate-400" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : filter === "Retirados" ? (
      <Empty title="No hay trabajos retirados" description="Los trabajos que retires de la lista aparecerán aquí y podrás recuperarlos." />
    ) : (
      <Empty
        title={
          query ? "No hay coincidencias" : "Tu próximo trabajo empieza aquí"
        }
        description={
          isAdmin
            ? "Añade un cliente en Configuración y crea tu primer trabajo para reunir sus costes y horas."
            : "El responsable te asignará los trabajos. Aparecerán aquí cuando estén preparados."
        }
        action={
          isAdmin && (
            <Button variant="outline" onClick={createJob}>
              <Plus size={16} />
              Crear trabajo
            </Button>
          )
        }
      />
    );
  const openReview = async (d: Doc) => {
    setOpeningReview(d.id);
    try {
      const r = await fetch(`/api/documents/${d.id}/review`);
      const full = await r.json();
      if (!r.ok) throw Error(full.error);
      if (d.kind === "SALE") createSale(full);
      else setReview(full);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpeningReview(null);
    }
  };
  // Eliminar subidas sin confirmar; el servidor decide qué se puede borrar y explica el resto.
  const removeDocuments = async (ids: string[], what: string) => {
    if (
      !window.confirm(
        `¿Eliminar ${what}? Se borrarán también el archivo original y las imágenes preparadas. Esta acción no se puede deshacer.`,
      )
    )
      return;
    setDeletingDocs(true);
    try {
      const r = await request("/api/operations/document-delete", { ids });
      setSelectedDocs([]);
      setToast(
        r.blocked?.length
          ? `Eliminados ${r.deleted.length}. No se pudo eliminar: ${r.blocked.map((b: { reason: string }) => b.reason).join(" ")}`
          : r.deleted.length === 1
            ? "Documento eliminado."
            : `Eliminados ${r.deleted.length} documentos.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingDocs(false);
    }
  };
  const docsTable = (docs: Doc[], pending = false) =>
    docs.length ? (
      <div className="record-list">
        {selectedDocs.some((id) => docs.some((d) => d.id === id)) && (
          <div className="doc-selection">
            <strong>{selectedDocs.length} seleccionado(s)</strong>
            <Button
              size="sm"
              variant="outline"
              disabled={deletingDocs}
              onClick={() =>
                removeDocuments(
                  selectedDocs,
                  `${selectedDocs.length} documento(s)`,
                )
              }
            >
              <Trash2 size={16} /> Eliminar seleccionados
            </Button>
            <button className="text-button" onClick={() => setSelectedDocs([])}>
              Quitar selección
            </button>
          </div>
        )}
        {docs.map((d) => (
          <div className="record document-record" key={d.id}>
            {d.status !== "CONFIRMED" && (
              <label className="doc-select">
                <input
                  type="checkbox"
                  aria-label={`Seleccionar ${d.number ?? d.originalName}`}
                  checked={selectedDocs.includes(d.id)}
                  disabled={deletingDocs}
                  onChange={(e) =>
                    setSelectedDocs((cur) =>
                      e.target.checked
                        ? [...cur, d.id]
                        : cur.filter((x) => x !== d.id),
                    )
                  }
                />
              </label>
            )}
            <div className="document-record-main">
              <a
                className="job-link"
                href={`/api/documents/${d.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {d.number ?? d.originalName}
              </a>
              <small>
                {kindLabel[d.kind]} · {d.supplier?.name ?? fmtDate(d.createdAt)}
                {d.replacedBy || d.stockLots?.some((l) => l.invoiceDocumentId)
                  ? " · Facturado"
                  : d.kind === "DELIVERY" && d.stockLots?.length
                    ? " · Pendiente de factura"
                    : ""}
              </small>
              {!!d.valuedLots?.length && (
                <small>
                  Albaranes:{" "}
                  {[
                    ...new Map(
                      d.valuedLots.map((l) => [
                        l.document.id,
                        l.document.number ?? l.document.id,
                      ]),
                    ).values(),
                  ].join(", ")}
                </small>
              )}
              {d.error && <small className="text-amber-700">{d.error}</small>}
            </div>
            <div className="document-record-actions">
              <Pill>{docStatus[d.status]}</Pill>
              {isAdmin && ["REVIEW", "FAILED"].includes(d.status) && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => openReview(d)}
                  disabled={!!openingReview}
                >
                  {openingReview === d.id ? "Abriendo…" : "Revisar"}
                </Button>
              )}
              {!!d.stockLots?.length && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/inventario?albaran=${d.id}`}>Ver material</Link>
                </Button>
              )}
              {d.stockLots?.[0]?.invoiceDocumentId && (
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`/api/documents/${d.stockLots[0].invoiceDocumentId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver factura
                  </a>
                </Button>
              )}
              {d.status === "FAILED" && (
                <button
                  aria-label="Reintentar OCR"
                  onClick={() => run("retry", { documentId: d.id })}
                >
                  <RefreshCw size={16} />
                </button>
              )}
              {d.status !== "CONFIRMED" && (
                <button
                  className="doc-delete"
                  aria-label={`Eliminar ${d.number ?? d.originalName}`}
                  title={
                    d.status === "PROCESSING"
                      ? "Se está leyendo ahora mismo"
                      : "Eliminar subida"
                  }
                  disabled={deletingDocs || d.status === "PROCESSING"}
                  onClick={() =>
                    removeDocuments([d.id], `«${d.number ?? d.originalName}»`)
                  }
                >
                  <Trash2 size={16} /> Eliminar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <Empty
        title={pending ? "Todo al día" : "Sin documentos todavía"}
        description={
          pending
            ? "No hay documentos pendientes de revisión."
            : "Fotografía una factura o un albarán. El texto se leerá en segundo plano para que puedas revisarlo."
        }
      />
    );
  const documentActions = (
    <div className="document-actions" aria-label="Subir albaranes y facturas">
      <button
        aria-label="Subir albarán"
        className="document-action"
        onClick={() => {
          setAdd(false);
          setUpload("DELIVERY");
        }}
      >
        <span className="document-action-icon">
          <Truck size={23} />
        </span>
        <span>
          <strong>Subir albarán</strong>
          <small>Recibe material, con o sin precios.</small>
        </span>
        <ChevronRight size={20} />
      </button>
      {isAdmin && (
        <button
          aria-label="Subir factura de proveedor"
          className="document-action"
          onClick={() => {
            setAdd(false);
            setUpload("PURCHASE");
          }}
        >
          <span className="document-action-icon">
            <Files size={23} />
          </span>
          <span>
            <strong>Subir factura de proveedor</strong>
            <small>Completa costes y vincula albaranes.</small>
          </span>
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
  const salesTable = (sales: Sale[]) =>
    sales.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Factura / trabajo</th>
              <th>Base neta</th>
              <th>Total con impuestos</th>
              <th>Cobrado</th>
              <th>Pendiente</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sales.map((x) => {
              const gross = dec(x.net).plus(x.tax).minus(x.withholding),
                pending = gross.minus(x.collected);
              return (
                <tr key={x.id}>
                  <td>
                    <strong>{x.number}</strong>
                    {!!x.lines?.length && (
                      <details className="invoice-line-details">
                        <summary>Artículos ({x.lines.length})</summary>
                        {x.lines.map((l) => (
                          <p key={l.id}>
                            <strong>{l.description}</strong> · {l.quantity}{" "}
                            {l.unit} × {euro(l.price)} = {euro(l.net)}
                          </p>
                        ))}
                      </details>
                    )}
                    <div className="muted">
                      {x.jobName ?? x.description} · {fmtDate(x.date)}
                    </div>
                  </td>
                  <td>{euro(x.net)}</td>
                  <td>{euro(gross.toString())}</td>
                  <td>{euro(x.collected)}</td>
                  <td
                    className={
                      pending.gt(0) ? "text-amber-700" : "text-teal-700"
                    }
                  >
                    {euro(pending.toString())}
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => payment(x)}
                    >
                      Registrar cobro
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        title="Todavía no hay facturas de cliente"
        description="Registra las bases e impuestos de tu factura y asígnala al trabajo. Los cobros se controlan por separado."
        action={
          <Button variant="outline" onClick={() => openInvoice()}>
            Registrar factura
          </Button>
        }
      />
    );
  const jobDetail = (j: Job) => (
    <>
      <header className="jd-head">
        <Link href="/trabajos" className="text-button flex gap-2 mb-3">
          <ArrowLeft size={15} />
          Todos los trabajos
        </Link>
        <div className="jd-title">
          <div>
            <h1>{j.name}</h1>
            <p className="jd-sub">
              {isAdmin ? <Link href={`/clientes/${j.customer.id}`} title="Ver ficha del cliente">{j.customer.name}</Link> : j.customer.name}
              {j.address && <> · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address)}`} target="_blank" rel="noreferrer">{j.address}</a></>}
            </p>
            <div className="jd-meta">
              <Pill>{j.status}</Pill>
              <span>{j.number} · {j.service} · {j.worker?.name ?? "Sin técnico"}</span>
              {isAdmin && s.jobs.filter((x) => x.customer.id === j.customer.id && x.id !== j.id).length > 0 && (
                <Link href={`/clientes/${j.customer.id}`}>{s.jobs.filter((x) => x.customer.id === j.customer.id && x.id !== j.id).length} trabajos más de este cliente</Link>
              )}
            </div>
          </div>
          <div className="jd-totals">
            {isAdmin && (
              <div>
                <span>Materiales</span>
                <strong>{euro(sum(j.costs.map((c) => c.amount)).toString())}</strong>
              </div>
            )}
            <div>
              <span>Horas</span>
              <strong>{number(sum(j.hours.map((h) => h.hours)).toString())} h</strong>
              {isAdmin && j.metrics && <small>{euro(j.metrics.labor)}</small>}
            </div>
            {isAdmin && j.metrics && (
              <div className="total">
                <span>Costes totales</span>
                <strong>{euro(j.metrics.direct)}</strong>
              </div>
            )}
          </div>
        </div>
      </header>
      {j.archivedAt && <div className="info-banner mb-5">Trabajo retirado. Sus datos e historial se conservan; recupéralo para volver a trabajar con él.{isAdmin && <> <button className="text-button" onClick={() => void setJobArchived(j, false)}>Recuperar trabajo</button></>}</div>}
      {!j.archivedAt && (() => {
        const finished = !!(j.finishedAt || j.status === "Finalizado");
        return (
          <div className="jd-actions">
            <Button onClick={createHours}>Registrar horas</Button>
            <Button variant="outline" onClick={() => setMaterial(true)}>Añadir material</Button>
            <MoreMenu>
              {isAdmin && j.status === "Pendiente" && <button role="menuitem" onClick={() => run("status", { jobId: j.id, status: "En proceso" })}>Iniciar trabajo</button>}
              {(!finished || isAdmin) && <button role="menuitem" onClick={() => run("status", { jobId: j.id, status: finished ? "En proceso" : "Finalizado" })}>{finished ? "Reabrir trabajo" : "Marcar finalizado"}</button>}
              <Link href={`/inventario?trabajo=${j.id}`} role="menuitem">Usar material de almacén</Link>
              <button role="menuitem" onClick={() => setUpload("DELIVERY")}>Fotografiar albarán</button>
              <button role="menuitem" onClick={() => setUpload("PHOTO")}>Añadir fotografías</button>
              {isAdmin && <button role="menuitem" onClick={createQuote}>Crear presupuesto</button>}
              {isAdmin && <button role="menuitem" onClick={() => openInvoice()}>Registrar factura</button>}
              {isAdmin && <button role="menuitem" onClick={() => editJob(j)}>Editar datos del trabajo</button>}
              {isAdmin && <button role="menuitem" className="mm-danger" onClick={() => void setJobArchived(j, true)}>Eliminar de la lista</button>}
            </MoreMenu>
          </div>
        );
      })()}
      {(() => {
        const docs = s.documents.filter((d) => d.jobId === j.id);
        const done = !!(j.finishedAt || ["Finalizado", "Facturado", "Cobrado"].includes(j.status));
        const tabs = [
          { id: "costes", label: isAdmin ? "Materiales" : "Documentos", n: isAdmin ? j.costs.length : docs.length, show: true },
          { id: "horas", label: "Horas", n: j.hours.length, show: true },
          { id: "facturas", label: "Facturas", n: j.sales.length, show: isAdmin },
          { id: "docs", label: "Documentos", n: docs.length, show: isAdmin },
          { id: "resumen", label: "Resumen", n: 0, show: isAdmin && done },
        ].filter((t) => t.show);
        const cur = jobTabState.id === j.id ? jobTabState.tab : "";
        const tab = tabs.some((t) => t.id === cur) ? cur : tabs[0].id;
        return (
          <>
            {(j.pendingStockCosts ?? 0) > 0 && (
              <div className="info-banner">
                <Clock size={22} />
                <div>
                  <strong>Hay materiales usados pendientes de precio</strong>El resultado será provisional hasta vincular la factura del albarán.
                </div>
              </div>
            )}
            <div className="jd-tabs" role="tablist">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setJobTabState({ id: j.id, tab: t.id })}>
                  {t.label}
                  {t.n > 0 && <span>{t.n}</span>}
                </button>
              ))}
            </div>
            {tab === "resumen" && isAdmin && (
              <>
                {j.metrics && (
                  <div className="stats">
                    <Stat label="Facturado neto" value={euro(j.metrics.net)} note={`Cobrado con impuestos: ${euro(j.metrics.collected)}`} />
                    <Stat label="Costes directos" value={euro(j.metrics.direct)} note={`Mano de obra: ${euro(j.metrics.labor)} · ${number(j.metrics.hours)} h`} icon={Wallet} />
                    <Stat
                      label="Beneficio bruto"
                      value={Number(j.metrics.net) > 0 ? euro(j.metrics.gross) : "Sin facturar"}
                      note={Number(j.metrics.net) > 0 ? `Margen: ${j.metrics.margin ?? "—"} %` : `Aún sin ventas: ${euro(j.metrics.direct)} de costes`}
                      highlight
                      icon={TrendingUp}
                    />
                  </div>
                )}
                <Panel title="Presupuesto y ejecución">
                  {j.quotes.length ? (
                    <div className="record-list">
                      {j.quotes.map((q) => (
                        <div key={q.id} className="record">
                          <div>
                            <strong>{q.name}</strong>
                            <small>Coste previsto: {euro(q.cost)} · {number(q.plannedHours)} h</small>
                            <small>Precio neto: {euro(q.net)}</small>
                            {q.approved && j.metrics && <small>Desviación de horas: {number(dec(j.metrics.hours).minus(q.plannedHours).toString())} h</small>}
                          </div>
                          {q.approved ? <Pill>Aprobado</Pill> : !j.archivedAt ? <Button variant="outline" size="sm" onClick={() => run("approveQuote", { quoteId: q.id })}>Aprobar</Button> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty title="Sin presupuesto" description="Calcula el precio a partir de tus costes y del margen que quieras conseguir." action={!j.archivedAt ? <Button variant="outline" onClick={createQuote}>Crear presupuesto</Button> : undefined} />
                  )}
                </Panel>
              </>
            )}
            {tab === "costes" && (
              <Panel title={isAdmin ? "Materiales y otros costes" : "Documentos del trabajo"} subtitle={isAdmin ? "Solo registros confirmados. Importes netos de IVA recuperable." : undefined}>
                {isAdmin ? (
                  j.costs.length ? (
                    <div className="record-list">
                      {j.costs.map((c) => (
                        <div className="record" key={c.id}>
                          <div>
                            {c.description}
                            <small>
                              {c.type}
                              {c.documentId && (
                                <>
                                  {" "}·{" "}
                                  <a className="underline" href={`/api/documents/${c.documentId}`}>Ver origen</a>
                                </>
                              )}
                            </small>
                          </div>
                          <strong>{euro(c.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty title="Sin materiales ni costes" description="Añade material o confirma una compra en la bandeja de documentos." action={!j.archivedAt ? <Button variant="outline" onClick={() => setMaterial(true)}>Añadir material</Button> : undefined} />
                  )
                ) : docs.length ? (
                  docsTable(docs)
                ) : (
                  <Empty title="Sin documentos" description="Aún no hay documentos en este trabajo." />
                )}
              </Panel>
            )}
            {tab === "horas" && (
              <Panel title="Horas registradas" subtitle="El coste se conserva con la tarifa del momento del registro.">
                {j.hours.length ? (
                  <div className="record-list">
                    {j.hours.map((h) => (
                      <div className="record" key={h.id}>
                        <div>
                          {h.worker?.name ?? s.user.name} · {h.activity}
                          <small>
                            {fmtDate(h.date)} · {h.billable === false ? "No facturable" : "Facturable"}
                            {h.notes && ` · ${h.notes}`}
                          </small>
                        </div>
                        <strong>{number(h.hours)} h</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty title="Aún no hay horas" description="Registra el tiempo que has dedicado a este trabajo." action={!j.archivedAt ? <Button variant="outline" onClick={createHours}>Registrar horas</Button> : undefined} />
                )}
              </Panel>
            )}
            {tab === "facturas" && isAdmin && <Panel title="Facturas del trabajo">{j.sales.length ? salesTable(j.sales) : <Empty title="Sin facturas" description="Registra la factura de este trabajo cuando esté lista." action={!j.archivedAt ? <Button variant="outline" onClick={() => openInvoice()}>Registrar factura</Button> : undefined} />}</Panel>}
            {tab === "docs" && isAdmin && <Panel title="Documentos adjuntos">{docs.length ? docsTable(docs) : <Empty title="Sin documentos" description="Fotografía un albarán o añade fotografías desde «Más»." />}</Panel>}
          </>
        );
      })()}
    </>
  );
  const customerDetail = (c: Customer) => {
    const rows = s.jobs.filter((j) => j.customer.id === c.id);
    const tot = (f: (m: NonNullable<Job["metrics"]>) => string) => sum(rows.map((j) => (j.metrics ? f(j.metrics) : 0)));
    const net = tot((m) => m.net), direct = tot((m) => m.direct), gross = tot((m) => m.gross), collected = tot((m) => m.collected), hours = tot((m) => m.hours);
    const billed = rows.filter((j) => Number(j.metrics?.net ?? 0) > 0);
    const margins = billed.map((j) => Number(j.metrics?.margin ?? 0));
    const open = rows.filter((j) => !j.archivedAt && !(j.finishedAt || ["Finalizado", "Facturado", "Cobrado"].includes(j.status)));
    const sales = s.sales.filter((x) => x.customerId === c.id || rows.some((j) => j.id === x.jobId));
    const owed = sum(sales.map((x) => dec(x.net).plus(x.tax).minus(x.withholding).minus(x.collected)));
    const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)} %`);
    return (
      <>
        <header className="jd-head">
          <Link href="/clientes" className="text-button flex gap-2 mb-3">
            <ArrowLeft size={15} />
            Todos los clientes
          </Link>
          <div className="jd-title">
            <div>
              <h1>{c.name}</h1>
              <p className="jd-sub">{[c.taxId, c.address].filter(Boolean).join(" · ") || "Datos fiscales y dirección pendientes"}</p>
              <div className="jd-meta">
                <span>
                  {c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : "Sin teléfono"}
                  {" · "}
                  {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "Sin correo"}
                </span>
              </div>
            </div>
            <Button variant="outline" onClick={() => createContact("customer", c)}>Editar cliente</Button>
          </div>
        </header>
        <div className="stats">
          <Stat label="Facturado neto" value={euro(net.toString())} note={`${sales.length} facturas · ${billed.length} trabajos facturados`} />
          <Stat label="Cobrado" value={euro(collected.toString())} note={owed.gt(0) ? `Pendiente de cobro: ${euro(owed.toString())}` : "Sin deuda pendiente"} />
          <Stat label="Costes directos" value={euro(direct.toString())} note={`${number(hours.toString())} h de trabajo`} icon={Wallet} />
          <Stat label="Beneficio bruto" value={euro(gross.toString())} note={`Margen ponderado: ${pct(net.gt(0) ? gross.div(net).mul(100).toNumber() : null)}`} highlight icon={TrendingUp} />
        </div>
        <div className="stats">
          <Stat label="Trabajos" value={String(rows.length)} note={`${open.length} abiertos · ${rows.length - open.length} terminados o retirados`} />
          <Stat label="Margen medio por trabajo" value={pct(margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null)} note={margins.length ? `Mejor ${pct(Math.max(...margins))} · peor ${pct(Math.min(...margins))}` : "Aún sin trabajos facturados"} />
          <Stat label="Ticket medio" value={billed.length ? euro(net.div(billed.length).toString()) : "—"} note="Facturado neto por trabajo facturado" />
          <Stat label="Beneficio por hora" value={hours.gt(0) ? euro(gross.div(hours).toString()) : "—"} note="Beneficio bruto entre horas trabajadas" />
        </div>
        <Panel title="Trabajos del cliente">{jobTable(rows)}</Panel>
        {sales.length > 0 && <Panel title="Facturas del cliente">{salesTable(sales)}</Panel>}
      </>
    );
  };
  const download = () => {
    const rows = [
      [
        "Trabajo",
        "Cliente",
        "Servicio",
        "Ingresos netos",
        "Costes directos",
        "Beneficio bruto",
        "Gastos generales asignados",
        "Operativo estimado",
        "Margen %",
        "Horas",
        "Cobrado bruto",
      ],
      ...s.jobs.map((j) => [
        j.name,
        j.customer.name,
        j.service,
        j.metrics?.net,
        j.metrics?.direct,
        j.metrics?.gross,
        j.metrics?.overhead,
        j.metrics?.operating,
        j.metrics?.margin,
        j.metrics?.hours,
        j.metrics?.collected,
      ]),
    ];
    const content =
      "\uFEFF" +
      rows
        .map((r) =>
          r
            .map(
              (c) =>
                '"' +
                String(c ?? "")
                  .replace(/^[=+@-]/, "'$&")
                  .replaceAll('"', '""') +
                '"',
            )
            .join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `rentabilidad-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const serviceData = services
    .map((name) => {
      const rows = s.jobs.filter((j) => j.service === name),
        net = sum(rows.map((j) => j.metrics?.net ?? 0)),
        gross = sum(rows.map((j) => j.metrics?.gross ?? 0)),
        hours = sum(rows.map((j) => j.metrics?.hours ?? 0));
      return {
        name,
        count: rows.length,
        net: net.toNumber(),
        direct: sum(rows.map((j) => j.metrics?.direct ?? 0)).toNumber(),
        gross: gross.toNumber(),
        operating: sum(rows.map((j) => j.metrics?.operating ?? 0)).toNumber(),
        hours: hours.toNumber(),
        margin: net.gt(0) ? gross.div(net).mul(100).toNumber() : null,
        perHour: hours.gt(0) ? gross.div(hours).toNumber() : null,
        ticket: rows.length ? net.div(rows.length).toNumber() : 0,
      };
    })
    .filter((x) => x.count)
    .sort(
      (a, b) =>
        Number(b[sort as keyof typeof b] ?? 0) -
        Number(a[sort as keyof typeof a] ?? 0),
    );
  const financialStats = (
    <div className="stats">
      <Stat
        label="Facturado neto"
        value={euro(total("net"))}
        note="Bases registradas · sin impuestos"
        icon={Files}
      />
      <Stat
        label="Costes directos"
        value={euro(total("direct"))}
        note="Materiales, horas y otros gastos"
        icon={Wallet}
      />
      <Stat
        label="Beneficio bruto"
        value={euro(total("gross"))}
        note="Facturado neto menos costes directos"
        highlight
        icon={TrendingUp}
      />
      <Stat
        label="Pendiente de cobro"
        value={euro(total("pending"))}
        note="Importe con impuestos y retenciones"
        icon={Clock}
      />
    </div>
  );
  return (
    <>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Zap size={23} fill="currentColor" />
          </span>
          instala<span className="brand-dot">.</span>
        </Link>
        <button className="create-btn" onClick={() => setAdd(true)}>
          <Plus size={20} strokeWidth={2.6} />
          Crear
        </button>
        <nav>
          {visibleNav.filter((n) => primaryHrefs.includes(n.href)).map((n) => (
            <Link
              prefetch={true}
              className={`nav-link ${navActive(n.href) ? "active" : ""}`}
              href={n.href}
              key={n.href}
            >
              <n.icon size={22} />
              {n.label}
              <NavigationStatus />
            </Link>
          ))}
        </nav>
        <button className="profile" onClick={() => setMenu(true)} aria-haspopup="dialog">
          <span className="avatar">{s.user.name.slice(0, 2).toUpperCase()}</span>
          <span className="min-w-0 flex-1 text-left">
            <strong className="block truncate">{s.user.name}</strong>
            <small className="text-slate-400">{isAdmin ? "Responsable" : "Técnico"} · Menú</small>
          </span>
          <ChevronRight size={16} />
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="search">
            <Search size={18} />
            <input
              aria-label="Buscar en la empresa"
              placeholder="Buscar artículos, alias, referencias, trabajos…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
            />
            <div
              className="search-pop"
              onClick={(e) => (e.target as HTMLElement).closest("a") && setSearchOpen(false)}
            >
              {query && searchOpen && (() => {
                const jobHits = activeJobs.filter((j) => matches(j.name, j.number, j.customer.name, j.address, j.service, j.plannedAt)).slice(0, 8);
                const customerHits = s.customers.filter((x) => matches(x.name, x.taxId, x.phone, x.email, x.address)).slice(0, 8);
                const supplierHits = s.suppliers.filter((x) => matches(x.name, x.taxId, x.email, x.phone)).slice(0, 8);
                const docHits = [
                  ...s.documents.filter((x) => matches(x.number, x.originalName, x.text)),
                  ...(documentMatches ?? []).filter((d) => !s.documents.some((x) => x.id === d.id && matches(x.number, x.originalName))),
                ].slice(0, 8);
                const saleHits = s.sales.filter((x) => matches(x.number, x.description, x.jobName, x.date)).slice(0, 8);
                const items = searchScope === "company" ? [] : productMatches?.items ?? [];
                const company = searchScope !== "products";
                const none = !items.length && !(company && (jobHits.length || customerHits.length || supplierHits.length || docHits.length || saleHits.length));
                const Section = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) =>
                  count ? (
                    <section className="sr-section">
                      <h3>{title} <span>{count}</span></h3>
                      <div className="sr-grid">{children}</div>
                    </section>
                  ) : null;
                return (
                  <>
                    <div className="sr-head">
                      <strong>Resultados para «{query}»</strong>
                      <select aria-label="Buscar en" value={searchScope} onChange={(e) => setSearchScope(e.target.value)}>
                        <option value="all">Toda la empresa</option>
                        <option value="products">Solo artículos</option>
                        <option value="company">Trabajos, contactos y documentos</option>
                      </select>
                      <button type="button" className="text-button" onClick={() => { setQuery(""); setSearchScope("all"); }}>Cerrar</button>
                    </div>
                    {(productsSearching || documentsSearching) && <p className="small-note sr-note" role="status">Buscando…</p>}
                    {(productSearchError || documentSearchError) && <p className="error sr-note" role="alert">No se pudo completar la búsqueda. Vuelve a intentarlo.</p>}
                    <Section title="Artículos" count={items.length}>
                      {items.map((p) => (
                        <Link className="sr-card" key={p.id} href={`/inventario/${p.code}`}>
                          <strong>{p.alias || p.description}</strong>
                          {p.alias && <span>{p.description}</span>}
                          <small>{p.reference || p.code}{p.brand ? ` · ${p.brand}` : ""}</small>
                          <small>{p.onHand} {p.unit} en almacén{p.location ? ` · ${p.location}` : ""}</small>
                        </Link>
                      ))}
                    </Section>
                    {company && (
                      <>
                        <Section title="Trabajos" count={jobHits.length}>
                          {jobHits.map((j) => (
                            <Link className="sr-card" key={j.id} href={jobPath(j)}>
                              <strong>{j.number} · {j.name}</strong>
                              <span>{j.customer.name}</span>
                              <small>{j.address || "Sin dirección"}</small>
                              <small>{j.service}{j.plannedAt ? ` · ${new Date(j.plannedAt).toLocaleDateString("es-ES")}` : ""}</small>
                              <Pill>{j.status}</Pill>
                              {isAdmin && j.metrics && <small>{number(j.metrics.hours)} h · facturado {euro(j.metrics.net)}</small>}
                            </Link>
                          ))}
                        </Section>
                        <Section title="Clientes" count={customerHits.length}>
                          {customerHits.map((x) => (
                            <Link className="sr-card" key={x.id} href="/clientes">
                              <strong>{x.name}</strong>
                              <small>{[x.taxId, x.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}</small>
                              {x.email && <small>{x.email}</small>}
                              {x.address && <small>{x.address}</small>}
                            </Link>
                          ))}
                        </Section>
                        <Section title="Proveedores" count={supplierHits.length}>
                          {supplierHits.map((x) => (
                            <Link className="sr-card" key={x.id} href="/proveedores">
                              <strong>{x.name}</strong>
                              <small>{[x.taxId, x.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}</small>
                              {x.email && <small>{x.email}</small>}
                            </Link>
                          ))}
                        </Section>
                        <Section title="Documentos" count={docHits.length}>
                          {docHits.map((x) => (
                            <a className="sr-card" key={x.id} href={`/api/documents/${x.id}`}>
                              <strong>{x.number ?? x.originalName}</strong>
                              {x.number && <small>{x.originalName}</small>}
                              <Pill>{docStatus[x.status]}</Pill>
                            </a>
                          ))}
                        </Section>
                        <Section title="Facturas de venta" count={saleHits.length}>
                          {saleHits.map((x) => (
                            <Link className="sr-card" key={x.id} href="/facturas-venta">
                              <strong>{x.number}</strong>
                              <span>{x.description}</span>
                              <small>{x.jobName} · {x.date}</small>
                              <small>{euro(x.net)} sin IVA</small>
                            </Link>
                          ))}
                        </Section>
                      </>
                    )}
                    {none && !productsSearching && !documentsSearching && <p className="small-note sr-note">Nada coincide. Prueba con parte del nombre, referencia, cliente o dirección.</p>}
                  </>
                );
              })()}
            </div>
          </div>
          <div className="top-right">
            <button className="top-avatar" aria-label="Menú" aria-haspopup="dialog" onClick={() => setMenu(true)}>
              <span className="avatar">{s.user.name.slice(0, 2).toUpperCase()}</span>
            </button>
          </div>
        </header>
        <main className="content">
          {s.jobs.some((j) => (j.pendingStockCosts ?? 0) > 0) && (
            <div className="info-banner">
              <Clock size={21} />
              <div>
                <strong>Hay material utilizado pendiente de valorar</strong>Los
                beneficios son provisionales hasta registrar las facturas de
                esos albaranes.{" "}
                <Link className="text-button" href="/inventario">
                  Revisar almacén
                </Link>
              </div>
            </div>
          )}

          {error && (
            <div className="error" role="alert">
              {error}
              <button className="float-right underline" onClick={load}>
                Actualizar
              </button>
            </div>
          )}
          {!section && (
            <>
              {!s.jobs.length && (
                <div className="info-banner">
                  <Zap size={25} />
                  <div>
                    <strong>Bienvenido a tu nueva forma de trabajar</strong>
                    {isAdmin
                      ? "Empieza añadiendo un cliente y tu primer trabajo. Los indicadores se calcularán con tus registros reales."
                      : "Aquí encontrarás tus trabajos, direcciones y partes de horas."}
                  </div>
                </div>
              )}
              <HomeBoard
                userId={s.user.id}
                initial={s.user.homeLayout}
                company={s.company.name}
                links={nav.filter((n) => n.href !== "/" && (isAdmin || ["/trabajos", "/horas", "/inventario", "/facturas"].includes(n.href)))}
                defaultLinks={isAdmin ? ["/trabajos", "/ventas", "/contactos", "/inventario", "/horas", "/gastos"] : ["/trabajos", "/horas"]}
                blocks={[
                  ...(isAdmin
                    ? [{ id: "analytics", title: "Análisis del negocio", wide: true, node: <AnalyticsHome /> }]
                    : [
                        {
                          id: "mystats",
                          title: "Mis trabajos",
                          wide: true,
                          node: (
                            <div className="stats">
                              <Stat label="Mis trabajos" value={String(s.jobs.length)} note="Asignados a ti" icon={BriefcaseBusiness} />
                              <Stat label="Por terminar" value={String(s.jobs.filter((j) => !["Finalizado", "Facturado", "Cobrado"].includes(j.status)).length)} note="Pendientes o en curso" icon={Clock} />
                            </div>
                          ),
                        },
                      ]),
                  {
                    id: "jobs",
                    title: "Trabajos en marcha",
                    node: (
                      <Panel
                        title="Trabajos en marcha"
                        action={
                          <Link href="/trabajos" className="text-button flex gap-1">
                            Ver todos
                            <ArrowUpRight size={14} />
                          </Link>
                        }
                      >
                        {jobTable(jobs.filter((j) => !["Finalizado", "Facturado", "Cobrado"].includes(j.status)).slice(0, 5))}
                      </Panel>
                    ),
                  },
                  {
                    id: "docs",
                    title: "Documentos por revisar",
                    node: (
                      <Panel title="Documentos por revisar">
                        {docsTable(s.documents.filter((d) => ["REVIEW", "FAILED", "QUEUED", "PROCESSING"].includes(d.status)).slice(0, 5), true)}
                      </Panel>
                    ),
                  },
                  ...(isAdmin
                    ? [
                        {
                          id: "insights",
                          title: "Cómo mejorar mi negocio",
                          node: (
                            <Panel title="Cómo mejorar mi negocio">
                              {s.jobs.some((j) => Number(j.metrics?.net) > 0 && Number(j.metrics?.gross) < 0) ? (
                        <div className="record-list">
                          {s.jobs
                            .filter((j) => Number(j.metrics?.net) > 0 && Number(j.metrics?.gross) < 0)
                            .map((j) => (
                              <div className="record" key={j.id}>
                                <div>
                                  <Link
                                    prefetch={true}
                                    className="job-link"
                                    href={jobPath(j)}
                                  >
                                    {j.name}
                                  </Link>
                                  <small>
                                    {euro(j.metrics?.direct)} de coste frente a{" "}
                                    {euro(j.metrics?.net)} facturado. Comprueba
                                    si falta facturación antes de valorar el
                                    resultado.
                                  </small>
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <Empty
                          title="Las decisiones empiezan con datos"
                          description="Cuando registres trabajos y costes, podrás detectar desviaciones. No se proponen precios sin un histórico suficiente."
                        />
                      )}
                            </Panel>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </>
          )}
          {section === "trabajos" &&
            (selected ? (
              jobDetail(selected)
            ) : (
              <>
                <div className="page-head">
                  <div>
                    <div className="eyebrow">DE PRINCIPIO A FIN</div>
                    <h1 className="mt-2">
                      {isAdmin ? "Tus trabajos" : "Mis trabajos"}
                    </h1>
                    <p className="subtitle">
                      Lo que necesitas saber de cada instalación, en un solo
                      expediente.
                    </p>
                  </div>
                  {isAdmin && (
                    <Button onClick={createJob}>
                      <Plus size={17} />
                      Crear trabajo
                    </Button>
                  )}
                </div>
                <div className="flex gap-3 mb-5 items-center">
                  <select
                    aria-label="Filtrar por estado"
                    className="max-w-64 mb-0"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    {["Todos", ...statuses, ...(isAdmin ? ["Retirados"] : [])].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <span className="small-note">{jobs.length} trabajos</span>
                </div>
                <Panel
                  title="Listado de trabajos"
                  action={
                    isAdmin && (
                      <button className="text-button" onClick={createJob}>
                        + Crear trabajo
                      </button>
                    )
                  }
                >
                  {jobTable(jobs)}
                </Panel>
              </>
            ))}
          {section === "facturas" && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">DEL PAPEL A TU NEGOCIO</div>
                  <h1 className="mt-2">Albaranes y facturas</h1>
                  <p className="subtitle">
                    Elige qué quieres subir. Leemos los datos y tú los revisas
                    antes de guardar.
                  </p>
                </div>
                {isAdmin && (
                  <div className="actions">
                    <Button variant="outline" onClick={() => setBulk(true)}>
                      <FolderUp size={16} />
                      Subir varios o una carpeta
                    </Button>
                    {s.documents.some((d) => d.status === "REVIEW" && ["PURCHASE", "CREDIT"].includes(d.kind)) && (
                      <Button
                        loading={archiving}
                        onClick={async () => {
                          setArchiving(true);
                          try {
                            setArchiveResult(await request("/api/operations/purchase-archive", {}));
                            await load();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setArchiving(false);
                          }
                        }}
                      >
                        Archivar facturas y abonos correctos (
                        {s.documents.filter((d) => d.status === "REVIEW" && ["PURCHASE", "CREDIT"].includes(d.kind)).length})
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {documentActions}
              <div className="document-tabs" aria-label="Mostrar documentos">
                {[
                  { id: "all", label: "Todos" },
                  { id: "pending", label: "Pendientes de revisar" },
                  { id: "confirmed", label: "Guardados" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    aria-pressed={documentView === tab.id}
                    onClick={() => setDocumentView(tab.id)}
                  >
                    {tab.label}
                    <span>
                      {
                        s.documents.filter(
                          (d) =>
                            tab.id === "all" ||
                            (tab.id === "pending"
                              ? [
                                  "REVIEW",
                                  "FAILED",
                                  "QUEUED",
                                  "PROCESSING",
                                ].includes(d.status)
                              : ["CONFIRMED", "ARCHIVED"].includes(d.status)),
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
              <Panel
                title="Bandeja de documentos"
                subtitle="Los documentos pendientes de revisión todavía no afectan al beneficio."
              >
                {docsTable(
                  s.documents.filter(
                    (d) =>
                      (documentView === "all" ||
                        (documentView === "pending"
                          ? [
                              "REVIEW",
                              "FAILED",
                              "QUEUED",
                              "PROCESSING",
                            ].includes(d.status)
                          : ["CONFIRMED", "ARCHIVED"].includes(d.status))) &&
                      matches(
                        d.originalName,
                        d.number,
                        d.supplier?.name,
                        d.text,
                      ),
                  ),
                  documentView === "pending",
                )}
              </Panel>
              {isAdmin && (
                <Panel
                  title="Facturas de cliente y cobros"
                  subtitle="La base genera ingresos; el cobro indica lo que has recibido."
                  action={
                    <button
                      className="text-button"
                      onClick={() => openInvoice()}
                    >
                      Registrar factura de cliente
                    </button>
                  }
                >
                  {salesTable(
                    s.sales.filter((x) =>
                      matches(x.number, x.jobName, x.description),
                    ),
                  )}
                </Panel>
              )}
            </>
          )}
          {section === "clientes" && isAdmin && pathname.split("/")[2] && (s.customers.find((c) => c.id === pathname.split("/")[2]) ? customerDetail(s.customers.find((c) => c.id === pathname.split("/")[2])!) : <Empty title="Cliente no encontrado" description="Puede que se haya eliminado." action={<Link href="/clientes" className="text-button">Volver a clientes</Link>} />)}
          {section === "clientes" && isAdmin && !pathname.split("/")[2] && (
            <>
              <div className="page-head customer-head">
                <div>
                  <h1>Clientes</h1>
                  <p className="subtitle">Guarda sus datos y selecciónalos al crear un trabajo.</p>
                </div>
                <Button onClick={() => createContact("customer")}><Plus size={17} /> Añadir cliente</Button>
              </div>
              <Panel title="Tus clientes">
                <div className="customer-search">
                  <label htmlFor="customer-search">Buscar cliente</label>
                  <input id="customer-search" type="search" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Nombre, teléfono, correo o NIF" />
                </div>
                {s.customers.length === 0 ? (
                  <Empty title="Aún no tienes clientes" description="Añade el primero para poder asignarlo a sus trabajos." action={<Button onClick={() => createContact("customer")}>Añadir cliente</Button>} />
                ) : s.customers.filter((c) => matchesSearch(customerQuery, [c.name, c.taxId, c.address, c.phone, c.email])).length === 0 ? (
                  <p className="customer-empty" role="status">No hay clientes que coincidan con la búsqueda.</p>
                ) : (
                  <div className="record-list">
                    {s.customers.filter((c) => matchesSearch(customerQuery, [c.name, c.taxId, c.address, c.phone, c.email])).map((c) => (
                      <div className="record customer-record" key={c.id}>
                        <div><Link href={`/clientes/${c.id}`}><strong>{c.name}</strong></Link><small>{[c.taxId, c.address].filter(Boolean).join(" · ") || "Datos fiscales y dirección pendientes"}</small><small>{[c.phone, c.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}</small></div>
                        <Button variant="outline" size="sm" onClick={() => createContact("customer", c)} aria-label={`Editar ${c.name}`}>Editar</Button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </>
          )}
          {section === "proveedores" && isAdmin && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">TUS COLABORADORES HABITUALES</div>
                  <h1 className="mt-2">Proveedores</h1>
                  <p className="subtitle">
                    Contactos, condiciones y compras, siempre a mano.
                  </p>
                </div>
                <Button onClick={() => createContact("supplier")}>
                  <Plus size={17} />
                  Añadir proveedor
                </Button>
              </div>
              <Panel
                title="Proveedores de tu empresa"
                action={
                  <button
                    className="text-button"
                    onClick={() => createContact("supplier")}
                  >
                    + Añadir proveedor
                  </button>
                }
              >
                {s.suppliers.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Proveedor</th>
                          <th>Contacto</th>
                          <th>Condiciones</th>
                          <th>Documentos</th>
                          <th>Cuentas</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {s.suppliers
                          .filter((x) => matches(x.name, x.taxId, x.email))
                          .map((x) => (
                            <tr key={x.id}>
                              <td>
                                <strong>{x.name}</strong>
                                <div className="muted">
                                  {x.taxId || "Sin NIF / CIF"}
                                </div>
                              </td>
                              <td>
                                {x.contact || x.phone || "—"}
                                <div className="muted">{x.email}</div>
                              </td>
                              <td>
                                {x.terms || "Sin condiciones registradas"}
                              </td>
                              <td>
                                {
                                  s.documents.filter(
                                    (d) => d.supplierId === x.id,
                                  ).length
                                }
                              </td>
                              <td>
                                <Link href={`/cuentas/${x.id}`} className="text-button">
                                  Ver cuentas
                                </Link>
                              </td>
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() => createContact("supplier", x)}
                                >
                                  Editar
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="Añade tu primer proveedor"
                    description="Guarda sus datos para asociar facturas y albaranes a tus trabajos."
                    action={
                      <Button
                        variant="outline"
                        onClick={() => createContact("supplier")}
                      >
                        Añadir proveedor
                      </Button>
                    }
                  />
                )}
              </Panel>
              <div className="info-banner">
                <Truck size={25} />
                <div>
                  <strong>Importación de documentos disponible</strong>Puedes
                  subir PDF e imágenes. Las conexiones automáticas y la
                  comparación normalizada de precios se incorporarán en la fase
                  2.
                </div>
              </div>
            </>
          )}
          {section === "beneficios" && isAdmin && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">CONOCE LO QUE GANAS</div>
                  <h1 className="mt-2">Beneficios</h1>
                  <p className="subtitle">
                    Resultados de todos los registros. Bases netas de impuestos
                    recuperables.
                  </p>
                </div>
                <Button variant="outline" onClick={download}>
                  <Download size={16} />
                  Exportar CSV
                </Button>
              </div>
              {financialStats}
              <div className="info-banner">
                <ChartNoAxesCombined size={25} />
                <div>
                  <strong>
                    Resultado de empresa tras gastos generales:{" "}
                    {euro(
                      dec(total("gross"))
                        .minus(sum(s.overheads.map((x) => x.amount)))
                        .toString(),
                    )}
                  </strong>
                  Beneficio bruto menos{" "}
                  {euro(sum(s.overheads.map((x) => x.amount)).toString())} de
                  gastos generales registrados. Los repartos por trabajo se
                  muestran aparte y no se restan dos veces.
                </div>
              </div>
              <Panel
                title="Rentabilidad por servicio"
                action={
                  <select
                    className="max-w-56 mb-0"
                    aria-label="Ordenar servicios"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="gross">Mayor beneficio</option>
                    <option value="margin">Mayor margen</option>
                    <option value="perHour">Mayor beneficio / hora</option>
                    <option value="net">Mayor facturación</option>
                  </select>
                }
              >
                {serviceData.length ? (
                  <>
                    <div className="px-4" style={{ height: 260 }}>
                      <ServiceChart data={serviceData} />
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Servicio</th>
                            <th>Trabajos</th>
                            <th>Ingresos</th>
                            <th>Costes</th>
                            <th>Beneficio bruto</th>
                            <th>Operativo estimado</th>
                            <th>Margen</th>
                            <th>Horas</th>
                            <th>Beneficio / hora</th>
                            <th>Ticket medio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {serviceData.map((x) => (
                            <tr key={x.name}>
                              <td>
                                <strong>{x.name}</strong>
                              </td>
                              <td>{x.count}</td>
                              <td>{euro(x.net)}</td>
                              <td>{euro(x.direct)}</td>
                              <td>{euro(x.gross)}</td>
                              <td>{euro(x.operating)}</td>
                              <td>
                                {x.margin === null
                                  ? "—"
                                  : `${number(x.margin)} %`}
                              </td>
                              <td>{number(x.hours)}</td>
                              <td>
                                {x.perHour === null ? "—" : euro(x.perHour)}
                              </td>
                              <td>{euro(x.ticket)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <Empty
                    title="Tu rentabilidad se verá aquí"
                    description="Registra trabajos, compras, horas y ventas para comparar el resultado de tus servicios."
                  />
                )}
              </Panel>
              <Panel
                title="Resultado por trabajo"
                action={
                  <button className="text-button" onClick={download}>
                    Descargar informe
                  </button>
                }
              >
                {jobTable(jobs)}
              </Panel>
            </>
          )}
          {section === "inventario" && (
            <InventoryWorkspace
              jobs={activeJobs}
              selectedCode={pathname.split("/")[2]}
              onChanged={load}
              onInvoiceProduct={(product) => createSale(undefined, product)}
            />
          )}
          {children}
          {section === "trimestres" && isAdmin && <Quarters />}
          {section === "gastos" && isAdmin && (
            <Expenses
              overheads={s.overheads}
              onAdd={() => setExpense(true)}
              onDelete={(id) => run("overheadDelete", { id })}
            />
          )}
          {section === "calendario" && isAdmin && <TaxCalendar />}
          {section === "catalogo" && isAdmin && <Catalog />}
          {section === "cuentas" && isAdmin && <SupplierAccounts key={pathname} supplierId={pathname.split("/")[2]} />}
          {section === "contactos" && isAdmin && (
            <ContactsHub onNewCustomer={() => createContact("customer")} onNewSupplier={() => createContact("supplier")} />
          )}
          {section === "ventas" && isAdmin && (
            <SalesHub
              pending={s.sales.filter((x) => Number(x.net) + Number(x.tax) - Number(x.withholding) - Number(x.collected) > 0).length}
              onNewInvoice={openInvoice}
              onNewQuote={createQuote}
              onNewCustomer={() => createContact("customer")}
            />
          )}
          {section === "facturas-venta" && isAdmin &&
            (pathname.split("/")[2] ? (
              <InvoiceDetail
                key={pathname}
                sale={s.sales.find((x) => x.id === pathname.split("/")[2])}
                job={s.jobs.find((j) => j.id === s.sales.find((x) => x.id === pathname.split("/")[2])?.jobId)}
                documents={s.documents}
                refresh={load}
                onPayment={payment}
              />
            ) : (
              <InvoiceList sales={s.sales} onNew={openInvoice} onPayment={payment} />
            ))}
          {section === "cobros" && isAdmin && (
            <InvoiceList sales={s.sales} preset="pending" title="Cobros" onNew={openInvoice} onPayment={payment} />
          )}
          {section === "presupuestos" && isAdmin && <QuotesList jobs={s.jobs} onNew={createQuote} refresh={load} />}
          {section === "nueva-factura" && isAdmin && (
            <InvoicePage
              key={pathname}
              jobs={activeJobs}
              customers={s.customers}
              jobId={pathname.split("/")[2]}
              sales={s.sales}
              templates={s.templates}
              refresh={load}
              onDone={() => {
                setToast("Factura guardada.");
                router.push("/trabajos");
              }}
            />
          )}
          {section === "horas" && isAdmin && <Hours jobs={s.jobs} onAdd={createHours} />}
          {section === "pedidos" && isAdmin && (
            <PurchaseOrders suppliers={s.suppliers} />
          )}
          {section === "configuracion" && isAdmin && (
            <>
              <div className="page-head">
                <div>
                  <div className="eyebrow">A TU MANERA</div>
                  <h1 className="mt-2">Configuración</h1>
                  <p className="subtitle">
                    Tu empresa, tus clientes y los costes reales de tu equipo.
                  </p>
                </div>
              </div>
              <SystemHealth />
              <VoiceUsage />
              <Panel
                title={s.company.name}
                subtitle={s.company.taxId || "Completa los datos de tu empresa"}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setModal({
                        title: "Datos de empresa",
                        action: "company",
                        fields: [
                          field("name", "Nombre", "text", s.company.name),
                          field(
                            "taxId",
                            "NIF / CIF",
                            "text",
                            s.company.taxId ?? "",
                            false,
                          ),
                        ],
                      })
                    }
                  >
                    Editar empresa
                  </Button>
                }
              >
                <p className="small-note px-6 pb-5">
                  Servidor local · PostgreSQL · OCR Tesseract. Las cuentas de tu
                  equipo se gestionan en «Usuarios y accesos».
                </p>
              </Panel>
              <div className="two-col">
                <div>
                  <Panel title="Clientes">
                    <p className="small-note px-6 pb-5"><Link className="text-button" href="/clientes">Ver y gestionar clientes ?</Link></p>
                  </Panel>
                  <Panel
                    title="Gastos generales"
                    subtitle="Gastos de funcionamiento. No registres aquí compras de activos como un gasto completo."
                    action={
                      <button
                        className="text-button"
                        onClick={() =>
                          setModal({
                            title: "Registrar gasto general",
                            action: "overhead",
                            fields: [
                              field("description", "Descripción"),
                              field("amount", "Importe neto (€)", "number"),
                              field("tax", "IVA soportado (€)", "number", "0"),
                              field("date", "Fecha", "date", today()),
                            ],
                          })
                        }
                      >
                        + Añadir gasto
                      </button>
                    }
                  >
                    <div className="record-list">
                      {s.overheads.map((x) => (
                        <div className="record" key={x.id}>
                          <div>
                            {x.description}
                            <small>{fmtDate(x.date)}</small>
                          </div>
                          <strong>{euro(x.amount)}</strong>
                        </div>
                      ))}
                      {!s.overheads.length && (
                        <p className="small-note pb-4">
                          Aún no hay gastos generales registrados.
                        </p>
                      )}
                    </div>
                  </Panel>
                </div>
                <div>
                  <Panel
                    title="Equipo y coste laboral"
                    action={
                      <button
                        className="text-button"
                        onClick={() =>
                          setModal({
                            title: "Añadir trabajador",
                            action: "worker",
                            fields: [
                              field("name", "Nombre"),
                              {
                                ...field(
                                  "hourlyCost",
                                  "Coste laboral real por hora (€)",
                                  "number",
                                ),
                                hint: "Incluye salario y costes empresariales divididos entre horas productivas.",
                              },
                              field(
                                "specialty",
                                "Especialidad",
                                "text",
                                "",
                                false,
                              ),
                            ],
                          })
                        }
                      >
                        + Añadir
                      </button>
                    }
                  >
                    {s.workers.length ? (
                      <div className="record-list">
                        {s.workers.map((w) => (
                          <div className="record" key={w.id}>
                            <div>
                              <strong>{w.name}</strong>
                              <small>{w.specialty || "Técnico"}</small>
                            </div>
                            <div className="text-right">
                              <strong>{euro(w.hourlyCost)} / h</strong>
                              <button
                                className="text-button block mt-2 ml-auto"
                                onClick={() => editWorker(w)}
                              >
                                Editar
                              </button>
                              {!s.users?.some((x) => x.workerId === w.id) && (
                                <button
                                  className="text-button block mt-2 ml-auto"
                                  onClick={() => createUser(w)}
                                >
                                  Dar acceso
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title="Añade a tu equipo"
                        description="Configura el coste por hora para calcular la mano de obra. Para que entre en la aplicación, créale un acceso en «Usuarios y accesos»."
                      />
                    )}
                  </Panel>
                  <Panel
                    title="Usuarios y accesos"
                    subtitle="Quién puede entrar en la aplicación"
                    action={
                      <button
                        className="text-button"
                        onClick={() => createUser()}
                      >
                        + Nuevo usuario
                      </button>
                    }
                  >
                    <div className="record-list">
                      {(s.users ?? []).map((x) => (
                        <div className="record" key={x.id}>
                          <div>
                            <strong>{x.name}</strong>
                            <small>{x.email}</small>
                            <span
                              className={`pill ${x.active ? (x.role === "ADMIN" ? "blue" : "green") : "orange"}`}
                            >
                              {x.active
                                ? x.role === "ADMIN"
                                  ? "Responsable"
                                  : "Técnico"
                                : "Desactivado"}
                            </span>
                          </div>
                          <div className="text-right">
                            <button
                              className="text-button block ml-auto"
                              onClick={() => resetUserPassword(x)}
                            >
                              Cambiar contraseña
                            </button>
                            {x.id !== s.user.id && (
                              <button
                                className="text-button block mt-2 ml-auto"
                                onClick={() => setUserActive(x, !x.active)}
                              >
                                {x.active ? "Desactivar" : "Reactivar"}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                  <Panel
                    title="Registro de cambios"
                    subtitle="Últimas 40 operaciones de la empresa"
                  >
                    <div className="record-list">
                      {s.audits.map((a) => (
                        <div className="record" key={a.id}>
                          <span>{a.action}</span>
                          <small>{fmtDate(a.createdAt)}</small>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              </div>
            </>
          )}
          {![
            "",
            "trabajos",
            "facturas",
            "clientes",
            "proveedores",
            "inventario",
            "pedidos",
            "beneficios",
            "trimestres",
            "gastos",
            "horas",
            "calendario",
            "catalogo",
            "nueva-factura",
            "cuentas",
            "contactos",
            "ventas",
            "facturas-venta",
            "cobros",
            "presupuestos",
            "configuracion",
          ].includes(section) && (
            <Empty
              title="Esta página no existe"
              description="Vuelve al inicio para continuar."
              action={
                <Link href="/" className="text-button">
                  Ir al inicio
                </Link>
              }
            />
          )}
          {!isAdmin &&
            [
              "proveedores",
              "clientes",
              "beneficios",
              "trimestres",
              "gastos",
              "horas",
              "calendario",
              "catalogo",
              "nueva-factura",
              "cuentas",
              "contactos",
              "ventas",
              "facturas-venta",
              "cobros",
              "presupuestos",
              "configuracion",
              "pedidos",
            ].includes(section) && (
              <Empty
                title="Acceso reservado al responsable"
                description="Puedes consultar tus trabajos y registrar materiales y horas."
                action={
                  <Link href="/trabajos" className="text-button">
                    Mis trabajos
                  </Link>
                }
              />
            )}
        </main>
      </div>
      <nav className="mobile-nav">
        {(() => {
          const tab = (href: string) => {
            const n = visibleNav.find((x) => x.href === href)!;
            return (
              <Link
                prefetch={true}
                key={n.href}
                href={n.href}
                className={navActive(n.href) ? "active" : ""}
              >
                <n.icon size={24} />
                <span>{n.label}</span>
                <NavigationStatus />
              </Link>
            );
          };
          return [
            tab("/"),
            tab("/trabajos"),
            <button key="create" className="mobile-create" aria-label="Crear" aria-haspopup="dialog" aria-expanded={add} onClick={() => setAdd(true)}>
              <Plus size={28} strokeWidth={2.8} />
            </button>,
            tab("/inventario"),
            tab("/facturas"),
          ];
        })()}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} className="inline mr-2" />
          {toast}
        </div>
      )}
      <Dialog open={add} onOpenChange={setAdd} title="¿Qué quieres hacer?">
        {(isAdmin
          ? [
              { title: "Asistente", items: [{ key: "voice", label: "Dictar una orden", icon: Mic }] },
              { title: "Documentos", items: [
                { key: "delivery", label: "Subir albarán", icon: Truck, main: true },
                { key: "purchase", label: "Subir factura de proveedor", icon: Files, main: true },
                { key: "bulk", label: "Subir varios o una carpeta", icon: FolderUp },
              ] },
              { title: "Trabajo", items: [
                { key: "cost", label: "Material usado", icon: Package },
                { key: "hours", label: "Registrar horas", icon: Clock },
                { key: "job", label: "Nuevo trabajo", icon: BriefcaseBusiness },
              ] },
              { title: "Ventas", items: [
                { key: "invoice", label: "Facturas", icon: FileCheck2, main: true },
                { key: "quote", label: "Presupuestos", icon: FilePlus2 },
              ] },
              { title: "Gastos", items: [
                { key: "expense", label: "Registrar gasto", icon: Receipt },
              ] },
              { title: "Contactos", items: [
                { key: "customer", label: "Cliente", icon: Users },
                { key: "supplier", label: "Proveedor", icon: Truck },
              ] },
            ]
          : [
              { title: "Asistente", items: [{ key: "voice", label: "Dictar una orden", icon: Mic }] },
              { title: "Documentos", items: [{ key: "delivery", label: "Subir albarán", icon: Truck, main: true }] },
              { title: "Trabajo", items: [
                { key: "cost", label: "Material usado", icon: Package },
                { key: "hours", label: "Registrar horas", icon: Clock },
                { key: "photo", label: "Añadir fotografía", icon: Camera },
              ] },
            ]
        ).map((g) => (
          <section className="create-group" key={g.title}>
            <h3>{g.title}</h3>
            <div className="create-grid">
              {g.items.map((x) => (
                <button key={x.key} className={`create-tile${"main" in x && x.main ? " primary" : ""}`} onClick={() => quick(x.key)}>
                  <span className="ct-icon"><x.icon size={22} /></span>
                  <strong>{x.label}</strong>
                </button>
              ))}
            </div>
          </section>
        ))}
      </Dialog>
      <Dialog open={menu} onOpenChange={setMenu} title="Menú">
        <div className="more-sections">
          {visibleNav.filter((n) => !primaryHrefs.includes(n.href)).map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMenu(false)}>
              <n.icon size={20} />
              {n.label}
              <ChevronRight size={16} />
            </Link>
          ))}
          <button
            className="menu-logout"
            onClick={async () => {
              await request("/api/auth/sign-out", {});
              location.href = "/login";
            }}
          >
            <LogOut size={20} />
            Cerrar sesión
          </button>
        </div>
      </Dialog>
      {quoteBuilder && (
        <QuoteBuilder
          jobs={activeJobs}
          jobId={selected?.id}
          workers={s.workers}
          close={() => setQuoteBuilder(false)}
          saved={async () => {
            setQuoteBuilder(false);
            setToast("Presupuesto creado.");
            await load();
          }}
        />
      )}
      {material && (
        <MaterialPicker
          jobs={activeJobs}
          jobId={selected?.id}
          close={() => setMaterial(false)}
          onManual={() => {
            setMaterial(false);
            createCost();
          }}
          saved={async () => {
            setMaterial(false);
            setToast("Material añadido al trabajo.");
            await load();
          }}
        />
      )}
      {voice && <VoiceDialog close={() => setVoice(false)} confirm={async (action, payload, meta) => { await request("/api/voice/confirm", { action, payload, ...meta }); await saved(); }} />}
      {expense && (
        <ExpenseForm
          close={() => setExpense(false)}
          saved={async () => {
            setExpense(false);
            setToast("Gasto guardado.");
            await load();
          }}
        />
      )}
      {modal && (
        <OperationForm
          customers={s.customers}
          workers={s.workers}
          key={modal.title}
          modal={modal}
          close={() => setModal(null)}
          saved={saved}
          refresh={load}
        />
      )}
      {upload && (
        <UploadForm
          kind={upload}
          jobs={activeJobs}
          jobId={selected?.id}
          isAdmin={isAdmin}
          close={() => setUpload(null)}
          saved={async (type) => {
            await saved();
            setAdd(false);
            setDocumentView(type === "PHOTO" ? "all" : "pending");
            setToast(
              type === "PHOTO"
                ? "Fotografía guardada."
                : "Documento subido. Lo encontrarás en Pendientes de revisar cuando terminemos de leerlo.",
            );
            if (!selected) router.push("/facturas");
          }}
        />
      )}
      {bulk && <BulkUpload close={() => setBulk(false)} done={load} />}
      {archiveResult && (
        <Dialog open title="Resultado del archivado" onOpenChange={(v) => !v && setArchiveResult(null)}>
          <p>
            <strong>{archiveResult.archived}</strong> documentos archivados en las cuentas del proveedor.
            {archiveResult.skipped.length > 0 && ` ${archiveResult.skipped.length} necesitan revisión manual:`}
          </p>
          {archiveResult.skipped.length > 0 && (
            <ul className="small-note" style={{ maxHeight: 280, overflow: "auto", margin: "10px 0", paddingLeft: 18 }}>
              {archiveResult.skipped.map((x) => (
                <li key={x.id}><strong>{x.name}</strong>: {x.reason}</li>
              ))}
            </ul>
          )}
          <div className="form-footer">
            <Button onClick={() => setArchiveResult(null)}>Entendido</Button>
          </div>
        </Dialog>
      )}
      {review?.kind === "CREDIT" && <CreditReview doc={review} state={s} close={() => setReview(null)} saved={saved} />}
      {review && review.kind !== "CREDIT" && (
        <StockDocumentReview
          doc={review}
          state={s}
          close={() => setReview(null)}
          saved={saved}
        />
      )}
    </>
  );
}

function OperationForm({
  modal,
  close,
  saved,
  refresh,
  customers,
  workers,
}: {
  modal: Modal;
  close: () => void;
  saved: () => Promise<void>;
  refresh: () => Promise<void>;
  customers: Customer[];
  workers: Worker[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        modal.fields.map((f) => [
          f.name,
          f.value ??
            (f.required !== false ? f.options?.[0]?.value : undefined) ??
            "",
        ]),
      ),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [key] = useState(() => uuid());
  // Altas rápidas desde los selectores de cliente y técnico; se recuerdan hasta que llegue el estado nuevo.
  const [added, setAdded] = useState<Record<string, Person[]>>({}),
    [photos, setPhotos] = useState<File[]>([]),
    // Radix cierra el formulario si el foco "se escapa" al cerrar el selector anidado: se ignora ese cierre.
    pickingUntil = useRef(0);
  const people = (kind: "customer" | "worker"): Person[] => {
    const base =
      kind === "customer"
        ? customers.map((c) => ({ id: c.id, name: c.name, sub: [c.phone, c.email, c.address, c.taxId] }))
        : workers.map((w) => ({ id: w.id, name: w.name, sub: [w.specialty ?? ""] }));
    return [...base, ...(added[kind] ?? []).filter((x) => !base.some((b) => b.id === x.id))];
  };
  const createPerson = async (kind: "customer" | "worker", draft: Record<string, string>) => {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) if (v) payload[k] = v;
    const row = await request(`/api/operations/${kind}`, payload);
    setAdded((a) => ({ ...a, [kind]: [...(a[kind] ?? []), { id: row.id, name: row.name ?? draft.name, sub: [draft.phone ?? draft.specialty ?? ""] }] }));
    await refresh();
    return row as { id: string };
  };
  const [saleLines, setSaleLines] = useState<SaleProductLine[]>(() =>
    modal.product ? [productLine(modal.product)] : [],
  );
  let saleNet = "";
  try {
    if (saleLines.length)
      saleNet = cents(
        sum(
          saleLines.map((l) =>
            l.quantity && l.price ? lineNet(l.quantity, l.price) : "0",
          ),
        ),
      );
  } catch {}
  let preview = "";
  if (modal.action === "quote") {
    try {
      const cost = sum([
        values.materials || 0,
        dec(values.hours || 0).mul(values.hourlyCost || 0),
        values.travel || 0,
        values.subcontract || 0,
        values.other || 0,
        values.overhead || 0,
      ]);
      preview = quotePrice(cost, values.margin || 0);
    } catch {
      preview = "";
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy && Date.now() > pickingUntil.current) close();
      }}
      title={modal.title}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const payload: Record<string, unknown> = {
              ...values,
              ...modal.fixed,
              requestKey: key,
            };
            if (modal.action === "sale" && saleLines.length) {
              payload.lines = saleLines;
              payload.net = saleNet;
              payload.description = saleLines
                .map((l) => l.description)
                .join("; ")
                .slice(0, 200);
            }
            for (const f of modal.fields)
              if (f.required === false && !payload[f.name])
                delete payload[f.name];
            if ("billable" in payload)
              payload.billable = payload.billable === "true";
            await request(`/api/operations/${modal.action}`, payload);
            // Las fotos se suben ya reducidas; si alguna falla, el parte ya está guardado.
            for (const f of photos)
              await uploadDocument(f, { kind: "PHOTO", jobId: String(values.jobId ?? "") }).catch(() => {});
            await saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {modal.extra && (
          <details className="mb-5">
            <summary className="text-button cursor-pointer">
              Ver texto extraído para revisar los datos
            </summary>
            <pre className="ocr-text">{modal.extra}</pre>
          </details>
        )}
        {modal.action === "sale" && (
          <SaleProducts lines={saleLines} onChange={setSaleLines} />
        )}
        {([false, true] as const).map((folded) => {
          const group = modal.fields.filter((f) => !!f.more === folded);
          if (!group.length) return null;
          const grid = (
        <div className="form-grid">
          {group
            .filter(
              (f) =>
                !(
                  modal.action === "sale" &&
                  saleLines.length &&
                  f.name === "description"
                ),
            )
            .map((f) => {
              return (
              <Fragment key={f.name}>
              <label
                className={f.full || f.type === "textarea" ? "full" : ""}
              >
                {f.label}
                {f.required === false && (
                  <span className="font-normal text-slate-400">
                    {" "}
                    · opcional
                  </span>
                )}
                {f.picker ? (
                  <PersonPicker
                    kind={f.picker}
                    people={people(f.picker)}
                    value={values[f.name]}
                    optional={f.required === false}
                    onChange={(id) => setValues((v) => ({ ...v, [f.name]: id }))}
                    onCreate={(d) => createPerson(f.picker!, d)}
                    onToggle={(o) => (pickingUntil.current = o ? Infinity : Date.now() + 500)}
                  />
                ) : f.type === "select" ? (
                  <select
                    name={f.name}
                    disabled={f.locked}
                    value={values[f.name]}
                    required={f.required !== false}
                    onChange={(e) =>
                      e.target.value === "__new__"
                        ? f.addNew?.open()
                        : setValues({ ...values, [f.name]: e.target.value })
                    }
                  >
                    {f.addNew && !f.locked && <option value="__new__">{f.addNew.label}</option>}
                    {(!f.required || !f.options?.length) && (
                      <option value="">
                        {f.options?.length
                          ? "Sin asignar"
                          : "Añade antes un registro"}
                      </option>
                    )}
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    name={f.name}
                    value={values[f.name]}
                    onChange={(e) =>
                      setValues({ ...values, [f.name]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    name={f.name}
                    type={f.type ?? "text"}
                    value={
                      modal.action === "sale" &&
                      f.name === "net" &&
                      saleLines.length
                        ? saleNet
                        : values[f.name]
                    }
                    readOnly={
                      modal.action === "sale" &&
                      f.name === "net" &&
                      saleLines.length > 0
                    }
                    required={f.required !== false}
                    min={f.type === "number" ? "0" : undefined}
                    step={f.type === "number" ? "0.0001" : undefined}
                    onChange={(e) =>
                      setValues({ ...values, [f.name]: e.target.value })
                    }
                  />
                )}{" "}
                {f.hint && (
                  <p className="small-note -mt-3 mb-4 font-normal">{f.hint}</p>
                )}
              </label>
              </Fragment>
            );})}
        </div>
          );
          return folded ? (
            <details className="more-fields" key="more">
              <summary>Más opciones</summary>
              {grid}
            </details>
          ) : (
            <Fragment key="main">{grid}</Fragment>
          );
        })}
        {modal.action === "hours" && (() => {
          const [h1, m1] = (values.startTime || "").split(":").map(Number),
            [h2, m2] = (values.endTime || "").split(":").map(Number),
            min = h2 * 60 + m2 - (h1 * 60 + m1);
          return Number.isFinite(min) && min > 0 ? (
            <p className="small-note">Duración: {number(min / 60)} h</p>
          ) : null;
        })()}
        {modal.photos && (
          <label className="expense-file">
            <ImagePlus size={18} />
            {photos.length ? `${photos.length} imagen(es) para adjuntar` : "Adjuntar imágenes (opcional)"}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
          </label>
        )}
        {modal.action === "quote" && (
          <div className="quote-preview">
            <div className="small-note">
              Precio mínimo para el margen indicado
              <br />
              Base neta · impuestos por añadir
            </div>
            <strong>{preview ? euro(preview) : "Revisa el margen"}</strong>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button loading={busy}>
            {busy ? "Guardando…" : "Guardar"}
            {!busy && <Check size={16} />}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function UploadForm({
  kind,
  jobs,
  jobId,
  isAdmin,
  close,
  saved,
}: {
  kind: string;
  jobs: Job[];
  jobId?: string;
  isAdmin: boolean;
  close: () => void;
  saved: (type: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [type, setType] = useState(kind),
    [file, setFile] = useState<File | null>(null);
  const chooseFile = (next: File | null) => {
    setError("");
    if (next && next.size > 20 * 1024 * 1024) {
      setFile(null);
      setError("El archivo supera 20 MB. Elige una foto o PDF más pequeño.");
      return;
    }
    setFile(next);
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
      title={
        type === "DELIVERY"
          ? "Subir albarán"
          : type === "PURCHASE"
            ? "Subir factura de proveedor"
            : type === "CREDIT"
              ? "Subir abono de proveedor"
            : type === "SALE"
              ? "Subir factura de cliente"
              : "Añadir fotografía"
      }
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) {
            setError("Selecciona un archivo.");
            return;
          }
          setError("");
          setBusy(true);
          try {
            const fd = new FormData(e.currentTarget);
            await uploadDocument(file, {
              kind: String(fd.get("kind") ?? type),
              jobId: String(fd.get("jobId") ?? ""),
            });
            await saved(type);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="upload-explanation">
          {type === "DELIVERY"
            ? "Haz una foto o elige el archivo. Los precios pueden quedar pendientes hasta que llegue la factura."
            : type === "PURCHASE"
              ? "Haz una foto o elige el PDF. Después podrás asociar la factura a tus albaranes."
              : type === "CREDIT"
                ? "Sube el abono (nota de crédito) del proveedor. Después lo asociarás a las facturas o albaranes que corrige."
                : "Haz una foto o elige un archivo para continuar."}
        </p>
        {!isAdmin && (
          <label>
            Trabajo asociado
            <select name="jobId" defaultValue={jobId ?? ""} required>
              <option value="">Selecciona el trabajo</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.number} · {j.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <details className="simple-options upload-extra">
          <summary>Asignación y otras opciones</summary>
          <label>
            Tipo de documento
            <select
              name="kind"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setFile(null);
                setError("");
              }}
            >
              {(isAdmin
                ? ["PURCHASE", "DELIVERY", "PHOTO"]
                : ["DELIVERY", "PHOTO"]
              ).map((k) => (
                <option key={k} value={k}>
                  {kindLabel[k]}
                </option>
              ))}
            </select>
          </label>
          {isAdmin && (
            <label>
              Trabajo asociado{isAdmin && " · opcional"}
              <select
                name="jobId"
                defaultValue={jobId ?? ""}
                required={!isAdmin}
              >
                <option value="">
                  {isAdmin
                    ? "Lo asignaré durante la revisión"
                    : "Selecciona el trabajo"}
                </option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.number} · {j.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </details>
        <div className="upload-choices">
          <label className="upload-choice">
            <Camera className="mx-auto mb-2" size={24} />
            Hacer foto
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="upload-choice">
            <Files className="mx-auto mb-2" size={24} />
            Elegir archivo
            <input
              className="sr-only"
              type="file"
              accept={
                type === "PHOTO"
                  ? "image/jpeg,image/png,image/webp"
                  : "image/jpeg,image/png,image/webp,application/pdf"
              }
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <p className="small-note mb-4" role="status">
          {file
            ? `Seleccionado: ${file.name} · ${number(file.size / 1024)} KB`
            : "JPG, PNG, WebP o PDF. Hasta 20 MB y 20 páginas. HEIC: conviértelo a JPG antes de subir."}
        </p>
        <div className="info-banner">
          <Clock size={24} />
          <div>
            <strong>
              {type === "PHOTO"
                ? "Guardar fotografía"
                : "Subir → leer datos → revisar"}
            </strong>
            {type === "PHOTO"
              ? "La fotografía quedará adjunta al trabajo."
              : "Aparecerá en Pendientes de revisar cuando esté listo. El material y los costes se registran cuando revises y confirmes."}
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={close}
          >
            Cancelar
          </Button>
          <Button loading={busy} disabled={!file}>
            {busy
              ? "Subiendo…"
              : type === "PHOTO"
                ? "Guardar fotografía"
                : "Subir y leer datos"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
