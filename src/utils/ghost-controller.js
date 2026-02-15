/**
 * Cerebr Yield Guard Controller
 * Provides a lightweight bridge for manual debugger compatibility toggling.
 */
(function () {
  const BRIDGE_KEY = '__CEREBR_GHOST_BRIDGE__';
  const CONTROLLER_KEY = '__CEREBR_YIELD_CONTROLLER__';
  const LOG_PREFIX = '[CerebrCompat][YieldGuard]';
  const POLL_INTERVAL_MS = 120;
  const POLL_TIMEOUT_MS = 10000;

  function resolveBridge() {
    const candidate = window[BRIDGE_KEY];
    if (!candidate || typeof candidate !== 'object') return null;
    if (typeof candidate.setGhostMode !== 'function') return null;
    if (typeof candidate.toggleGhostMode !== 'function') return null;
    if (typeof candidate.getState !== 'function') return null;
    return candidate;
  }

  function exposeController(bridge) {
    const controller = {
      setYield(enable, reason = 'controller') {
        return bridge.setGhostMode(Boolean(enable), reason);
      },
      toggleYield(reason = 'controller') {
        return bridge.toggleGhostMode(reason);
      },
      getState() {
        return bridge.getState();
      }
    };

    try {
      Object.defineProperty(window, CONTROLLER_KEY, {
        value: controller,
        configurable: true,
        enumerable: false,
        writable: false
      });
      return;
    } catch {
      window[CONTROLLER_KEY] = controller;
    }
  }

  function bootstrap() {
    const startTime = Date.now();

    const poll = () => {
      const bridge = resolveBridge();
      if (bridge) {
        exposeController(bridge);
        console.info(`${LOG_PREFIX} controller ready`);
        return;
      }

      if (Date.now() - startTime >= POLL_TIMEOUT_MS) {
        console.warn(`${LOG_PREFIX} bridge not available within timeout`);
        return;
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
  }

  bootstrap();
})();
