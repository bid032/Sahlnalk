-- Migration to add PayPal and payment/fulfillment tracking fields to orders table
ALTER TYPE public.payment_gateway ADD VALUE IF NOT EXISTS 'paypal';

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS paypal_order_id TEXT,
ADD COLUMN IF NOT EXISTS paypal_capture_id TEXT,
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Add index on paypal_order_id for fast lookup during capture & webhooks
CREATE INDEX IF NOT EXISTS orders_paypal_order_id_idx ON public.orders(paypal_order_id);
CREATE INDEX IF NOT EXISTS orders_paypal_capture_id_idx ON public.orders(paypal_capture_id);
