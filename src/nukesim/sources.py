"""Registry of published sources.

Every coefficient in the physics modules must point at one of these entries
(via its key), together with the section/equation it comes from. This keeps
the simulator auditable: you can always ask "where did this number come from?"
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Source:
    key: str
    citation: str
    url: str = ""
    notes: str = ""


SOURCES: dict[str, Source] = {
    "glasstone1977": Source(
        key="glasstone1977",
        citation=(
            "Glasstone, S. & Dolan, P. J. (1977). The Effects of Nuclear Weapons, "
            "3rd ed. U.S. Department of Defense / Energy Research and Development "
            "Administration."
        ),
        url="https://atomicarchive.com/resources/documents/effects/glasstone-dolan/chapter6.html",
        notes="Ch. II secs 2.63-2.89 (underwater bursts), Ch. VI secs 6.41-6.125.",
    ),
    "cole1948": Source(
        key="cole1948",
        citation="Cole, R. H. (1948). Underwater Explosions. Princeton University Press.",
        notes="Original source of the TNT similitude equations (via usace1991).",
    ),
    "usace1991": Source(
        key="usace1991",
        citation=(
            "U.S. Army Corps of Engineers (1991). Underwater Blast Monitoring. "
            "Engineer Technical Letter ETL 1110-8-11(FR), 15 July 1991."
        ),
        notes="Eqs. (1)-(4), pp. 2-4: TNT similitude equations quoted from Cole (1948).",
    ),
}


def cite(key: str) -> str:
    """Return the full citation string for a source key."""
    return SOURCES[key].citation
