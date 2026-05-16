type WindowLike = {
  location: {
    assign?: (url: string) => void;
    href: string;
  };
};

export const navigateToUrl = (url: string): void => {
  window.location.assign(url);
};

export const navigateWindowToUrl = (
  targetWindow: WindowLike,
  url: string
): void => {
  if (typeof targetWindow.location.assign === "function") {
    targetWindow.location.assign(url);
    return;
  }

  targetWindow.location.href = url;
};
