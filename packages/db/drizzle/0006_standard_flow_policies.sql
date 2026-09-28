ALTER TYPE "reentry_mode" ADD VALUE IF NOT EXISTS 'always';

ALTER TABLE "email_flow"
  ADD COLUMN IF NOT EXISTS "message_kind" text DEFAULT 'marketing' NOT NULL;

UPDATE "email_flow"
SET "message_kind" = 'transactional'
WHERE "trigger_event" IN (
  'gift_card.issued',
  'order.delivery_failed',
  'order.delivered',
  'order.out_for_delivery',
  'order.returned',
  'order.shipped'
);
