// Research notes (Oct 2026):
// - Google Maps: "University of Gold Coast", plus code JWM5+J5V, Basket Junction near
//   Pleasant Place Church, Spintex Road, Accra. Centre ≈ 5.6341 N, 0.0921 W.
// - Founded 2004 as AFRILEAD → Graduate School of Governance & Leadership →
//   Accra Business School → University of Gold Coast (Presidential Charter, Dec 2024).
// - Tagline "Born for Commerce. Built for Industry." Accredited by GTEC.
// Road and boundary coordinates below are hand-traced approximations, not survey data.

export type LatLng = { lat: number; lng: number };

export const UGC: LatLng = { lat: 5.6341, lng: -0.0921 };

export type ZoomStop = {
  key: string;
  label: string;
  sub: string;
  lat: number;
  lng: number;
  altKm: number; // camera altitude above the surface
};

export const ZOOM_STOPS: ZoomStop[] = [
  { key: "earth", label: "Earth", sub: "Third rock from the sun", lat: 4, lng: 16, altKm: 15000 },
  { key: "africa", label: "Africa", sub: "54 nations · 1.4 billion people", lat: 3, lng: 17, altKm: 7200 },
  { key: "ghana", label: "Ghana", sub: "Formerly the Gold Coast", lat: 7.95, lng: -1.03, altKm: 950 },
  { key: "accra", label: "Greater Accra", sub: "Capital region on the Gulf of Guinea", lat: 5.7, lng: -0.12, altKm: 75 },
  { key: "ugc", label: "University of Gold Coast", sub: "Baatsona · off Milton St, Spintex", lat: UGC.lat, lng: UGC.lng, altKm: 2.2 },
];

export const AFRICA = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cameroon", "Cabo Verde",
  "Central African Rep.", "Chad", "Comoros", "Congo", "Dem. Rep. Congo", "Côte d'Ivoire", "Djibouti",
  "Egypt", "Eq. Guinea", "Eritrea", "eSwatini", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea",
  "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania",
  "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda", "São Tomé and Principe",
  "Senegal", "Seychelles", "Sierra Leone", "Somalia", "Somaliland", "South Africa", "S. Sudan", "Sudan",
  "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe", "W. Sahara",
]);

// Approximate Greater Accra Region outline [lng, lat].
export const GREATER_ACCRA: [number, number][] = [
  [-0.4, 5.47], [-0.3, 5.5], [-0.21, 5.53], [-0.12, 5.57], [-0.02, 5.62], [0.08, 5.69], [0.2, 5.73],
  [0.35, 5.76], [0.5, 5.77], [0.66, 5.78], [0.7, 5.86], [0.56, 5.96], [0.38, 6.05], [0.18, 6.08],
  [0.02, 6.0], [-0.12, 5.93], [-0.24, 5.87], [-0.33, 5.76], [-0.42, 5.62],
];

// Detail patch extents (lng/lat bounds) layered over the globe at deeper zooms.
export const GHANA_PATCH = { lonMin: -3.6, lonMax: 1.6, latMin: 4.4, latMax: 11.4 };
export const ACCRA_PATCH = { lonMin: -0.48, lonMax: 0.36, latMin: 5.42, latMax: 5.98 };
export const SITE_PATCH = { lonMin: -0.1321, lonMax: -0.0521, latMin: 5.5991, latMax: 5.6691 };

export type Road = { name: string; kind: "major" | "minor"; pts: [number, number][] };

export const ACCRA_ROADS: Road[] = [
  { name: "Spintex Road", kind: "major", pts: [[-0.174, 5.615], [-0.15, 5.622], [-0.125, 5.627], [-0.0921, 5.6336], [-0.06, 5.641], [-0.03, 5.65], [-0.01, 5.66]] },
  { name: "Accra–Tema Motorway", kind: "major", pts: [[-0.172, 5.62], [-0.13, 5.64], [-0.09, 5.655], [-0.05, 5.668], [-0.01, 5.68], [0.02, 5.69]] },
  { name: "Tetteh Quarshie–Airport", kind: "major", pts: [[-0.172, 5.618], [-0.18, 5.6], [-0.19, 5.58], [-0.2, 5.56]] },
  { name: "N1 George Bush Hwy", kind: "major", pts: [[-0.172, 5.618], [-0.2, 5.61], [-0.24, 5.6], [-0.28, 5.575], [-0.33, 5.54]] },
  { name: "Labadi Road", kind: "minor", pts: [[-0.2, 5.556], [-0.165, 5.565], [-0.13, 5.58], [-0.09, 5.6], [-0.05, 5.62], [-0.01, 5.635]] },
  { name: "N2 / Madina", kind: "minor", pts: [[-0.172, 5.62], [-0.168, 5.66], [-0.165, 5.69], [-0.16, 5.73]] },
];

export const ACCRA_PLACES: { name: string; lng: number; lat: number }[] = [
  { name: "Accra Central", lng: -0.205, lat: 5.55 },
  { name: "Kotoka Int'l Airport", lng: -0.171, lat: 5.605 },
  { name: "Tema", lng: 0.0, lat: 5.67 },
  { name: "Madina", lng: -0.166, lat: 5.68 },
  { name: "Spintex", lng: -0.11, lat: 5.64 },
  { name: "Labadi Beach", lng: -0.15, lat: 5.56 },
  { name: "Kasoa", lng: -0.42, lat: 5.53 },
  { name: "Prampram", lng: 0.11, lat: 5.71 },
  { name: "Gulf of Guinea", lng: -0.15, lat: 5.47 },
];

export const WREXHAM: LatLng = { lat: 53.05, lng: -2.99 }; // partner university (Wrexham MBA)

