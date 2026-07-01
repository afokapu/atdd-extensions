// Dirty: three distinct XSS sinks injecting unsanitized HTML into the DOM.
import { useEffect, useRef } from "react";

interface AnnouncementBannerProps {
  announcementHtml: string;
  tickerHtml: string;
}

export function AnnouncementBanner({ announcementHtml, tickerHtml }: AnnouncementBannerProps) {
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tickerRef.current) {
      // ❌ innerHTML assignment — raw HTML written straight into the DOM.
      tickerRef.current.innerHTML = tickerHtml;
      // ❌ outerHTML assignment — replaces the node with attacker-controlled markup.
      tickerRef.current.outerHTML = `<div class="ticker">${tickerHtml}</div>`;
    }
  }, [tickerHtml]);

  return (
    <div>
      {/* ❌ React's raw-HTML escape hatch below injects an unescaped string. */}
      <div dangerouslySetInnerHTML={{ __html: announcementHtml }} />
      <div ref={tickerRef} />
    </div>
  );
}
