CREATE TABLE runs (
    id             TEXT PRIMARY KEY,
    schema_version TEXT        NOT NULL,
    brand          TEXT        NOT NULL,
    competitors    TEXT[]      NOT NULL DEFAULT '{}',
    status         TEXT        NOT NULL CHECK (status IN ('SCORED', 'HALTED')),
    halt_reasons   JSONB       NOT NULL DEFAULT '[]',
    score          JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- fail closed at the storage layer too: a SCORED run must carry a score, a HALTED one must not
    CONSTRAINT score_matches_status CHECK (
        (status = 'SCORED' AND score IS NOT NULL) OR (status = 'HALTED' AND score IS NULL)
    )
);

CREATE TABLE samples (
    id           BIGSERIAL PRIMARY KEY,
    run_id       TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    idx          INTEGER NOT NULL,
    prompt       TEXT    NOT NULL,
    status       TEXT    NOT NULL CHECK (status IN ('VALID', 'INVALID', 'QUERY_FAILED')),
    raw_response TEXT,
    extraction   JSONB,
    reasons      JSONB   NOT NULL DEFAULT '[]',
    attempts     INTEGER NOT NULL DEFAULT 0,
    UNIQUE (run_id, idx)
);

CREATE INDEX samples_run_status_idx ON samples (run_id, status);
CREATE INDEX runs_brand_created_idx ON runs (brand, created_at DESC);
