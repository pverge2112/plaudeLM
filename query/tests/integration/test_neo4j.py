"""
Integration tests for Neo4j infrastructure (Spec #1, AC-3 through AC-6).

Requires a running Neo4j instance and init-neo4j.py to have been executed.
Run with: pytest tests/integration/test_neo4j.py -m integration

Environment variables required:
  TEST_NEO4J_URI       bolt://localhost:7687
  TEST_NEO4J_USER      neo4j
  TEST_NEO4J_PASSWORD  <password>
"""

import pytest
from neo4j import GraphDatabase, Driver


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _driver(uri: str, user: str, password: str) -> Driver:
    return GraphDatabase.driver(uri, auth=(user, password))


def _query(driver: Driver, cypher: str) -> list[dict]:  # type: ignore[type-arg]
    with driver.session() as session:
        result = session.run(cypher)
        return [record.data() for record in result]


# ---------------------------------------------------------------------------
# Connectivity
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_neo4j_is_reachable(neo4j_uri: str, neo4j_user: str, neo4j_password: str) -> None:
    """Neo4j Bolt endpoint accepts connections."""
    driver = _driver(neo4j_uri, neo4j_user, neo4j_password)
    driver.verify_connectivity()
    driver.close()


# ---------------------------------------------------------------------------
# Uniqueness constraints (AC-4)
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.parametrize(
    "label,property_name",
    [
        ("Concept", "name"),
        ("Document", "id"),
        ("Chunk", "id"),
        ("Event", "name"),
    ],
)
def test_uniqueness_constraint_exists(
    neo4j_uri: str,
    neo4j_user: str,
    neo4j_password: str,
    label: str,
    property_name: str,
) -> None:
    """Uniqueness constraint exists for each required node label and property."""
    driver = _driver(neo4j_uri, neo4j_user, neo4j_password)
    rows = _query(
        driver,
        "SHOW CONSTRAINTS YIELD name, type, labelsOrTypes, properties "
        "WHERE type = 'UNIQUENESS' "
        f"AND '{label}' IN labelsOrTypes "
        f"AND '{property_name}' IN properties "
        "RETURN count(*) AS cnt",
    )
    driver.close()
    assert rows[0]["cnt"] == 1, (
        f"Expected uniqueness constraint on :{label}({property_name}) — not found"
    )


# ---------------------------------------------------------------------------
# Range indexes (AC-5)
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.parametrize(
    "label,property_name",
    [
        ("Chunk", "notebook"),
        ("Concept", "notebooks"),
        ("Document", "notebook"),
    ],
)
def test_range_index_exists(
    neo4j_uri: str,
    neo4j_user: str,
    neo4j_password: str,
    label: str,
    property_name: str,
) -> None:
    """Range index exists for each required label and property."""
    driver = _driver(neo4j_uri, neo4j_user, neo4j_password)
    rows = _query(
        driver,
        "SHOW INDEXES YIELD name, type, labelsOrTypes, properties "
        "WHERE type IN ['RANGE', 'BTREE'] "
        f"AND '{label}' IN labelsOrTypes "
        f"AND '{property_name}' IN properties "
        "RETURN count(*) AS cnt",
    )
    driver.close()
    assert rows[0]["cnt"] >= 1, (
        f"Expected range index on :{label}({property_name}) — not found"
    )


# ---------------------------------------------------------------------------
# Full-text index (AC-5)
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_fulltext_index_concept_name_exists(
    neo4j_uri: str, neo4j_user: str, neo4j_password: str
) -> None:
    """Full-text index 'conceptNameIndex' exists on Concept.name."""
    driver = _driver(neo4j_uri, neo4j_user, neo4j_password)
    rows = _query(
        driver,
        "SHOW INDEXES YIELD name, type "
        "WHERE type = 'FULLTEXT' AND name = 'conceptNameIndex' "
        "RETURN count(*) AS cnt",
    )
    driver.close()
    assert rows[0]["cnt"] == 1, "Expected full-text index 'conceptNameIndex' — not found"


# ---------------------------------------------------------------------------
# Idempotency (AC-6)
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_constraint_count_stable_after_second_init(
    neo4j_uri: str, neo4j_user: str, neo4j_password: str
) -> None:
    """Running init-neo4j.py a second time does not create duplicate constraints."""
    import os
    import subprocess

    env = {
        **os.environ,
        "NEO4J_URI": neo4j_uri,
        "NEO4J_USER": neo4j_user,
        "NEO4J_PASSWORD": neo4j_password,
    }

    driver = _driver(neo4j_uri, neo4j_user, neo4j_password)

    rows_before = _query(
        driver,
        "SHOW CONSTRAINTS YIELD name WHERE name STARTS WITH 'notebooklm_' RETURN count(*) AS cnt",
    )
    cnt_before = rows_before[0]["cnt"]

    import pathlib
    import sys

    project_root = pathlib.Path(__file__).parents[3]
    result = subprocess.run(
        [sys.executable, str(project_root / "scripts" / "init-neo4j.py")],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 0, (
        f"init-neo4j.py failed on second run:\n{result.stderr}"
    )

    rows_after = _query(
        driver,
        "SHOW CONSTRAINTS YIELD name WHERE name STARTS WITH 'notebooklm_' RETURN count(*) AS cnt",
    )
    cnt_after = rows_after[0]["cnt"]
    driver.close()

    assert cnt_after == cnt_before, (
        f"Constraint count changed after second init: {cnt_before} → {cnt_after}"
    )
