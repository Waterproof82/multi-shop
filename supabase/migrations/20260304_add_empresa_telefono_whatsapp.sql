-- Add telefono_whatsapp to empresas for WhatsApp notifications
ALTER TABLE public.empresas 
ADD COLUMN IF NOT EXISTS telefono_whatsapp TEXT NULL;
