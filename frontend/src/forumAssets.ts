import type { Forum } from "./components/ChooseForumModal";
import { toAlpha2 } from "./countryCodeMap";

export const getForumIconSrc = (forum: Forum): string => {
  if (forum.countryCode) {
    const alpha2 = toAlpha2(forum.countryCode);
    if (alpha2) {
      return `./flags/${alpha2}.svg`;
    }
  }

  return "./earth.png";
};

export const preloadImageSrcs = (srcs: string[]): void => {
  const uniqueSrcs = new Set(srcs);

  for (const src of uniqueSrcs) {
    const image = new Image();
    image.src = src;
  }
};
