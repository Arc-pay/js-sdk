import { ArcPay, type ArcPayInstance } from "../index";
import * as React from "react";

export type ArcPayState =
  | { status: "loading"; instance: null; error: null }
  | { status: "ready"; instance: ArcPayInstance; error: null }
  | { status: "error"; instance: null; error: Error };

const Ctx = React.createContext<ArcPayState | null>(null);

export interface ArcPayProviderProps {
  publishableKey: string;
  children: React.ReactNode;
}

export const ArcPayProvider: React.FC<ArcPayProviderProps> = ({ publishableKey, children }) => {
  const [state, setState] = React.useState<ArcPayState>({
    status: "loading",
    instance: null,
    error: null,
  });

  React.useEffect(() => {
    let canceled = false;
    setState({ status: "loading", instance: null, error: null });
    ArcPay.load(publishableKey)
      .then((instance) => {
        if (!canceled) setState({ status: "ready", instance, error: null });
      })
      .catch((error: unknown) => {
        if (!canceled)
          setState({
            status: "error",
            instance: null,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      });
    return () => {
      canceled = true;
    };
  }, [publishableKey]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
};

export const ArcPayContext = Ctx;
