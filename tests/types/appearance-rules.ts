import type { HostedFieldsAppearance } from "../../src";

const typedAppearance: HostedFieldsAppearance = {
  rules: {
    base: {
      color: "#111827",
      "font-size": "16px",
      "font-family": "Inter, system-ui, sans-serif",
      "caret-color": "#111827",
      "--arcpay-placeholder-color": "#9ca3af",
      // @ts-expect-error Container layout belongs to merchant CSS, not iframe input rules.
      border: "1px solid red",
    },
  },
};

void typedAppearance;
