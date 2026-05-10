import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ArcPay } from "../../src";
import { ArcPayProvider, useArcPay } from "../../src/react";

const Probe = () => {
  const state = useArcPay();
  if (state.status === "loading") return <p>loading</p>;
  if (state.status === "error") return <p>error</p>;
  return <p data-testid="key">{state.instance.publishableKey}</p>;
};

describe("ArcPayProvider + useArcPay", () => {
  beforeEach(() => {
    ArcPay.__resetForTests();
  });

  it("loads instance and exposes via hook", async () => {
    render(
      <ArcPayProvider publishableKey="pk_test_x">
        <Probe />
      </ArcPayProvider>,
    );
    expect(await screen.findByTestId("key")).toHaveTextContent("pk_test_x");
  });

  it("eventually resolves to ready state", async () => {
    render(
      <ArcPayProvider publishableKey="pk_test_x">
        <Probe />
      </ArcPayProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("key")).toBeTruthy());
  });

  it("useArcPay throws when used outside provider", () => {
    const Bad = () => {
      useArcPay();
      return null;
    };
    expect(() => render(<Bad />)).toThrowError(/ArcPayProvider/i);
  });
});
