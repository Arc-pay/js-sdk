import type { CardBrowserInfo, ExecutePaymentResponse, PaymentNextAction } from "../server/types";

export type ThreeDSAction = PaymentNextAction;
export type BrowserInfo = CardBrowserInfo;

export interface BrowserFormField {
  name: string;
  value: string;
}

export interface BrowserPostForm {
  action: string;
  method: "POST";
  target: "hidden_iframe" | "browser";
  fields: BrowserFormField[];
}

export interface ThreeDSBrowserStep {
  kind: "method" | "challenge";
  protocolVersion: "1" | "2";
  form: BrowserPostForm;
  completionEndpoint?: string;
  threeDSServerTransId?: string;
}

export interface MountedThreeDSForm {
  form: HTMLFormElement;
  iframe?: HTMLIFrameElement;
  submit: () => void;
  remove: () => void;
}

export interface ThreeDSMountOptions {
  document?: Document;
  container?: HTMLElement;
  challengeTarget?: string;
  submitter?: (form: HTMLFormElement) => void;
}

export interface RunThreeDSBrowserFlowOptions extends ThreeDSMountOptions {
  completeThreeDSMethod: (
    completion: ReturnType<typeof buildThreeDSMethodCompletion>,
    nextAction: PaymentNextAction,
  ) => Promise<ExecutePaymentResponse>;
  methodCompletionIndicator?: "Y" | "N" | "U";
  methodTimeoutMs?: number;
  signal?: AbortSignal;
}

export type ThreeDSBrowserFlowResult =
  | {
      status: "no_action";
      response?: ExecutePaymentResponse;
    }
  | {
      status: "method_completed";
      response: ExecutePaymentResponse;
    }
  | {
      status: "challenge_submitted";
      action: PaymentNextAction;
      response?: ExecutePaymentResponse;
      mounted: MountedThreeDSForm;
    };

const supportedColorDepths = [1, 4, 8, 15, 16, 24, 32, 48] as const;

const normalizeColorDepth = (value: number): BrowserInfo["color_depth"] =>
  supportedColorDepths.includes(value as BrowserInfo["color_depth"])
    ? (value as BrowserInfo["color_depth"])
    : 24;

const resolveWindowSize = (width: number): NonNullable<BrowserInfo["window_size"]> => {
  if (width >= 1000) return "05";
  if (width >= 600) return "04";
  if (width >= 500) return "03";
  if (width >= 390) return "02";
  return "01";
};

export const collectBrowserInfo = (
  acceptHeader = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
): BrowserInfo => {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    typeof screen === "undefined"
  ) {
    throw new Error("collectBrowserInfo must be called in a browser environment");
  }
  return {
    accept_header: acceptHeader,
    language: navigator.language || "en",
    screen_width: screen.width,
    screen_height: screen.height,
    color_depth: normalizeColorDepth(screen.colorDepth),
    timezone_offset_minutes: new Date().getTimezoneOffset(),
    java_enabled: false,
    user_agent: navigator.userAgent,
    window_size: resolveWindowSize(window.innerWidth || screen.width),
  };
};

export const getThreeDSAction = (nextAction?: PaymentNextAction): PaymentNextAction | null => {
  return nextAction ?? null;
};

export const isThreeDSMethodAction = (nextAction?: PaymentNextAction): boolean => {
  return nextAction?.type === "three_ds_method" && nextAction.three_ds.phase === "method";
};

export const isThreeDSChallengeAction = (nextAction?: PaymentNextAction): boolean => {
  return nextAction?.type === "three_ds_challenge" && nextAction.three_ds.phase === "challenge";
};

export const buildThreeDSBrowserForm = (nextAction: PaymentNextAction): BrowserPostForm => ({
  action: nextAction.three_ds.submit.url,
  method: nextAction.three_ds.submit.method,
  target: nextAction.three_ds.submit.target,
  fields: nextAction.three_ds.submit.fields,
});

export const buildThreeDSBrowserStep = (
  nextAction?: PaymentNextAction,
): ThreeDSBrowserStep | null => {
  const action = getThreeDSAction(nextAction);
  if (!action) return null;
  return {
    kind: action.three_ds.phase,
    protocolVersion: action.three_ds.version,
    form: buildThreeDSBrowserForm(action),
    completionEndpoint: action.three_ds.completion_endpoint,
    threeDSServerTransId: action.three_ds.three_ds_server_trans_id,
  };
};

export const buildThreeDSMethodCompletion = (
  nextAction: PaymentNextAction,
  completionIndicator: "Y" | "N" | "U" = "Y",
): { completion_indicator: "Y" | "N" | "U"; three_ds_server_trans_id: string } => {
  if (!isThreeDSMethodAction(nextAction) || !nextAction.three_ds.three_ds_server_trans_id) {
    throw new Error("nextAction must be a three_ds_method action with three_ds_server_trans_id");
  }
  return {
    completion_indicator: completionIndicator,
    three_ds_server_trans_id: nextAction.three_ds.three_ds_server_trans_id,
  };
};

const requireDocument = (explicitDocument?: Document): Document => {
  if (explicitDocument) return explicitDocument;
  if (typeof document === "undefined") {
    throw new Error("3DS browser helpers must be called in a browser environment");
  }
  return document;
};

const defaultSubmitter = (form: HTMLFormElement): void => {
  form.submit();
};

export const mountThreeDSBrowserForm = (
  nextAction: PaymentNextAction,
  options: ThreeDSMountOptions = {},
): MountedThreeDSForm => {
  const doc = requireDocument(options.document);
  const container = options.container ?? doc.body;
  const formDescriptor = buildThreeDSBrowserForm(nextAction);
  const form = doc.createElement("form");
  const target =
    formDescriptor.target === "hidden_iframe"
      ? `arcpay-three-ds-method-${Math.random().toString(36).slice(2)}`
      : (options.challengeTarget ?? "_self");
  let iframe: HTMLIFrameElement | undefined;

  form.method = formDescriptor.method;
  form.action = formDescriptor.action;
  form.target = target;
  form.hidden = true;

  for (const field of formDescriptor.fields) {
    const input = doc.createElement("input");
    input.type = "hidden";
    input.name = field.name;
    input.value = field.value;
    form.append(input);
  }

  if (formDescriptor.target === "hidden_iframe") {
    iframe = doc.createElement("iframe");
    iframe.name = target;
    iframe.title = "3-D Secure method";
    iframe.hidden = true;
    container.append(iframe);
  }

  container.append(form);

  return {
    form,
    iframe,
    submit: () => (options.submitter ?? defaultSubmitter)(form),
    remove: () => {
      form.remove();
      iframe?.remove();
    },
  };
};

const waitForMethodFrame = (
  mounted: MountedThreeDSForm,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<"loaded" | "timeout"> =>
  new Promise((resolve, reject) => {
    if (!mounted.iframe) {
      resolve("loaded");
      return;
    }
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted", "AbortError"));
      return;
    }

    let settled = false;
    const cleanup = () => {
      mounted.iframe?.removeEventListener("load", onLoad);
      signal?.removeEventListener("abort", onAbort);
      clearTimeout(timer);
    };
    const settle = (result: "loaded" | "timeout") => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onLoad = () => settle("loaded");
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    const timer = setTimeout(() => settle("timeout"), timeoutMs);

    mounted.iframe.addEventListener("load", onLoad, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export const runThreeDSBrowserFlow = async (
  nextAction: PaymentNextAction | undefined,
  options: RunThreeDSBrowserFlowOptions,
): Promise<ThreeDSBrowserFlowResult> => {
  if (!nextAction) return { status: "no_action" };

  if (isThreeDSChallengeAction(nextAction)) {
    const mounted = mountThreeDSBrowserForm(nextAction, options);
    mounted.submit();
    return { status: "challenge_submitted", action: nextAction, mounted };
  }

  if (!isThreeDSMethodAction(nextAction)) return { status: "no_action" };

  const mounted = mountThreeDSBrowserForm(nextAction, options);
  try {
    mounted.submit();
    const methodResult = await waitForMethodFrame(
      mounted,
      options.methodTimeoutMs ?? 10_000,
      options.signal,
    );
    const indicator =
      options.methodCompletionIndicator ?? (methodResult === "loaded" ? "Y" : "N");
    const response = await options.completeThreeDSMethod(
      buildThreeDSMethodCompletion(nextAction, indicator),
      nextAction,
    );
    const followUpAction = getThreeDSAction(response.next_action);
    if (followUpAction && isThreeDSChallengeAction(followUpAction)) {
      const challengeMounted = mountThreeDSBrowserForm(followUpAction, options);
      challengeMounted.submit();
      return {
        status: "challenge_submitted",
        action: followUpAction,
        response,
        mounted: challengeMounted,
      };
    }
    return { status: "method_completed", response };
  } finally {
    mounted.remove();
  }
};

const htmlEscape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const buildThreeDSAutoSubmitHtml = (nextAction: PaymentNextAction): string => {
  const form = buildThreeDSBrowserForm(nextAction);
  const target = form.target === "hidden_iframe" ? "arcpay-three-ds-method" : "_self";
  const inputs = form.fields
    .map(
      (field) =>
        `<input type="hidden" name="${htmlEscape(field.name)}" value="${htmlEscape(field.value)}">`,
    )
    .join("");
  const iframe =
    form.target === "hidden_iframe"
      ? '<iframe name="arcpay-three-ds-method" title="3-D Secure method" hidden></iframe>'
      : "";
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${iframe}<form method="POST" action="${htmlEscape(form.action)}" target="${target}">${inputs}</form><script>document.forms[0].submit();</script></body></html>`;
};
