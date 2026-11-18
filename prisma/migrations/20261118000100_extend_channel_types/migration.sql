BEGIN;
ALTER TYPE channel_type ADD VALUE IF NOT EXISTS 'sixteen';
ALTER TYPE channel_type ADD VALUE IF NOT EXISTS 'twenty_four';
COMMIT;
