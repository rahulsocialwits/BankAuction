import type { PropertyType } from "./auction";

export interface PropertyLocation {
  country?: string;
  state?: string;
  district?: string;
  city?: string;
  locality?: string;
  subLocality?: string;
  pincode?: string;
  fullAddress?: string;
  latitude?: number;
  longitude?: number;
  sourceText?: string;
  confidence?: number;
}

export interface PropertyRecord {
  id: string;
  title: string;
  propertyType: PropertyType;
  propertySubtype?: string;
  configuration?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  areaUnit?: string;
  builtUpArea?: number;
  carpetArea?: number;
  plotArea?: number;
  landArea?: number;
  floor?: number;
  totalFloors?: number;
  facing?: string;
  propertyAge?: number;
  possessionStatus?: string;
  furnishing?: string;
  parking?: string;
  constructionStatus?: string;
  amenities?: string[];
  description?: string;
  legalSchedule?: string;
  khataNumber?: string;
  khatauniNumber?: string;
  khasraNumber?: string;
  surveyNumber?: string;
  pidNumber?: string;
  ward?: string;
  taluk?: string;
  boundaries?: {
    east?: string;
    west?: string;
    north?: string;
    south?: string;
  };
  location: PropertyLocation;
  sourceRecordIds: string[];
  createdAt: string;
  updatedAt: string;
}
