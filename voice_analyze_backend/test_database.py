

import os
from sqlalchemy import create_engine

DB_PASSWORD = "#1113tencom"
engine = create_engine(
    f"postgresql+psycopg2://postgres:{DB_PASSWORD}@127.0.0.1:5432/tarannum_db1koljkl",
    echo=True
)
