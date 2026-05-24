import {
  detectEnvironment,
  type Environment,
  validatePublishableKey as _validatePublishableKey,
} from "./env";
import { showSandboxBanner } from "./sandbox-banner";
import { Elements, type ElementsOptions } from "../elements/elements";

const validatePublishableKey: (key: unknown) => asserts key is string = _validatePublishableKey;

export interface ArcPayLoadOptions {
  readonly _reserved?: never;
}

export interface ArcPayInstance {
  readonly publishableKey: string;
  readonly environment: Environment;
  elements: (opts?: ElementsOptions) => Elements;
}

const cache = new Map<string, Promise<ArcPayInstance>>();

const buildInstance = (publishableKey: string): ArcPayInstance => {
  if (detectEnvironment(publishableKey) === "sandbox") {
    showSandboxBanner();
  }
  return {
    publishableKey,
    environment: detectEnvironment(publishableKey),
    elements: () => new Elements({ publishableKey }),
  };
};

function load(publishableKey: string): Promise<ArcPayInstance> {
  try {
    validatePublishableKey(publishableKey);
  } catch (err) {
    return Promise.reject(err);
  }
  const key = publishableKey;
  const existing = cache.get(key);
  if (existing) return existing;
  const promise = Promise.resolve(buildInstance(publishableKey));
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
