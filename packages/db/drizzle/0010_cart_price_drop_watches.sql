ALTER TYPE "product_watch_alert_type"
  ADD VALUE IF NOT EXISTS 'cart-price-drop';

ALTER TABLE "email_product_watch"
  ADD COLUMN IF NOT EXISTS "context" jsonb;
