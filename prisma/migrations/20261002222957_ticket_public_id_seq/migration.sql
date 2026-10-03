-- Monotonic counter for human-readable ticket IDs (TK-000001, TK-000002, ...).
-- Consumed with SELECT nextval('ticket_public_id_seq') inside the ticket-creation
-- transaction so concurrent creates can never produce the same public ID.
CREATE SEQUENCE IF NOT EXISTS ticket_public_id_seq START WITH 1 INCREMENT BY 1;
