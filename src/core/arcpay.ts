import { verifyCspAllowsApiBase } from "./csp";
import { detectEnvironment, type Environment, validatePublishableKey as _validatePublishableKey } from "./env";
import { showSandboxBanner } from "./sandbox-banner";
import { Elements, type ElementsOptions } from "../elements/elements";

const validatePublishableKey: (key: unknown) => asserts key is string = _validatePublishableKey;

export interface ArcPayLoadOptions {
  apiBase?: string;
}

const DEFAULT_API_BASE = "https://api.arcpay.space";

export interface ArcPayInstance {
  readonly publishableKey: string;
  readonly apiBase: string;
  readonly environment: Environment;
  elements: (opts?: ElementsOptions) => Elements;
}

const cache = new Map<string, Promise<ArcPayInstance>>();

const buildInstance = (publishableKey: string, opts: ArcPayLoadOptions): ArcPayInstance => {
  const apiBase = opts.apiBase ?? DEFAULT_API_BASE;
  verifyCspAllowsApiBase(apiBase);
  if (detectEnvironment(publishableKey) === "sandbox") {
    showSandboxBanner();
  }
  return {
    publishableKey,
    apiBase,
    environment: detectEnvironment(publishableKey),
    elements: (elemOpts) => new Elements({ publishableKey, iframeBase: elemOpts?.iframeBase }),
  };
};

function load(publishableKey: string, opts: ArcPayLoadOptions = {}): Promise<ArcPayInstance> {
  try {
    validatePublishableKey(publishableKey);
  } catch (err) {
    return Promise.reject(err);
  }
  const key = `${publishableKey}|${opts.apiBase ?? DEFAULT_API_BASE}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const promise = Promise.resolve(buildInstance(publishableKey, opts));
  cache.set(key, promise);
  return promise;
}

const resetForTests = (): void => {
  cache.clear();
};

export const ArcPay = {
  load,
  __resetForTests: resetForTests,
};
