import { ArcPayError } from "./errors";

export type Environment = "sandbox" | "live";

export const detectEnvironment = (publishableKey: string): Environment =>
  publishableKey.startsWith("pk_test_") ? "sandbox" : "live";

export const validatePublishableKey = (key: unknown): asserts key is string => {
  if (typeof key !== "string" || key.length === 0) {
    throw new ArcPayError({
      type: "validation_error",
      code: "invalid_publishable_key",
      message: "Publishable key must be a non-empty string",
      retryable: false,
    });
  }
  if (!key.startsWith("pk_test_") && !key.startsWith("pk_live_")) {
    throw new ArcPayError({
      type: "validation_error",
      code: "invalid_publishable_key",
      message:
        "Publishable key must start with pk_test_ or pk_live_. Secret keys (sk_*) cannot be used in browser.",
      retryable: false,
    });
  }
};
