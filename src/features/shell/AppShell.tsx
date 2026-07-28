"use client";

import { COPY, type ExperiencePage } from "@/src/copy";
import { Icon, type IconName } from "@/src/components/Icon";
import { Badge, Brand } from "@/src/features/shared/ExperiencePrimitives";

const primaryNav: { href: string; label: string; icon: IconName; page: ExperiencePage }[] = [
  { href: "/today/", label: COPY.nav.today, icon: "home", page: "today" },
  { href: "/capture/", label: COPY.nav.capture, icon: "plus", page: "capture" },
  { href: "/timeline/", label: COPY.nav.timeline, icon: "clock", page: "timeline" },
  { href: "/insights/", label: COPY.nav.insights, icon: "spark", page: "insights" },
  { href: "/handoff/", label: COPY.nav.handoff, icon: "handoff", page: "handoff" },
];

const secondaryNav: { href: string; label: string; icon: IconName; page: ExperiencePage }[] = [
  { href: "/privacy/", label: COPY.nav.privacy, icon: "shield", page: "privacy" },
  { href: "/settings/", label: COPY.nav.settings, icon: "settings", page: "settings" },
];


export function AppNavigation({ page, demo }: { page: ExperiencePage; demo: boolean }) {
  return (
    <>
      <aside className="side-rail">
        <div>
          <Brand />
          {demo && <Badge tone="demo">{COPY.global.demo}</Badge>}
        </div>
        <nav aria-label={COPY.nav.primaryAria}>
          {primaryNav.map((item) => (
            <a className={item.page === page ? "nav-link nav-link--active" : "nav-link"} href={item.href} aria-current={item.page === page ? "page" : undefined} key={item.page}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </a>
          ))}
        </nav>
        <nav className="side-rail__secondary" aria-label={COPY.nav.secondaryAria}>
          {secondaryNav.map((item) => (
            <a className={item.page === page ? "nav-link nav-link--active" : "nav-link"} href={item.href} aria-current={item.page === page ? "page" : undefined} key={item.page}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </a>
          ))}
          <a className="demo-link" href={demo ? "/today/" : "/demo/"}>{demo ? COPY.demo.switch : COPY.nav.demo}<Icon name="chevron" /></a>
        </nav>
      </aside>
      <nav className="bottom-nav" aria-label={COPY.nav.mobileAria}>
        {primaryNav.map((item) => (
          <a className={item.page === page ? "bottom-nav__item bottom-nav__item--active" : "bottom-nav__item"} href={item.href} aria-current={item.page === page ? "page" : undefined} key={item.page}>
            <Icon name={item.icon} /><span>{item.label}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
