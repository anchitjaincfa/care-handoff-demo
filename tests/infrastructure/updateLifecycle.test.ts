import { describe, expect, it, vi } from "vitest";
import { applyWaitingServiceWorkerUpdate, monitorServiceWorkerUpdates } from "@/src/infrastructure/pwa/updateLifecycle";

describe("service-worker update lifecycle", () => {
  it("offers an already-waiting update to a prompt callback", async () => {
    const registration = new EventTarget() as unknown as ServiceWorkerRegistration;
    Object.defineProperty(registration, "waiting", { value: { postMessage: vi.fn() } });
    const container = new EventTarget() as unknown as ServiceWorkerContainer;
    Object.defineProperty(container, "controller", { value: {} });
    const prompt = vi.fn();
    const stop = monitorServiceWorkerUpdates(registration, prompt, container);
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    expect(prompt.mock.calls[0]?.[0].applyUpdate).toBeTypeOf("function");
    expect(prompt.mock.calls[0]?.[0].deferUpdate).toBeTypeOf("function");
    stop();
  });

  it("offers an installed update found after monitoring starts", async () => {
    let state: ServiceWorkerState = "installing";
    const installing = new EventTarget() as unknown as ServiceWorker;
    Object.defineProperty(installing, "state", { get: () => state });
    const registration = new EventTarget() as unknown as ServiceWorkerRegistration;
    Object.defineProperty(registration, "installing", { get: () => installing });
    Object.defineProperty(registration, "waiting", { get: () => state === "installed" ? installing : null });
    const container = new EventTarget() as unknown as ServiceWorkerContainer;
    Object.defineProperty(container, "controller", { value: {} });
    const prompt = vi.fn();
    const stop = monitorServiceWorkerUpdates(registration, prompt, container);
    registration.dispatchEvent(new Event("updatefound"));
    state = "installed";
    installing.dispatchEvent(new Event("statechange"));
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    stop();
  });

  it("defers Later until a subsequent worker installation lifecycle signal", async () => {
    let waiting = new EventTarget() as unknown as ServiceWorker;
    const registration = new EventTarget() as unknown as ServiceWorkerRegistration;
    Object.defineProperty(registration, "waiting", { get: () => waiting });
    let installing: ServiceWorker | null = null;
    Object.defineProperty(registration, "installing", { get: () => installing });
    const container = new EventTarget() as unknown as ServiceWorkerContainer;
    Object.defineProperty(container, "controller", { value: {} });
    const prompt = vi.fn();
    const stop = monitorServiceWorkerUpdates(registration, prompt, container);
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    prompt.mock.calls[0]?.[0].deferUpdate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prompt).toHaveBeenCalledOnce();

    let state: ServiceWorkerState = "installing";
    installing = new EventTarget() as unknown as ServiceWorker;
    Object.defineProperty(installing, "state", { get: () => state });
    registration.dispatchEvent(new Event("updatefound"));
    state = "installed";
    waiting = installing;
    installing.dispatchEvent(new Event("statechange"));
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(2));
    stop();
  });

  it("does not offer the first installation when no controller exists", async () => {
    const waiting = { postMessage: vi.fn() };
    const registration = new EventTarget() as unknown as ServiceWorkerRegistration;
    Object.defineProperty(registration, "waiting", { value: waiting });
    const container = new EventTarget() as unknown as ServiceWorkerContainer;
    Object.defineProperty(container, "controller", { value: null });
    const prompt = vi.fn();
    const stop = monitorServiceWorkerUpdates(registration, prompt, container);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prompt).not.toHaveBeenCalled();
    stop();
  });

  it("applies only after sending SKIP_WAITING and observing controllerchange", async () => {
    const container = new EventTarget() as unknown as ServiceWorkerContainer;
    const postMessage = vi.fn(() => queueMicrotask(() => container.dispatchEvent(new Event("controllerchange"))));
    const registration = { waiting: { postMessage } } as unknown as ServiceWorkerRegistration;
    await applyWaitingServiceWorkerUpdate(registration, container, 1_000);
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });
});
