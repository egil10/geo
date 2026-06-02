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
}: {
  idKey: string;
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
}) {
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const ready = loadedId === idKey;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* A tiny blurred copy fades out once the sharp image loads (blur-up). Both
          are contained, so the whole image always shows and the leftover space
          stays the card colour — no cropping, no blurry cover backdrop. */}
      <img
        aria-hidden
        src={tiny(src)}
        alt=""
        className={`absolute inset-0 h-full w-full scale-110 object-contain blur-2xl transition-opacity duration-500 ${ready ? "opacity-0" : "opacity-100"}`}
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
