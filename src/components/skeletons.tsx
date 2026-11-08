// Esqueletos de carga con la forma de lo que va a aparecer.
const Bar = ({ w = "100%", h = 14 }: { w?: string | number; h?: number }) => (
  <div className="skeleton" style={{ width: w, height: h, borderRadius: 8 }} />
);

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="panel" role="status" aria-label="Cargando" style={{ padding: 20, display: "grid", gap: 16 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: "grid", gap: 8 }}>
          <Bar w={`${55 + ((i * 17) % 30)}%`} h={16} />
          <Bar w={`${30 + ((i * 11) % 25)}%`} h={11} />
        </div>
      ))}
    </div>
  );
}

// Cabecera + tarjetas + listado: sirve para cualquier pantalla de contenido.
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Cargando">
      <div style={{ display: "grid", gap: 10, marginBottom: 28 }}>
        <Bar w={110} h={10} />
        <Bar w={260} h={30} />
        <Bar w={340} h={12} />
      </div>
      <div className="stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 112, borderRadius: 16 }} />
        ))}
      </div>
      <ListSkeleton />
    </div>
  );
}

// Estructura de la aplicación (menú + contenido) mientras llegan los datos.
export function AppSkeleton() {
  return (
    <div role="status" aria-label="Cargando tu espacio de trabajo">
      <aside className="sidebar">
        <Bar w={130} h={34} />
        <div className="skeleton" style={{ height: 46, borderRadius: 14, margin: "20px 4px 18px" }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ margin: "0 4px 14px" }}>
            <Bar h={22} />
          </div>
        ))}
      </aside>
      <div className="main">
        <div className="topbar">
          <Bar w="40%" h={38} />
        </div>
        <div className="content">
          <PageSkeleton />
        </div>
      </div>
    </div>
  );
}
