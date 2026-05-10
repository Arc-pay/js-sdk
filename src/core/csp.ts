import { ArcPayError } from "./errors";

const readCspContent = (): string | null => {
  if (typeof document === "undefined") return null;
  const meta = document.head.querySelector<HTMLMetaElement>(
    'meta[http-equiv="Content-Security-Policy"]',
  );
  return meta?.getAttribute("content") ?? null;
};

const extractDirective = (csp: string, name: string): string | null => {
  const lower = csp.toLowerCase();
  const idx = lower.indexOf(`${name} `);
  if (idx === -1) return null;
  const rest = csp.slice(idx + name.length + 1);
  const end = rest.indexOf(";");
  return (end === -1 ? rest : rest.slice(0, end)).trim();
};

const directiveAllowsHost = (directive: string, host: string): boolean => {
  const tokens = directive.split(/\s+/).filter(Boolean);
  if (tokens.includes("*")) return true;
  return tokens.some((t) => {
    if (t === host) return true;
    if (t.startsWith("https://*")) {
      const suffix = t.slice("https://*".length);
      return host.endsWith(suffix);
    }
    return false;
  });
};

export const verifyCspAllowsApiBase = (apiBase: string): void => {
  const csp = readCspContent();
  if (!csp) return;
  const directive = extractDirective(csp, "connect-src");
  if (!directive) return;
  if (directiveAllowsHost(directive, apiBase)) return;
  throw new ArcPayError({
    type: "validation_error",
    code: "csp_blocks_api",
    message: `CSP connect-src directive does not allow ${apiBase}. Add it to your Content-Security-Policy header.`,
    retryable: false,
  });
};
