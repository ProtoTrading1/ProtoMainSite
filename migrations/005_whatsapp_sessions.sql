-- Tracks active WATI ↔ Intercom conversation sessions
-- One row per WhatsApp number; upserted on first "customer service" trigger
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  phone                    text PRIMARY KEY,
  intercom_conversation_id text NOT NULL,
  intercom_contact_id      text,
  created_at               timestamptz DEFAULT now(),
  last_message_at          timestamptz DEFAULT now()
);

-- Only service-role API can read/write this table
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON whatsapp_sessions
  USING (false)
  WITH CHECK (false);
