import site from "./data/site.json";
import { SiteRoutes } from "./lib/site-routes";
import type { SiteDocument } from "./lib/site-types";

const doc = site as unknown as SiteDocument;

export default function App() {
  return <SiteRoutes doc={doc} />;
}
