[
  {
    "table_schema": "public",
    "table_name": "categorias",
    "columns": [
      {
        "column_name": "id",
        "data_type": "uuid",
        "is_nullable": "NO",
        "default": "uuid_generate_v4()"
      },
      {
        "column_name": "empresa_id",
        "data_type": "uuid",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "nombre_es",
        "data_type": "text",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "nombre_en",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "nombre_fr",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "nombre_it",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "nombre_de",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "orden",
        "data_type": "integer",
        "is_nullable": "YES",
        "default": "0"
      },
      {
        "column_name": "created_at",
        "data_type": "timestamp with time zone",
        "is_nullable": "YES",
        "default": "timezone('utc'::text, now())"
      }
    ]
  },
  {
    "table_schema": "public",
    "table_name": "clientes",
    "columns": [
      {
        "column_name": "id",
        "data_type": "uuid",
        "is_nullable": "NO",
        "default": "uuid_generate_v4()"
      },
      {
        "column_name": "empresa_id",
        "data_type": "uuid",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "email",
        "data_type": "text",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "nombre",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "telefono",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "aceptar_promociones",
        "data_type": "boolean",
        "is_nullable": "YES",
        "default": "true"
      },
      {
        "column_name": "created_at",
        "data_type": "timestamp with time zone",
        "is_nullable": "YES",
        "default": "timezone('utc'::text, now())"
      }
    ]
  },
  {
    "table_schema": "public",
    "table_name": "empresas",
    "columns": [
      {
        "column_name": "id",
        "data_type": "uuid",
        "is_nullable": "NO",
        "default": "uuid_generate_v4()"
      },
      {
        "column_name": "nombre",
        "data_type": "text",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "dominio",
        "data_type": "text",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "logo_url",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "mostrar_carrito",
        "data_type": "boolean",
        "is_nullable": "YES",
        "default": "true"
      },
      {
        "column_name": "moneda",
        "data_type": "text",
        "is_nullable": "YES",
        "default": "'EUR'::text"
      },
      {
        "column_name": "created_at",
        "data_type": "timestamp with time zone",
        "is_nullable": "YES",
        "default": "timezone('utc'::text, now())"
      }
    ]
  },
  {
    "table_schema": "public",
    "table_name": "pedidos",
    "columns": [
      {
        "column_name": "id",
        "data_type": "uuid",
        "is_nullable": "NO",
        "default": "uuid_generate_v4()"
      },
      {
        "column_name": "numero_pedido",
        "data_type": "integer",
        "is_nullable": "NO",
        "default": "nextval('pedidos_numero_pedido_seq'::regclass)"
      },
      {
        "column_name": "empresa_id",
        "data_type": "uuid",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "cliente_email",
        "data_type": "text",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "cliente_telefono",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "total",
        "data_type": "numeric",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "moneda",
        "data_type": "text",
        "is_nullable": "YES",
        "default": "'EUR'::text"
      },
      {
        "column_name": "detalle_pedido",
        "data_type": "jsonb",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "estado",
        "data_type": "text",
        "is_nullable": "YES",
        "default": "'pendiente'::text"
      },
      {
        "column_name": "created_at",
        "data_type": "timestamp with time zone",
        "is_nullable": "YES",
        "default": "timezone('utc'::text, now())"
      }
    ]
  },
  {
    "table_schema": "public",
    "table_name": "perfiles_admin",
    "columns": [
      {
        "column_name": "id",
        "data_type": "uuid",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "empresa_id",
        "data_type": "uuid",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "nombre_completo",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "rol",
        "data_type": "text",
        "is_nullable": "YES",
        "default": "'admin'::text"
      },
      {
        "column_name": "created_at",
        "data_type": "timestamp with time zone",
        "is_nullable": "YES",
        "default": "timezone('utc'::text, now())"
      }
    ]
  },
  {
    "table_schema": "public",
    "table_name": "productos",
    "columns": [
      {
        "column_name": "id",
        "data_type": "uuid",
        "is_nullable": "NO",
        "default": "uuid_generate_v4()"
      },
      {
        "column_name": "empresa_id",
        "data_type": "uuid",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "categoria_id",
        "data_type": "uuid",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "titulo_es",
        "data_type": "text",
        "is_nullable": "NO",
        "default": null
      },
      {
        "column_name": "titulo_en",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "titulo_fr",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "titulo_it",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "titulo_de",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "descripcion_es",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "descripcion_en",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "descripcion_fr",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "descripcion_it",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "descripcion_de",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "precio",
        "data_type": "numeric",
        "is_nullable": "NO",
        "default": "0.00"
      },
      {
        "column_name": "foto_url",
        "data_type": "text",
        "is_nullable": "YES",
        "default": null
      },
      {
        "column_name": "es_especial",
        "data_type": "boolean",
        "is_nullable": "YES",
        "default": "false"
      },
      {
        "column_name": "activo",
        "data_type": "boolean",
        "is_nullable": "YES",
        "default": "true"
      },
      {
        "column_name": "created_at",
        "data_type": "timestamp with time zone",
        "is_nullable": "YES",
        "default": "timezone('utc'::text, now())"
      }
    ]
  }
]