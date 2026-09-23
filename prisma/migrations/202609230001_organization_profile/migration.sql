-- Optional company profile fields; existing organizations retain their data and version.
ALTER TABLE "Organization"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "contactPhone" TEXT;

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_description_length" CHECK ("description" IS NULL OR char_length("description") <= 3000),
  ADD CONSTRAINT "Organization_website_format" CHECK ("website" IS NULL OR (char_length("website") <= 500 AND "website" ~* '^https?://')),
  ADD CONSTRAINT "Organization_contactPhone_format" CHECK ("contactPhone" IS NULL OR "contactPhone" ~ '^\+[1-9][0-9]{7,14}$');
