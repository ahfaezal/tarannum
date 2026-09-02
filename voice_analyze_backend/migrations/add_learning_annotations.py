"""Create the timestamped Qari learning annotations table."""
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import engine


SQL = """
CREATE TABLE IF NOT EXISTS learning_annotations (
    id UUID PRIMARY KEY,
    reference_id VARCHAR NOT NULL REFERENCES "references"(id) ON DELETE CASCADE,
    qari_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    annotation_type VARCHAR NOT NULL,
    label VARCHAR NOT NULL,
    arabic_text TEXT,
    note TEXT,
    start_time DOUBLE PRECISION NOT NULL,
    end_time DOUBLE PRECISION,
    vertical_position DOUBLE PRECISION,
    status VARCHAR NOT NULL DEFAULT 'published',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_learning_annotations_reference_id ON learning_annotations(reference_id);
CREATE INDEX IF NOT EXISTS ix_learning_annotations_qari_id ON learning_annotations(qari_id);
CREATE INDEX IF NOT EXISTS ix_learning_annotations_type ON learning_annotations(annotation_type);
ALTER TABLE learning_annotations ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'published';
ALTER TABLE learning_annotations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE learning_annotations ADD COLUMN IF NOT EXISTS vertical_position DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS ix_learning_annotations_status ON learning_annotations(status);
"""


if __name__ == "__main__":
    with engine.begin() as connection:
        connection.execute(text(SQL))
    print("learning_annotations table is ready")
