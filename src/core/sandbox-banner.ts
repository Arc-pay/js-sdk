const BANNER_ATTR = "data-arcpay-sandbox-banner";

export const showSandboxBanner = (): void => {
  if (typeof document === "undefined") return;
  if (document.querySelector(`[${BANNER_ATTR}]`)) return;

  const bar = document.createElement("div");
  bar.setAttribute(BANNER_ATTR, "");
  bar.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#ffd166;color:#222;font:13px/1.4 system-ui,sans-serif;padding:6px 12px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.1);";

  const text = document.createElement("span");
  text.textContent = "ARC PAY TEST MODE — payments are simulated";
  bar.appendChild(text);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.setAttribute("data-arcpay-banner-dismiss", "");
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss test mode banner");
  dismiss.style.cssText =
    "margin-left:12px;background:transparent;border:0;font-size:18px;cursor:pointer;color:inherit;";
  dismiss.addEventListener("click", () => bar.remove());
  bar.appendChild(dismiss);

  document.body.appendChild(bar);
};
