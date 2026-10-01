/**
 * Page lifecycle for client-side navigation (Astro ClientRouter).
 *
 * Module scripts run once per session, but pages are swapped in and out. Anything that
 * attaches to the DOM (ScrollTriggers, WebGL, listeners) must be set up on every
 * `astro:page-load` and torn down on `astro:before-swap`, or it leaks across pages.
 */

type Cleanup = () => void;
type Setup = () => Cleanup | void | Promise<Cleanup | void>;

const setups = new Set<Setup>();
let cleanups: Cleanup[] = [];
let pageLoaded = false;
let generation = 0;

async function run(setup: Setup) {
  const startedOn = generation;
  const cleanup = await setup();
  if (!cleanup) return;
  // An async setup can resolve after the visitor has already navigated away.
  if (startedOn !== generation) cleanup();
  else cleanups.push(cleanup);
}

/** Register `setup` to run on every page load; its returned function runs before the page is swapped. */
export function onPage(setup: Setup) {
  setups.add(setup);
  // The first page-load may already have fired by the time a lazily loaded module registers.
  if (pageLoaded) void run(setup);
}

document.addEventListener('astro:page-load', () => {
  pageLoaded = true;
  for (const setup of setups) void run(setup);
});

document.addEventListener('astro:before-swap', () => {
  generation++;
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
});

export const prefersReducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;
