/* eslint-disable @next/next/no-img-element */

/**
 * One picture for desktop and another for mobile (uploaded separately by the master admin). The browser downloads
 * only the one it needs. If only one was uploaded it is used everywhere.
 */
export default function ResponsiveImage({
  desktop,
  mobile,
  alt = "",
  className,
  priority,
}: {
  desktop?: string | null;
  mobile?: string | null;
  alt?: string;
  className?: string;
  priority?: boolean;
}) {
  const fallback = mobile ?? desktop;
  if (!fallback) return null;
  const loading = priority ? "eager" : "lazy";
  if (desktop && mobile) {
    return (
      <picture>
        <source media="(min-width: 768px)" srcSet={desktop} />
        <img src={mobile} alt={alt} className={className} loading={loading} decoding="async" fetchPriority={priority ? "high" : undefined} />
      </picture>
    );
  }
  return <img src={fallback} alt={alt} className={className} loading={loading} decoding="async" fetchPriority={priority ? "high" : undefined} />;
}
