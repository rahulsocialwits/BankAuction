/*
 * Map tiles. Default: OpenStreetMap's public tile server: free, no account, no API key. Its usage policy
 * (https://operations.osmfoundation.org/policies/tiles/) allows normal website use with attribution but not heavy traffic: if the
 * site grows, set NEXT_PUBLIC_MAP_TILE_URL (and NEXT_PUBLIC_MAP_ATTRIBUTION) to a hosted tile provider's URL, no code change needed.
 */
export const MAP_TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const MAP_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
export const MAP_DEFAULT_CENTER: [number, number] = [22.5, 79]; // centre of India, used only before any pin exists
export const MAP_DEFAULT_ZOOM = 5;
