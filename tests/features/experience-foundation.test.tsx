import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { COPY } from "@/src/copy";
import { ExperienceApp } from "@/src/features/ExperienceApp";

afterEach(cleanup);

describe("experience feature foundation", () => {
  it("renders the public home experience through the route facade", () => {
    render(<ExperienceApp page="home" />);
    expect(screen.getByRole("heading", { name: COPY.home.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: COPY.home.primaryCta })).toHaveAttribute("href", "/onboarding/");
  });

  it("renders the application shell and today feature through the route facade", () => {
    render(<ExperienceApp page="today" />);
    expect(screen.getByRole("heading", { name: COPY.today.title })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: COPY.nav.primaryAria })).toBeInTheDocument();
  });
});
