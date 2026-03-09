#!/usr/bin/env python3
"""
init-neo4j.py — Initialize Neo4j constraints and indexes for plaudeLM.

Creates all constraints and indexes defined in ARCHITECTURE.md.
Safe to re-run — uses IF NOT EXISTS syntax throughout (idempotent).

Required environment variables:
  NEO4J_URI       Bolt URI  (e.g. bolt://localhost:7687)
  NEO4J_USER      Username  (e.g. neo4j)
  NEO4J_PASSWORD  Password

Usage:
  python3 scripts/init-neo4j.py
"""

import os
import sys

from neo4j import GraphDatabase, Driver


# ---------------------------------------------------------------------------
# Environment validation — fail fast with clear error (CONSTITUTION III.2)
# ---------------------------------------------------------------------------


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"ERROR: required environment variable '{name}' is not set.", file=sys.stderr)
        sys.exit(1)
    return value


# ---------------------------------------------------------------------------
# DDL statements
# All use IF NOT EXISTS for full idempotency (Neo4j 5 syntax)
# ---------------------------------------------------------------------------

CONSTRAINTS: list[tuple[str, str]] = [
    (
        "plaudelm_concept_name_unique",
        "CREATE CONSTRAINT plaudelm_concept_name_unique IF NOT EXISTS "
        "FOR (c:Concept) REQUIRE c.name IS UNIQUE",
    ),
    (
        "plaudelm_document_id_unique",
        "CREATE CONSTRAINT plaudelm_document_id_unique IF NOT EXISTS "
        "FOR (d:Document) REQUIRE d.id IS UNIQUE",
    ),
    (
        "plaudelm_chunk_id_unique",
        "CREATE CONSTRAINT plaudelm_chunk_id_unique IF NOT EXISTS "
        "FOR (ch:Chunk) REQUIRE ch.id IS UNIQUE",
    ),
    (
        "plaudelm_event_name_unique",
        "CREATE CONSTRAINT plaudelm_event_name_unique IF NOT EXISTS "
        "FOR (e:Event) REQUIRE e.name IS UNIQUE",
    ),
]

INDEXES: list[tuple[str, str]] = [
    (
        "plaudelm_chunk_notebook_idx",
        "CREATE INDEX plaudelm_chunk_notebook_idx IF NOT EXISTS "
        "FOR (ch:Chunk) ON (ch.notebook)",
    ),
    (
        "plaudelm_concept_notebooks_idx",
        "CREATE INDEX plaudelm_concept_notebooks_idx IF NOT EXISTS "
        "FOR (c:Concept) ON (c.notebooks)",
    ),
    (
        "plaudelm_document_notebook_idx",
        "CREATE INDEX plaudelm_document_notebook_idx IF NOT EXISTS "
        "FOR (d:Document) ON (d.notebook)",
    ),
]

FULLTEXT_INDEXES: list[tuple[str, str]] = [
    (
        "conceptNameIndex",
        "CREATE FULLTEXT INDEX conceptNameIndex IF NOT EXISTS "
        "FOR (c:Concept) ON EACH [c.name]",
    ),
]


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


def init(driver: Driver) -> None:
    with driver.session() as session:
        print("Creating uniqueness constraints...")
        for name, cypher in CONSTRAINTS:
            session.run(cypher)
            print(f"  [ok] {name}")

        print("Creating range indexes...")
        for name, cypher in INDEXES:
            session.run(cypher)
            print(f"  [ok] {name}")

        print("Creating full-text indexes...")
        for name, cypher in FULLTEXT_INDEXES:
            session.run(cypher)
            print(f"  [ok] {name}")


def verify(driver: Driver) -> None:
    """Print a summary of constraints and indexes for confirmation."""
    with driver.session() as session:
        constraints = session.run(
            "SHOW CONSTRAINTS YIELD name WHERE name STARTS WITH 'plaudelm_' RETURN name"
        ).data()
        indexes = session.run(
            "SHOW INDEXES YIELD name, type "
            "WHERE name STARTS WITH 'plaudelm_' OR name = 'conceptNameIndex' "
            "RETURN name, type"
        ).data()

    print(f"\nVerification: {len(constraints)} constraint(s), {len(indexes)} index/indexes")
    for row in constraints:
        print(f"  constraint: {row['name']}")
    for row in indexes:
        print(f"  index ({row['type']}): {row['name']}")


def main() -> None:
    uri = _require_env("NEO4J_URI")
    user = _require_env("NEO4J_USER")
    password = _require_env("NEO4J_PASSWORD")

    print(f"Connecting to Neo4j at {uri}...")
    driver = GraphDatabase.driver(uri, auth=(user, password))

    try:
        driver.verify_connectivity()
        print("Connected.\n")
        init(driver)
        verify(driver)
        print("\nDone — Neo4j initialized successfully.")
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        driver.close()


if __name__ == "__main__":
    main()
