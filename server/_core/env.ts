export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  panelPassword: process.env.PANEL_PASSWORD ?? "",
  publicUrl: process.env.PUBLIC_URL ?? "",
  basePath: process.env.BASE_PATH ?? "/monitor",
  isProduction: process.env.NODE_ENV === "production",
};
