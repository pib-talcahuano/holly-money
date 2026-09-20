-- Supports the purpose-history lookup: filter by requested_by, ordered by created_at desc.
-- budget_intentions had no index on requested_by before this (only token, ministry_id, status).
CREATE INDEX idx_budget_intentions_requester_created
  ON budget_intentions(requested_by, created_at DESC);
