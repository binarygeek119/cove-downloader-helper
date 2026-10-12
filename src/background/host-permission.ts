export const HOST_ORIGINS = ["http://*/*", "https://*/*"];

export function hasHostPermission(): Promise<boolean> {
  return chrome.permissions.contains({ origins: HOST_ORIGINS });
}

/**
 * Ask for access to every site. Must run synchronously inside a user gesture: awaiting anything
 * first makes Chrome reject the prompt. Resolves true when access was already granted.
 */
export function requestHostPermission(): Promise<boolean> {
  return chrome.permissions
    .request({ origins: HOST_ORIGINS })
    .then((granted) => {
      hostPermission.granted = granted;
      return granted;
    })
    .catch(() => false);
}

/**
 * Last known grant state, kept in memory so click handlers can decide synchronously whether a
 * prompt is needed. Refreshed at startup and on permission events.
 */
export const hostPermission = {
  granted: false,
  async refresh(): Promise<boolean> {
    this.granted = await hasHostPermission();
    return this.granted;
  },
};
