type OriginEnvironment = {
  [key: string]: string | undefined;
  BETTER_AUTH_URL?: string;
  APP_TRUSTED_ORIGINS?: string;
};
// Lista explícita compartida por autenticación y operaciones; nunca confiar en Host ni en comodines.
export function appOrigins(env: OriginEnvironment = process.env): string[] {
  const configured = [
    env.BETTER_AUTH_URL ?? "http://localhost:3000",
    ...(env.APP_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ];
  return [
    ...new Set(
      configured.map((value) => {
        const url = new URL(value);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash ||
          url.hostname.includes("*")
        )
          throw Error("Hay un origen de acceso no válido en la configuración.");
        return url.origin;
      }),
    ),
  ];
}
export function isAppOrigin(
  origin: string | null,
  env: OriginEnvironment = process.env,
) {
  return !!origin && appOrigins(env).includes(origin);
}
