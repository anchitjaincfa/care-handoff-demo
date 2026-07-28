import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { COPY, type ExperiencePage } from "@/src/copy";
import { ExperienceApp } from "@/src/features/ExperienceApp";

const experiencePages = Object.keys({
  home: true,
  onboarding: true,
  today: true,
  capture: true,
  timeline: true,
  insights: true,
  handoff: true,
  privacy: true,
  settings: true,
  status: true,
  demo: true,
  pass: true,
} satisfies Record<ExperiencePage, true>) as ExperiencePage[];

beforeEach(() => {
  window.location.hash = "";
});

afterEach(cleanup);

describe("experience feature foundation", () => {
  it.each(experiencePages)("render-smokes the %s route through the facade", (page) => {
    const { container } = render(<ExperienceApp page={page} />);
    expect(container.firstElementChild).toBeInTheDocument();
  });

  it("preserves the public home call to action", () => {
    render(<ExperienceApp page="home" />);
    expect(screen.getByRole("heading", { name: COPY.home.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: COPY.home.primaryCta })).toHaveAttribute("href", "/onboarding/");
  });

  it("preserves the application shell navigation", () => {
    render(<ExperienceApp page="today" />);
    expect(screen.getByRole("navigation", { name: COPY.nav.primaryAria })).toBeInTheDocument();
  });
});
