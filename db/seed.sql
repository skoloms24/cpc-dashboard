-- First two clients. Paste into the Neon SQL editor after schema.sql (or run `npm run db:setup`, which does both).
INSERT INTO clients (slug, name, zoho_org, channels, meta_match, google_match, default_position) VALUES
  ('placer-county-so', 'Placer County Sheriff''s Office', 'Placer County Sheriff''s Office', '{Meta,Indeed}', '{Placer}', '{}', NULL),
  ('mshp', 'Missouri State Highway Patrol', 'Missouri State Highway Patrol', '{Meta,Google}', '{MSHP,Missouri}', '{"Missouri State Highway Patrol",MSHP}', 'Trooper')
ON CONFLICT (slug) DO NOTHING;
