# BankAuction Data Model

The platform separates property, auction, source, document, and location data.

## Property categories

### Residential
Apartment / Flat, Studio, 1 BHK, 2 BHK, 3 BHK, 4 BHK, 5+ BHK, Independent House, Villa, Builder Floor, Duplex, Penthouse, Farm House, Residential Plot, Other.

### Commercial
Office, Shop, Showroom, Commercial Building, Retail Space, Restaurant, Hotel, Hospital, Clinic, School / Educational, Commercial Plot, Warehouse, Godown, Other.

### Industrial
Factory, Industrial Building / Land, Warehouse, Godown, Manufacturing Unit, Workshop, Industrial Plot, Other.

### Land / Plot
Residential Plot, Commercial Plot, Industrial Plot, Agricultural Land, Farm Land, NA Plot, Open Land, Development Land, Other.

### Agricultural
Agricultural Land, Farm, Orchard, Plantation, Agricultural Building, Other.

### Vehicles
Car, Commercial Vehicle, Truck, Bus, Two Wheeler, Construction Equipment, Heavy Machinery, Other.

## Dynamic property attributes

Only attributes relevant to a property should be displayed:

- configuration / BHK
- bedrooms
- bathrooms
- area and unit
- built-up area
- carpet area
- plot / land area
- floor and total floors
- facing
- property age
- possession
- furnishing
- parking
- construction status
- amenities

Unknown data remains unknown. "Not Applicable" is distinct from "Unknown".

## Auction attributes

- auction ID / external listing ID
- listing ID
- auction type
- auction method
- bank / institution
- branch
- authorized officer
- borrower
- reserve price
- EMD
- minimum increment
- auction start / end
- application deadline
- inspection details
- possession status
- DSC requirement
- reserve-price-as-first-bid rule
- time extension rule
- source URL
- sale notice
- bid form
- terms and conditions
- other permitted documents

## Legal schedule

Source records may contain:

- property schedule
- khata number
- khatauni number
- khasra / survey number
- PID
- ward
- taluk
- district
- measurements and units
- boundary descriptions

## Location

Store both normalized location fields and the original source location text. Source conflicts should be flagged for review instead of silently overwritten.

## Duplicate detection

Priority:

1. Exact external auction/listing ID
2. Notice number
3. Bank + address + auction date
4. Address similarity
5. Description similarity

One normalized property may have multiple source references.
