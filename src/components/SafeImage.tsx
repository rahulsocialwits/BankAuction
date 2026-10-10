"use client";

import { useState } from "react";
import { PLACEHOLDER_IMAGE_URL } from "@/lib/constants";

/**
 * A photo from another website (a bank portal's CDN). If it cannot be loaded (deleted file, hotlink protection, slow network) the
 * placeholder is shown instead of a broken-image icon. No referrer is sent, so the source CDN does not see our page address.
 */
export default function SafeImage({ src, alt, className, loading = "lazy", width, height }: { src: string | null | undefined; alt: string; className?: string; loading?: "lazy" | "eager"; width?: number; height?: number }) {
  const [failed, setFailed] = useState(false);
  const shown = !src || failed ? PLACEHOLDER_IMAGE_URL : src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shown} alt={alt} className={className} loading={loading} decoding="async" width={width} height={height} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
