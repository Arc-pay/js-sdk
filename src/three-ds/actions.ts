import type {
  CardBrowserInfo,
  ExecutePaymentRequest,
  ExecutePaymentResponse,
  Payment,
  PaymentNextAction,
  PaymentStatus,
  TerminalPaymentStatus,
} from "../server/types";

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
  challengeTarget?: "_self";
  submitter?: (form: HTMLFormElement) => void;
}

export interface RunThreeDSBrowserFlowOptions extends ThreeDSMountOptions {
  completeThreeDSMethod?: (
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
      methodResult: "loaded" | "timeout";
    }
  | {
      status: "challenge_submitted";
      action: PaymentNextAction;
      response?: ExecutePaymentResponse;
      mounted: MountedThreeDSForm;
      methodResult?: "loaded" | "timeout";
    };

export interface WaitForPaymentTerminalRequest {
  paymentId: string;
  signal?: AbortSignal;
}

export type PaymentStatusSnapshot = Pick<Payment, "id" | "status" | "updated_at"> &
  Partial<Payment>;

export interface HandleNextActionOptions extends RunThreeDSBrowserFlowOptions {
  paymentId: string;
  response: ExecutePaymentResponse;
  waitForPaymentTerminal?: (request: WaitForPaymentTerminalRequest) => Promise<PaymentStatusSnapshot>;
  onChallengeSubmitted?: (request: {
    paymentId: string;
    action: PaymentNextAction;
    mounted: MountedThreeDSForm;
    response?: ExecutePaymentResponse;
    methodResult?: "loaded" | "timeout";
    signal?: AbortSignal;
  }) => Promise<PaymentStatusSnapshot | ExecutePaymentResponse | void>;
  terminalStatuses?: readonly TerminalPaymentStatus[];
}

export interface ConfirmPaymentOptions extends Omit<HandleNextActionOptions, "response"> {
  paymentId: string;
  cardTokenId: string;
  browserInfo?: BrowserInfo;
  executePayment: (request: ExecutePaymentRequest) => Promise<ExecutePaymentResponse>;
}

export type ConfirmPaymentNonTerminalReason =
  | "awaiting_webhook"
  | "poll_timeout"
  | "unsupported_next_action";

export type ConfirmPaymentResult =
  | {
      status: "terminal";
      paymentId: string;
      paymentStatus: TerminalPaymentStatus;
      payment?: PaymentStatusSnapshot;
      response?: ExecutePaymentResponse;
      threeDS?: ThreeDSBrowserFlowResult;
    }
  | {
      status: "requires_action";
      paymentId: string;
      nextAction: PaymentNextAction;
      response?: ExecutePaymentResponse;
      threeDS: Extract<ThreeDSBrowserFlowResult, { status: "challenge_submitted" }>;
    }
  | {
      status: "non_terminal";
      paymentId: string;
      paymentStatus: PaymentStatus | ExecutePaymentResponse["status"];
      payment?: PaymentStatusSnapshot;
      response?: ExecutePaymentResponse;
      threeDS?: ThreeDSBrowserFlowResult;
      reason: ConfirmPaymentNonTerminalReason;
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

const DEFAULT_TERMINAL_STATUSES: readonly TerminalPaymentStatus[] = [
  "authorized",
  "captured",
  "settled",
  "voided",
  "expired",
  "refunded",
  "chargeback",
  "declined",
  "failed",
];

const isTerminalStatus = (
  status: PaymentStatus | ExecutePaymentResponse["status"] | undefined,
  terminalStatuses: readonly TerminalPaymentStatus[] = DEFAULT_TERMINAL_STATUSES,
): status is TerminalPaymentStatus =>
  Boolean(status && terminalStatuses.includes(status as TerminalPaymentStatus));

const statusFrom = (
  value: PaymentStatusSnapshot | ExecutePaymentResponse | undefined,
): PaymentStatus | ExecutePaymentResponse["status"] | undefined => value?.status;

const resultFromStatus = (
  paymentId: string,
  value: PaymentStatusSnapshot | ExecutePaymentResponse,
  context: {
    response?: ExecutePaymentResponse;
    threeDS?: ThreeDSBrowserFlowResult;
    terminalStatuses?: readonly TerminalPaymentStatus[];
    reason?: ConfirmPaymentNonTerminalReason;
  } = {},
): ConfirmPaymentResult => {
  const status = statusFrom(value);
  if (isTerminalStatus(status, context.terminalStatuses)) {
    const payment = "id" in value ? value : undefined;
    return {
      status: "terminal",
      paymentId,
      paymentStatus: status,
      payment,
      response: context.response ?? ("payment_id" in value ? value : undefined),
      threeDS: context.threeDS,
    };
  }
  return {
    status: "non_terminal",
    paymentId,
    paymentStatus: status ?? "pending",
    payment: "id" in value ? value : undefined,
    response: context.response ?? ("payment_id" in value ? value : undefined),
    threeDS: context.threeDS,
    reason: context.reason ?? "awaiting_webhook",
  };
};

export const buildThreeDSBrowserForm = (nextAction: PaymentNextAction): BrowserPostForm => ({
  action: nextAction.three_ds.submit.url,
  method: nextAction.three_ds.submit.method,
  target: nextAction.three_ds.submit.target,
  fields: nextAction.three_ds.submit.fields,
});

const assertHTTPSActionURL = (action: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(action);
  } catch {
    throw new Error("3DS form action must be an absolute HTTPS URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("3DS form action must use HTTPS");
  }
};

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
  assertHTTPSActionURL(formDescriptor.action);
  const form = doc.createElement("form");
  const target =
    formDescriptor.target === "hidden_iframe"
      ? `arcpay-three-ds-method-${crypto.randomUUID()}`
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
  const completeThreeDSMethod = options.completeThreeDSMethod;
  if (!completeThreeDSMethod) {
    throw new Error("completeThreeDSMethod is required for 3DS Method actions");
  }

  const mounted = mountThreeDSBrowserForm(nextAction, options);
  try {
    mounted.submit();
    const methodResult = await waitForMethodFrame(
      mounted,
      options.methodTimeoutMs ?? 10_000,
      options.signal,
    );
    const indicator = options.methodCompletionIndicator ?? (methodResult === "loaded" ? "Y" : "N");
    const response = await completeThreeDSMethod(
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
        methodResult,
      };
    }
    return { status: "method_completed", response, methodResult };
  } finally {
    mounted.remove();
  }
};

export const handleNextAction = async (
  options: HandleNextActionOptions,
): Promise<ConfirmPaymentResult> => {
  const terminalStatuses = options.terminalStatuses ?? DEFAULT_TERMINAL_STATUSES;

  if (!options.response.next_action) {
    if (isTerminalStatus(options.response.status, terminalStatuses)) {
      return resultFromStatus(options.paymentId, options.response, {
        response: options.response,
        terminalStatuses,
      });
    }
    if (options.waitForPaymentTerminal) {
      try {
        const payment = await options.waitForPaymentTerminal({
          paymentId: options.paymentId,
          signal: options.signal,
        });
        return resultFromStatus(options.paymentId, payment, {
          response: options.response,
          terminalStatuses,
        });
      } catch {
        return resultFromStatus(options.paymentId, options.response, {
          response: options.response,
          terminalStatuses,
          reason: "poll_timeout",
        });
      }
    }
    return resultFromStatus(options.paymentId, options.response, {
      response: options.response,
      terminalStatuses,
    });
  }

  const threeDS = await runThreeDSBrowserFlow(options.response.next_action, options);
  if (threeDS.status === "challenge_submitted") {
    const challengeResult = await options.onChallengeSubmitted?.({
      paymentId: options.paymentId,
      action: threeDS.action,
      mounted: threeDS.mounted,
      response: threeDS.response,
      methodResult: threeDS.methodResult,
      signal: options.signal,
    });
    if (challengeResult) {
      return resultFromStatus(options.paymentId, challengeResult, {
        response: threeDS.response ?? options.response,
        threeDS,
        terminalStatuses,
      });
    }
    if (options.waitForPaymentTerminal) {
      try {
        const payment = await options.waitForPaymentTerminal({
          paymentId: options.paymentId,
          signal: options.signal,
        });
        return resultFromStatus(options.paymentId, payment, {
          response: threeDS.response ?? options.response,
          threeDS,
          terminalStatuses,
        });
      } catch {
        return {
          status: "requires_action",
          paymentId: options.paymentId,
          nextAction: threeDS.action,
          response: threeDS.response ?? options.response,
          threeDS,
        };
      }
    }
    return {
      status: "requires_action",
      paymentId: options.paymentId,
      nextAction: threeDS.action,
      response: threeDS.response ?? options.response,
      threeDS,
    };
  }
  if (threeDS.status === "method_completed") {
    return resultFromStatus(options.paymentId, threeDS.response, {
      response: threeDS.response,
      threeDS,
      terminalStatuses,
    });
  }
  return {
    status: "non_terminal",
    paymentId: options.paymentId,
    paymentStatus: options.response.status,
    response: options.response,
    threeDS,
    reason: "unsupported_next_action",
  };
};

export const confirmPayment = async (
  options: ConfirmPaymentOptions,
): Promise<ConfirmPaymentResult> => {
  const response = await options.executePayment({
    payment_method: "bank_card",
    payment_mode: "h2h",
    card_token_id: options.cardTokenId,
    browser_info: options.browserInfo ?? collectBrowserInfo(),
  });
  return handleNextAction({ ...options, response });
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
  assertHTTPSActionURL(form.action);
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
