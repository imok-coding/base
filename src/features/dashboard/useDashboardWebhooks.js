import { useEffect, useRef } from "react";
import { toISODate } from "../../lib/format";
import { loadWebhooks, postWebhook } from "../../lib/webhooks";

const YEARLY_KEY = "dashboard-yearly-posted";
const RELEASE_KEY = "dashboard-release-posted";

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/**
 * When an admin opens the dashboard: post last year's reading summary once per
 * year, and today's releases once per day, to the Discord webhooks.
 */
export function useDashboardWebhooks(stats, ready) {
  const ran = useRef(false);

  useEffect(() => {
    if (!ready || ran.current) return;
    ran.current = true;

    (async () => {
      const hooks = await loadWebhooks();
      const prevYear = new Date().getFullYear() - 1;
      const prevTotal = stats.previousYear.reduce((s, m) => s + m.value, 0);
      if (prevTotal && read(YEARLY_KEY) !== String(prevYear)) {
        const breakdown = stats.previousYear.map((m) => `${m.label}: ${m.value}`).join(", ");
        await postWebhook(
          hooks.yearly,
          `Yearly reads summary for ${prevYear}: ${prevTotal} total. Breakdown: ${breakdown}`
        );
        write(YEARLY_KEY, String(prevYear));
      }

      const todayKey = toISODate(new Date());
      if (read(RELEASE_KEY) !== todayKey) {
        const todays = stats.releases.filter((r) => toISODate(r.date) === todayKey);
        if (todays.length) {
          await postWebhook(
            hooks.release,
            `Wishlist releases for ${todayKey}:\n${todays.map((r) => `- ${r.title}`).join("\n")}`
          );
          write(RELEASE_KEY, todayKey);
        }
      }
    })();
  }, [ready, stats]);
}
