-- First two clients. Paste into the Neon SQL editor after schema.sql (or run `npm run db:setup`, which does both).
INSERT INTO clients (slug, name, zoho_org, channels, meta_match, google_match, default_position, position_fields, channel_since) VALUES
  ('placer-county-so', 'Placer County Sheriff''s Office', 'Placer County Sheriff''s Office', '{Meta,Indeed}', '{Placer}', '{}', NULL, '{}',
   '{"Meta":"2026-09-20","Indeed":"2026-09-20"}'),
  ('mshp', 'Missouri State Highway Patrol', 'Missouri State Highway Patrol', '{Meta,Google}', '{MSHP,Missouri}', '{"Missouri State Highway Patrol",MSHP}', NULL,
   '{Trooper,"Commercial Vehicle Officer"}', '{"Meta":"2026-09-20","Google":"2026-09-20"}')
ON CONFLICT (slug) DO NOTHING;
