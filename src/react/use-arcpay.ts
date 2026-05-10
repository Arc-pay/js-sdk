import * as React from "react";
import { ArcPayContext, type ArcPayState } from "./provider";

export const useArcPay = (): ArcPayState => {
  const ctx = React.useContext(ArcPayContext);
  if (!ctx) throw new Error("useArcPay must be called within an ArcPayProvider");
  return ctx;
};
