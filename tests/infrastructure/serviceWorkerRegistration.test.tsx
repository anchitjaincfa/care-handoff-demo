import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServiceWorkerUpdatePrompt as UpdatePromptCallback } from "@/src/infrastructure/pwa/updateLifecycle";

const monitorUpdatesMock = vi.hoisted(() => vi.fn());
vi.mock("@/src/infrastructure/pwa/updateLifecycle", () => ({ monitorServiceWorkerUpdates: monitorUpdatesMock }));

import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

afterEach(() => {
  vi.clearAllMocks();
  if (originalDescriptor) Object.defineProperty(navigator, "serviceWorker", originalDescriptor);
  else Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("ServiceWorkerRegistration", () => {
  it("wires monitored updates into the dismissible prompt and cleans up", async () => {
    const registration = new EventTarget() as unknown as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
    const stop = vi.fn();
    monitorUpdatesMock.mockReturnValue(stop);
    const view = render(<ServiceWorkerRegistration />);
    await waitFor(() => expect(monitorUpdatesMock).toHaveBeenCalledOnce());
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    const call = monitorUpdatesMock.mock.calls[0] as unknown as [ServiceWorkerRegistration, UpdatePromptCallback];
    await act(async () => { await call[1](vi.fn().mockResolvedValue(undefined)); });
    expect(screen.getByRole("dialog", { name: "Update ready" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("dialog", { name: "Update ready" })).not.toBeInTheDocument();
    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
});
