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
    "brode1987": Source(
        key="brode1987",
        citation=(
            "Brode, H. L. (1987). Airblast from Nuclear Bursts - Analytic Approximations. "
            "Pacific-Sierra Research Corp., PSR Report 1419-3."
        ),
        url="https://archive.org/download/airblastfromnucl00brod/airblastfromnucl00brod.pdf",
        notes=(
            "Eqs. 33 (p.26), 39-40 (p.31), 43 and 45 (p.36), 48 (p.38), 62 (pp.70-71). "
            "All coefficients checked against the page scans."
        ),
    ),
    "friedlander1946": Source(
        key="friedlander1946",
        citation=(
            "Friedlander, F. G. (1946). The diffraction of sound pulses. I. Diffraction by a "
            "semi-infinite plane. Proc. R. Soc. Lond. A 186, 322-344."
        ),
        notes="Origin of the standard blast-wave shape p(t) = P (1 - t/D) exp(-b t/D).",
    ),
    "sparrow1995": Source(
        key="sparrow1995",
        citation=(
            "Sparrow, V. W. (1995). The effect of aircraft speed on the penetration of sonic "
            "boom noise into a flat ocean. NASA N95-14887, pp. 137-150."
        ),
        url="https://ntrs.nasa.gov/api/citations/19950008473/downloads/19950008473.pdf",
        notes=(
            "p.141: air/water impedances, 13.2 deg critical angle, pressure continuity. "
            "p.144-146: Sawyers (1968) closed-form N-wave solution; p.143: decay examples."
        ),
    ),
    "sawyers1968": Source(
        key="sawyers1968",
        citation="Sawyers, K. N. (1968). Underwater sound pressure from sonic booms. J. Acoust. Soc. Am. 44, 523-524.",
        notes="Read via sparrow1995; original not consulted.",
    ),
    "sohn2000": Source(
        key="sohn2000",
        citation=(
            "Sohn, R. A., Vernon, F., Hildebrand, J. A. & Webb, S. C. (2000). Field measurements "
            "of sonic boom penetration into the ocean. J. Acoust. Soc. Am. 107(6), 3073-3083."
        ),
        url="https://www.cetus.ucsd.edu/docs/publications/SohnJASA2000.pdf",
        notes="Measured booms decay to ambient by 40-50 m depth; flat-interface theory agrees.",
    ),
    "fletcher1962": Source(
        key="fletcher1962",
        citation=(
            "Fletcher, E. R., Albright, R. W., Perret, R. F. D., Franklin, M. E., Bowen, I. G. & "
            "White, C. S. (1962/63). Nuclear Bomb Effects Computer (Including Slide-rule Design and "
            "Curve Fits for Weapons Effects). USAEC CEX-62.2, Lovelace Foundation."
        ),
        url=(
            "https://www.deepspace.ucsb.edu/wp-content/uploads/2025/10/"
            "NUCLEAR-BOMB-EFFECTS-COMPUTER-incl-slide-rule-and-functional-fits-Fletcher-et-al-1963.pdf"
        ),
        notes=(
            "Sec. 2.6, Eqs. 2.114-2.115 (p.41, checked against page image); p.43 surface-burst "
            "rule. Based on the 1962 edition of Glasstone."
        ),
    ),
    "removal_xs_water": Source(
        key="removal_xs_water",
        citation=(
            "Fast-neutron removal cross section of water, Sigma_R = 0.103 1/cm (fission spectrum; "
            "ORNL removal method, NBS Handbook 63). Seen in two secondary sources (McMaster J. Eng. "
            "Phys. article; EPJ Web Conf. TESNAT 2017 paper 01022) via search snippets only."
        ),
        notes="NOT read in an original source. The weakest-sourced number in Section 3.",
    ),
}


def cite(key: str) -> str:
    """Return the full citation string for a source key."""
    return SOURCES[key].citation
