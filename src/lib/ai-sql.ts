// Validador de las consultas que propone el asistente. Primera barrera (la segunda es la base de datos:
// rol de solo lectura que solo ve las vistas del esquema «ai», ya filtradas por empresa y por usuario).
export const AI_VIEWS = ["customers", "jobs", "sales", "quotes", "stock", "hours", "suppliers", "expenses", "catalog"] as const;

const FUNCS = new Set([
  "count", "sum", "avg", "min", "max", "round", "coalesce", "nullif", "lower", "upper", "length", "trim", "concat", "greatest", "least",
  "date_trunc", "extract", "to_char", "now", "current_date", "abs", "floor", "ceil", "ceiling", "cast", "substring", "left", "right",
]);
// Palabras que pueden ir pegadas a un paréntesis sin ser una función.
const SYNTAX = new Set(["in", "and", "or", "not", "exists", "from", "join", "on", "as", "by", "select", "where", "having", "union", "over", "partition", "filter", "any", "all", "then", "else", "when", "case", "between", "like", "ilike", "with", "limit", "offset", "order", "group", "distinct", "using", "inner", "left", "right", "cross", "full", "outer", "end", "is", "asc", "desc", "interval"]);
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|execute|call|do|set|reset|vacuum|analyze|listen|notify|lock|into|current_setting|set_config|dblink|prepare|deallocate|declare|fetch|begin|commit|rollback|savepoint|show|explain|import|security|role|session|ai_reader|lateral|pg_\w*|lo_\w+|information_schema|current_user|session_user)\b/;
const CASTS = new Set(["numeric", "int", "integer", "bigint", "text", "date", "timestamp", "float", "float8", "decimal"]);

export type SqlCheck = { ok: true; sql: string } | { ok: false; error: string };

export function validateSql(input: string): SqlCheck {
  let sql = String(input ?? "").trim().replace(/;\s*$/, "").trim();
  if (!sql) return { ok: false, error: "Consulta vacía." };
  if (sql.length > 1500) return { ok: false, error: "Consulta demasiado larga." };
  if (/[;\\$]|--|\/\*|\*\//.test(sql)) return { ok: false, error: "Solo se permite una sentencia, sin comentarios ni caracteres especiales." };
  if (/[^\x20-\x7eáéíóúüñÁÉÍÓÚÜÑ]/.test(sql)) return { ok: false, error: "Caracteres no permitidos." };
  // Fuera los textos entre comillas (ahí puede ir cualquier cosa); el resto se analiza.
  const code = sql.replace(/'(?:[^']|'')*'/g, "''").toLowerCase();
  if (code.includes('"')) return { ok: false, error: "No uses comillas dobles: los nombres son en minúsculas." };
  if (!/^\s*(select|with)\b/.test(code)) return { ok: false, error: "Solo se permiten consultas SELECT." };
  const bad = FORBIDDEN.exec(code);
  if (bad) return { ok: false, error: `Palabra no permitida: ${bad[1]}.` };
  const ctes = new Set([...code.matchAll(/\b([a-z_][a-z0-9_]*)\s+as\s*\(/g)].map((m) => m[1]));
  for (const m of code.matchAll(/\b(from|join)\s+(?!\()([a-z0-9_.]+)/g)) {
    if (ctes.has(m[2])) continue;
    const [schema, view, extra] = m[2].split(".");
    if (schema !== "ai" || extra !== undefined || !(AI_VIEWS as readonly string[]).includes(view)) return { ok: false, error: `Solo puedes consultar ai.${AI_VIEWS.join(", ai.")}.` };
  }
  for (const m of code.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/g)) {
    if (!FUNCS.has(m[1]) && !SYNTAX.has(m[1])) return { ok: false, error: `Función no permitida: ${m[1]}.` };
  }
  for (const m of code.matchAll(/::\s*([a-z0-9_]+)/g)) if (!CASTS.has(m[1])) return { ok: false, error: `Conversión no permitida: ${m[1]}.` };
  sql = sql.replace(/\s+/g, " ");
  return { ok: true, sql };
}
