// Image URL helpers. Source URLs are Wikimedia Commons Special:FilePath links
// with a baked-in `width=` param; we swap that to build responsive variants.

const PHOTO_WIDTHS = [360, 540, 720, 1024] as const;
const COA_WIDTHS = [180, 240, 320, 440] as const;

function setWidth(url: string, w: number): string {
  if (/[?&]width=\d+/.test(url)) return url.replace(/([?&])width=\d+/, `$1width=${w}`);
  return url + (url.includes("?") ? "&" : "?") + "width=" + w;
}

export function imgAt(url: string, w: number): string {
  return setWidth(url, w);
}

export function photoSrcSet(url: string): string {
  return PHOTO_WIDTHS.map((w) => `${setWidth(url, w)} ${w}w`).join(", ");
}
export function coaSrcSet(url: string): string {
  return COA_WIDTHS.map((w) => `${setWidth(url, w)} ${w}w`).join(", ");
}
export function tiny(url: string): string {
  return setWidth(url, 32);
}

export const PHOTO_SIZES = "(min-width: 768px) 620px, 92vw";
export const COA_SIZES = "(min-width: 768px) 300px, 62vw";

export type Quality = "hd" | "lett";

// Resolve the <img> props for a prompt image given the user's quality choice.
// "lett" serves a single downsampled file (lighter + faster); "hd" serves a
// responsive srcset. Display and preload go through this so they always match.
export function heroProps(
  url: string,
  variant: "coa" | "photo",
  quality: Quality,
): { src: string; srcSet?: string; sizes?: string } {
  if (variant === "coa") {
    if (quality === "lett") return { src: imgAt(url, 220) };
    return { src: imgAt(url, 320), srcSet: coaSrcSet(url), sizes: COA_SIZES };
  }
  if (quality === "lett") return { src: imgAt(url, 480) };
  return { src: imgAt(url, 720), srcSet: photoSrcSet(url), sizes: PHOTO_SIZES };
}

// Warm the browser cache for an upcoming image, matching the displayed variant.
export function preloadImage(url: string, srcSet?: string, sizes?: string) {
  if (typeof window === "undefined") return;
  const img = new window.Image();
  if (sizes) img.sizes = sizes;
  if (srcSet) img.srcset = srcSet;
  img.src = url;
}
