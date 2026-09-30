import type { Customer, Place, Site, User } from "@/domain/types";

// All companies and people are fictional. Places are real so the map makes sense.

export const SITES: Site[] = [
  { id: "site-zgz", name: "Zaragoza Plant", kind: "factory", place: { name: "Zaragoza", country: "ES", lat: 41.6488, lng: -0.8891 } },
  { id: "site-bcn", name: "Barcelona Distribution Center", kind: "warehouse", place: { name: "El Prat de Llobregat", country: "ES", lat: 41.3275, lng: 2.0952 } },
  { id: "site-brno", name: "Brno Plant", kind: "factory", place: { name: "Brno", country: "CZ", lat: 49.1951, lng: 16.6068 } },
];

export const CUSTOMERS: Customer[] = [
  { id: "cust-oskendra-uk", name: "Oskendra UK Ltd", kind: "subsidiary", place: { name: "Birmingham", country: "GB", lat: 52.4862, lng: -1.8904 } },
  { id: "cust-oskendra-mx", name: "Oskendra México", kind: "subsidiary", place: { name: "Puebla", country: "MX", lat: 19.0414, lng: -98.2063 } },
  { id: "cust-solenne", name: "Solenne Équipements", kind: "customer", place: { name: "Villeurbanne", country: "FR", lat: 45.7719, lng: 4.8902 } },
  { id: "cust-kaltberg", name: "Kaltberg Bau GmbH", kind: "customer", place: { name: "Munich", country: "DE", lat: 48.1351, lng: 11.582 } },
  { id: "cust-ribeira", name: "Ribeira Maquinaria", kind: "customer", place: { name: "Porto", country: "PT", lat: 41.1579, lng: -8.6291 } },
  { id: "cust-meseta", name: "Meseta Suministros", kind: "customer", place: { name: "Madrid", country: "ES", lat: 40.4168, lng: -3.7038 } },
  { id: "cust-ostara", name: "Ostara Utensili", kind: "customer", place: { name: "Milan", country: "IT", lat: 45.4642, lng: 9.19 } },
];

export const PORTS = {
  valencia: { name: "Port of Valencia", country: "ES", lat: 39.4436, lng: -0.3175, portCode: "ESVLC" },
  barcelona: { name: "Port of Barcelona", country: "ES", lat: 41.3485, lng: 2.1637, portCode: "ESBCN" },
  veracruz: { name: "Port of Veracruz", country: "MX", lat: 19.2006, lng: -96.1339, portCode: "MXVER" },
} satisfies Record<string, Place>;

export const HUBS = {
  lyon: { name: "Tarnwick Lyon depot (Corbas)", country: "FR", lat: 45.6689, lng: 4.8975 },
} satisfies Record<string, Place>;

export const USERS: User[] = [
  { id: "u-ops-all", name: "Marta Ruiz · Logistics control tower", role: "ops", siteIds: ["site-zgz", "site-bcn", "site-brno"] },
  { id: "u-ops-cz", name: "Tomáš Novák · Operations, Brno", role: "ops", siteIds: ["site-brno"] },
  { id: "u-cust-solenne", name: "Claire Dubois · Solenne Équipements", role: "customer", customerId: "cust-solenne" },
  { id: "u-cust-oskendra-mx", name: "Diego Herrera · Oskendra México", role: "customer", customerId: "cust-oskendra-mx" },
  { id: "u-cust-oskendra-uk", name: "Oliver Grant · Oskendra UK", role: "customer", customerId: "cust-oskendra-uk" },
];
