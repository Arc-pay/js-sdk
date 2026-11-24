import type { HostedFieldsAppearance } from "../../src";

const typedAppearance: HostedFieldsAppearance = {
  rules: {
    base: {
      color: "#111827",
      "font-size": "16px",
      "font-family": "Geologica, system-ui, sans-serif",
      "font-variant-numeric": "tabular-nums",
      "font-feature-settings": '"tnum" 1',
      "caret-color": "#111827",
      "--arcpay-placeholder-color": "#9ca3af",
      border: "0",
      "border-radius": "6px",
      "box-shadow": "none",
      padding: "10px 12px",
      // @ts-expect-error Container layout belongs to merchant CSS, not iframe input rules.
      margin: "12px",
    },
  },
};

void typedAppearance;
