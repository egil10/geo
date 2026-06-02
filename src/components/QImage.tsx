"use client";

import { useState } from "react";
import { tiny } from "@/lib/images";

// Blur-up image: a tiny blurred placeholder sits behind the full image and fades
// out once it loads. Readiness is derived from which round id has loaded (not a
// reset boolean), and a ref catches already-cached images. See BLUEPRINT §11.
export default function QImage({
  idKey,
  src,
  srcSet,
  sizes,
  alt,
  variant,
}: {
  idKey: string;
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  variant: "coa" | "photo";
}) {
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const ready = loadedId === idKey;
  const isPhoto = variant === "photo";

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Photos: a blurred cover backdrop fills the whole card so portrait /
          odd-ratio photos don't float in empty margins. Coats of arms keep a
          clean (contain) placeholder that fades out — no blurry shield behind.
          Either way the sharp image on top is contained, so nothing is cropped. */}
      <img
        aria-hidden
        src={tiny(src)}
        alt=""
        className={
          isPhoto
            ? "absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
            : `absolute inset-0 h-full w-full scale-110 object-contain blur-2xl transition-opacity duration-500 ${ready ? "opacity-0" : "opacity-100"}`
        }
      />
      <img
        key={idKey}
        ref={(el) => {
          if (el?.complete) setLoadedId(idKey);
        }}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        fetchPriority="high"
        onLoad={() => setLoadedId(idKey)}
        className={`relative h-full w-full object-contain transition-opacity duration-500 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
