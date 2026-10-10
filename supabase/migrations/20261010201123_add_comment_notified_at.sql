-- Email notification tracking for request comments.
-- A scheduled job (POST /api/comment-notifications) emails the counterpart
-- (requester <-> reviewer) about comments with notified_at IS NULL.
ALTER TABLE request_comments ADD COLUMN notified_at TIMESTAMPTZ;

-- "From now on": comments that already exist are never emailed retroactively.
UPDATE request_comments SET notified_at = now();

CREATE INDEX idx_request_comments_unnotified
  ON request_comments(created_at)
  WHERE notified_at IS NULL;
