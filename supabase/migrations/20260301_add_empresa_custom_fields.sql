-- Add custom fields to empresas
ALTER TABLE public.empresas 
ADD COLUMN IF NOT EXISTS titulo TEXT NULL,
ADD COLUMN IF NOT EXISTS subtitulo TEXT NULL,
ADD COLUMN IF NOT EXISTS subtitulo2_es TEXT NULL,
ADD COLUMN IF NOT EXISTS subtitulo2_en TEXT NULL,
ADD COLUMN IF NOT EXISTS subtitulo2_fr TEXT NULL,
ADD COLUMN IF NOT EXISTS subtitulo2_it TEXT NULL,
ADD COLUMN IF NOT EXISTS subtitulo2_de TEXT NULL,
ADD COLUMN IF NOT EXISTS footer1_es TEXT NULL,
ADD COLUMN IF NOT EXISTS footer1_en TEXT NULL,
ADD COLUMN IF NOT EXISTS footer1_fr TEXT NULL,
ADD COLUMN IF NOT EXISTS footer1_it TEXT NULL,
ADD COLUMN IF NOT EXISTS footer1_de TEXT NULL,
ADD COLUMN IF NOT EXISTS footer2_es TEXT NULL,
ADD COLUMN IF NOT EXISTS footer2_en TEXT NULL,
ADD COLUMN IF NOT EXISTS footer2_fr TEXT NULL,
ADD COLUMN IF NOT EXISTS footer2_it TEXT NULL,
ADD COLUMN IF NOT EXISTS footer2_de TEXT NULL;

-- Set default values for Mermelada de Tomate (id: 8c5aa146-7fd9-436f-83c6-041118aaa625)
UPDATE public.empresas SET 
  titulo = 'BENVENUTI',
  subtitulo = 'Buon appetito!',
  subtitulo2_es = 'Nuestra Carta',
  footer1_es = 'TODOS NUESTROS PRODUCTOS SON SUSCEPTIBLES DE CONTENER DE MANERA DIRECTA O A TRAVES DE CONTAMINACION CRUZADA ALGUN TIPO DE ALERGENO',
  footer2_es = 'Crustáceos|Pescado|Huevos|Cacahuetes|Soja|Lácteos|Frutos con cáscara|Apio|Moluscos|Altramuces|Mostaza|Granos sésamo|Dióxido de azufre y sulfitos'
WHERE id = '8c5aa146-7fd9-436f-83c6-041118aaa625';
