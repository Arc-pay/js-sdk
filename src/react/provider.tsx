import { ArcPay, type ArcPayInstance, type ArcPayLoadOptions } from "../index";
import * as React from "react";

export type ArcPayState =
  | { status: "loading"; instance: null; error: null }
  | { status: "ready"; instance: ArcPayInstance; error: null }
  | { status: "error"; instance: null; error: Error };

const Ctx = React.createContext<ArcPayState | null>(null);

export interface ArcPayProviderProps extends ArcPayLoadOptions {
  publishableKey: string;
  children: React.ReactNode;
}

export const ArcPayProvider: React.FC<ArcPayProviderProps> = ({
  publishableKey,
  apiBase,
  children,
}) => {
  const [state, setState] = React.useState<ArcPayState>({
    status: "loading",
    instance: null,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    ArcPay.load(publishableKey, { apiBase })
      .then((instance) => {
        if (!cancelled) setState({ status: "ready", instance, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({
            status: "error",
            instance: null,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [publishableKey, apiBase]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
};

export const ArcPayContext = Ctx;
