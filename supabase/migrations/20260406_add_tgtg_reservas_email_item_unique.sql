-- Prevent the same email from claiming the same item more than once.
-- Previously only `token` was UNIQUE, allowing multiple valid tokens
-- per email+item to be generated and claimed independently.
ALTER TABLE tgtg_reservas
  ADD CONSTRAINT tgtg_reservas_email_item_unique UNIQUE (email, item_id);
