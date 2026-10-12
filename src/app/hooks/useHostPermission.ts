import { useCallback, useEffect, useState } from "react";

const HOST_PERMISSION = { origins: ["http://*/*", "https://*/*"] };

/** Whether the extension may reach every site (and therefore Cove). The request runs in the click. */
export function useHostPermission() {
  const [granted, setGranted] = useState<boolean | null>(null);

  const refresh = useCallback(
    () =>
      chrome.permissions.contains(HOST_PERMISSION).then(
        (result) => setGranted(result),
        () => setGranted(false),
      ),
    [],
  );

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    chrome.permissions.onAdded.addListener(onChange);
    chrome.permissions.onRemoved.addListener(onChange);
    return () => {
      chrome.permissions.onAdded.removeListener(onChange);
      chrome.permissions.onRemoved.removeListener(onChange);
    };
  }, [refresh]);

  const grant = useCallback(
    () =>
      chrome.permissions.request(HOST_PERMISSION).then(
        (result) => {
          setGranted(result);
          return result;
        },
        () => false,
      ),
    [],
  );

  return { granted, grant, refresh };
}
