import { COPY } from "@/src/copy";

export default function Home() {
  return <main><p className="eyebrow">{COPY.home.eyebrow}</p><h1>{COPY.home.title}</h1><p>{COPY.home.intro}</p><a className="button" href="/today/">{COPY.home.primaryCta}</a><p className="privacy-note">{COPY.home.privacyNote}</p></main>;
}
