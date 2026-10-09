export type AppRoute = {
  id: string;
  subdomain: string;
  ip: string;
  port: number;
};

export type AppsRouteFile = {
  baseDomain: string;
  routes: AppRoute[];
};

export function generateAppsRoutes(baseDomain: string, routes: AppRoute[]): string {
  const file: AppsRouteFile = {
    baseDomain,
    routes: routes.filter((route) => route.subdomain && route.ip && route.port > 0),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}
