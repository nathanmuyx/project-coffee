-- Add money_on_keep column to cash_on_hand table
ALTER TABLE cash_on_hand ADD COLUMN IF NOT EXISTS money_on_keep numeric DEFAULT 0;
