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
    "damon1974": Source(
        key="damon1974",
        citation=("Damon, E. G., Richmond, D. R., Fletcher, E. R. & Jones, R. K. (1974). The Tolerance of Birds to "
                  "Airblast. Lovelace Foundation, DNA 3314F (DTIC AD0785259)."),
        url="https://archive.org/details/DTIC_AD0785259",
        notes=("Criteria for birds in the open at sea level, incident overpressure (pp. 30-31): 5 psi no injuries, "
               "10 psi slight to extensive injuries, 20 psi about 50% mortality. Birds of 0.1-4.2 kg."),
    ),
    "donaldson1953": Source(
        key="donaldson1953",
        citation=("Donaldson, L. R. et al. (1953). Radiobiological Studies at Eniwetok Before and After Mike Shot, "
                  "WT-616 (birds burned near the 10.4 Mt Mike shot; no exposures given)."),
    ),
    "snay1957": Source(
        key="snay1957",
        citation=("Snay, H. G. et al. (1957). Predictions of Underwater Explosion Phenomena, Operation WIGWAM "
                  "(DTIC AD0338338)."),
        notes="Sec. 3.5: measured WIGWAM bubble periods 2.87, 2.6, 1.9 s; calculated rise 675 ft and 793 ft per cycle.",
    ),
    "tm23_200": Source(
        key="tm23_200",
        citation=(
            "Armed Forces Special Weapons Project (1957, Change 1 1960). Capabilities of Atomic Weapons, "
            "TM 23-200 / OPNAV 03400.1B. Declassified."
        ),
        url="https://archive.org/details/DnaEm1CapabilitiesOfNuclearWeapons",
        notes=("Table 8-1 (surface-ship peak air overpressure damage criteria, p. 8-2); Figs. 8-1 to 8-3 "
               "(ship damage ranges vs depth of burst, 1 kt, cube-root scaling, p. 8-5 to 8-8; values read "
               "off the graphs by hand, about +/-10%); Table 6-5 (dose transmission factors inside ships, p. 6-11)."),
    ),
    "dna_em1_1978": Source(
        key="dna_em1_1978",
        citation="Defense Nuclear Agency (1978). Capabilities of Nuclear Weapons, DNA-EM-1, Ch. 3 Thermal Radiation Phenomena.",
        url="https://apps.dtic.mil/sti/citations/ADA955387",
        notes=("Transmittance for bursts below ~1/4 mile: T = exp(-2.9 R/V) (1 + 1.9 R/V), R slant range, "
               "V visual range; Table 3-1 probable visual ranges and cloud-layer modifying factors (p. 3-29)."),
    ),
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
            "Sec. 2.6, Eqs. 2.114-2.115 (p.41); Table 2.11 thermal Eqs. 2.106-2.113 (p.36); both "
            "checked against page images. p.43 surface-burst rule. Based on the 1962 edition of Glasstone."
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
    "redwing1956": Source(
        key="redwing1956",
        citation=(
            "Operation Redwing (1956): Military Effects Summary Report (ADA995132), and Triffet, T. "
            "& LaRiviere, P. D., Characterization of Fallout, WT-1317 (1961)."
        ),
        url="https://archive.org/details/DnaEm1CapabilitiesOfNuclearWeapons",
        notes=(
            "Sec. 3.4: dose rate 3 ft above contaminated sea x ~1,000 = land-equivalent, assuming "
            "60 m mixing depth; activity sank from 10-20 m to the thermocline at 3-4 m/h and stayed "
            "roughly uniform above it for >= 2 days. Read via OCR text."
        ),
    ),
    "mobley_fresnel": Source(
        key="mobley_fresnel",
        citation="Mobley, C. D. Ocean Optics Web Book: Fresnel Equations (Eqs. 5-6).",
        url="https://www.oceanopticsbook.info/view/surfaces/level-surfaces/fresnel-equations",
    ),
    "segelstein1981": Source(
        key="segelstein1981",
        citation="Segelstein, D. J. (1981). The complex refractive index of water. M.S. thesis, Univ. Missouri-Kansas City.",
        url="https://omlc.org/spectra/water/data/segelstein81.txt",
    ),
    "popefry1997": Source(
        key="popefry1997",
        citation="Pope, R. M. & Fry, E. S. (1997). Absorption spectrum (380-700 nm) of pure water. II. Appl. Opt. 36, 8710-8723.",
        url="https://omlc.org/spectra/water/data/pope97.txt",
    ),
    "sharqawy2010": Source(
        key="sharqawy2010",
        citation=(
            "Sharqawy, M. H., Lienhard, J. H. & Zubair, S. M. (2010). Thermophysical properties of "
            "seawater: a review of existing correlations and data. Desalination and Water Treatment 16, 354-380."
        ),
        url="http://web.mit.edu/lienhard/www/papers/journal/Thermophysical_properties_of_seawater-DWT-16-354-2010.pdf",
        notes="Eq. 9 specific heat (3999 J/kg/K at 20 C, S=35 g/kg); Eq. 54 latent heat of vaporization.",
    ),
    "navy_phase4": Source(
        key="navy_phase4",
        citation=(
            "U.S. Department of the Navy criteria for explosives (Phase 4), as published in "
            "NMFS proposed rule, 90 FR 32118 (16 July 2025), Tables 19-20; earlier Phase III "
            "(DoN 2017) 50% values via BSEE OCS PEIS Appendix D (2023) Table D-5."
        ),
        url="https://www.govinfo.gov/content/pkg/FR-2025-07-16/html/2025-13258.htm",
        notes="Modified Goertner lung-injury impulse equations; 237/243 dB GI tract; hearing TTS/PTS peaks.",
    ),
    "jasco_uxo": Source(
        key="jasco_uxo",
        citation="JASCO Applied Sciences, Sunrise Wind UXO acoustic modelling report v4.4, Sec. 6.2 (NOAA-hosted, 2022).",
        url="https://media.fisheries.noaa.gov/2022-06/SunriseWind_2022App_UXOAcousticModeling_OPR1_508.pdf",
        notes="Impulse window: surface-reflection arrival or 20% of lung oscillation period; worked thresholds Table 7.",
    ),
    "csa2004": Source(
        key="csa2004",
        citation="Continental Shelf Associates (2004). Explosive removal of offshore structures. MMS OCS Study 2003-070, Sec. 4.3.5.",
        url="https://espis.boem.gov/final%20reports/3042.pdf",
        notes="Goertner lung model: lung volume 3% of mass (litres per kg x 0.03), V(z) = V0 * 10/(z+10).",
    ),
    "minnaert1933": Source(
        key="minnaert1933",
        citation="Minnaert, M. (1933). On musical air-bubbles and the sounds of running water. Phil. Mag. 16, 235-248.",
        notes="Resonance frequency of a gas bubble: f = (1/(2 pi a)) sqrt(3 gamma P / rho).",
    ),
    "popper2014": Source(
        key="popper2014",
        citation=(
            "Popper, A. N. et al. (2014). Sound Exposure Guidelines for Fishes and Sea Turtles. "
            "ASA S3/SC1.4 TR-2014, Springer. Table 7.2 (explosions)."
        ),
        url="https://tethys.pnnl.gov/sites/default/files/publications/Popper_et_al_Sound_Exposure_Guidelines_for_Fishes_and_Sea_Turtles.pdf",
    ),
    "nmfs2023": Source(
        key="nmfs2023",
        citation="NMFS (2023). Summary of Endangered Species Act Acoustic Thresholds (FHWG 2008 fish criteria).",
        url="https://www.fisheries.noaa.gov/s3/2023-02/ESA%20all%20species%20threshold%20summary_508_OPR1.pdf",
    ),
    "yelverton1975": Source(
        key="yelverton1975",
        citation=(
            "Yelverton, J. T. et al. (1975). The relationship between fish size and their response to "
            "underwater blast. Lovelace Foundation, DNA 3677T. (Abstract only: LD50 1.7 psi-ms for 0.02 g "
            "guppy fry to 49.5 psi-ms for 744 g carp.)"
        ),
        url="https://usrd.iogp.org/resource/the-relationships-between-fish-size-and-their-response-to-underwater-blast/",
    ),
    "usn_diving_manual": Source(
        key="usn_diving_manual",
        citation="U.S. Navy Diving Manual, Revision 7 (2016), Sec. 2-7.3.6 to 2-7.3.8 and 3-12.6.",
        url="https://researchcompliance.asu.edu/wp-content/uploads/sites/50/2024/06/US-DIVING-MANUAL_REV7.pdf",
    ),
    "lance2015": Source(
        key="lance2015",
        citation=(
            "Lance, R. M., Capehart, B., Kadro, O. & Bass, C. R. (2015). Human injury criteria for "
            "underwater blasts. PLoS ONE 10(11): e0143485."
        ),
        url="https://pmc.ncbi.nlm.nih.gov/articles/PMC4659630/",
        notes=(
            "Weibull F(I) = 1 - exp(-(I/eta)^beta) (Eq. 2, verbatim). Table 3 parameters read from a "
            "summary of the page only; they reproduce the verbatim abstract value (50% fatality at 302 kPa-ms)."
        ),
    ),
    "yelverton_richmond1981": Source(
        key="yelverton_richmond1981",
        citation="Yelverton, J. T. & Richmond, D. R. (1981). Underwater explosion damage risk criteria for fish, birds, and mammals. J. Acoust. Soc. Am. 70, S84 (abstract).",
        notes="Safe impulse for swimmers: 14 kPa-ms.",
    ),
    "pnnl2003": Source(
        key="pnnl2003",
        citation="Strom, D. J. (2003). Health Impacts from Acute Radiation Exposure. PNNL-14424.",
        url="https://www.pnnl.gov/publications/health-impacts-acute-radiation-exposure",
        notes="LD50/60 about 4.5 Gy free in air with minimal medical care.",
    ),
    "cdc_ars": Source(
        key="cdc_ars",
        citation="CDC. Acute Radiation Syndrome: Information for Clinicians, Table 1.",
        url="https://www.cdc.gov/radiation-emergencies/hcp/clinical-guidance/ars.html",
        notes="LD50/60 about 2.5-5 Gy; LD100 about 10 Gy.",
    ),
    "icrp108_draft": Source(
        key="icrp108_draft",
        citation="ICRP (2007). Environmental Protection: the Concept and Use of Reference Animals and Plants (draft, Dec 2007), paras 173-181.",
        url="https://icrp.org/docs/RAP_Report(C1to8)draft_Dec2007a.pdf",
        notes="Juvenile marine fish LD50/30 10.5-55.5 Gy; plaice embryo LD50 0.9 Gy.",
    ),
    "jeff311": Source(
        key="jeff311",
        citation=(
            "JEFF-3.1.1 cumulative fission yields and ENSDF half-lives, via IAEA Nuclear Data Services "
            "LiveChart API (retrieved 2026-11-25)."
        ),
        url="https://nds.iaea.org/relnsd/vcharthtml/api_v0_guide.html",
        notes="Fast-fission cumulative yields for U-235, Pu-239 and U-238.",
    ),
    "trs422": Source(
        key="trs422",
        citation=(
            "IAEA (2004). Sediment Distribution Coefficients and Concentration Factors for Biota in the "
            "Marine Environment. Technical Reports Series No. 422. Table III (fish)."
        ),
        url="https://projects.itrcweb.org/contseds-bioavailability/References/TRS422_web.pdf",
        notes="Recommended CF (Bq/kg wet fish per Bq/L seawater); uncertain by up to 10x either way (sec. 3.3).",
    ),
    "icrp136_draft": Source(
        key="icrp136_draft",
        citation=(
            "ICRP Task Group 74 (2016). Dose coefficients for non-human biota environmentally exposed to "
            "radiation. Draft for public consultation (became ICRP Publication 136), Annex B tables."
        ),
        url="https://icrp.org/docs/TG74DraftForPublicConsultation(4July2016).pdf",
        notes=(
            "Reference Flatfish internal (uGy/h per Bq/kg) and external (uGy/h per Bq/L) DCs. "
            "Consultation draft marked 'do not reference'; final ICRP 136 values should be checked."
        ),
    ),
    "fish_benchmarks": Source(
        key="fish_benchmarks",
        citation=(
            "Dose-rate benchmarks for fish: ICRP Publication 108 Derived Consideration Reference Level "
            "(1-10 mGy/d); ERICA screening value 10 uGy/h; UNSCEAR 1996 (400 uGy/h, no population effects); "
            "UNSCEAR 2008 Annex E (100-1000 uGy/h, reduced fertility in fish). As summarised in ENSI "
            "expert report ENSI33/606 (2018), Tables 2-3."
        ),
        url="https://ensi.admin.ch/en/wp-content/uploads/sites/5/2019/07/Expertenbericht_ENSI33_606.pdf",
    ),
    "em1_dtra2004": Source(
        key="em1_dtra2004",
        citation=(
            "Eneva, M., Stevens, J. L. & Murphy, J. R. (2004). Analysis of Russian Hydroacoustic Data. "
            "DTRA-TR-01-19, pp. 4-5, reproducing the coupling relationships of the DNA/DTRA Handbook of "
            "Nuclear Weapon Effects (EM-1, 1996), Ch. 5."
        ),
        url="https://archive.org/download/DTIC_ADA429219/DTIC_ADA429219.pdf",
        notes=(
            "P_max = A eps / R^n; A = 1e4 (217.6)^n; n = 1.4 exp(-D/35.4) + 1.13. eps_L fully given; "
            "eps_H only for 0 <= x <= 0.82 (functions F, G not printed). Checked against the page image."
        ),
    ),
    "eneva2000": Source(
        key="eneva2000",
        citation=(
            "Eneva, M., Stevens, J., Murphy, J. & Khristoforov, B. (2000). Effect of charge depth in Russian "
            "hydroacoustic data from nuclear and HE explosions. 22nd Seismic Research Review."
        ),
        url="https://www.ldeo.columbia.edu/res/pi/Monitoring/Doc/Srr_2000/5-Hydroacoustic/05_03.pdf",
        notes="16 kt burst 1.1 m above water (27 Oct 1961): eps = 0.0412, ~130 dB at 35 km consistent with ~4%.",
    ),
    "lemehaute1996": Source(
        key="lemehaute1996",
        citation=(
            "Le Mehaute, B. & Wang, S. (1996). Water Waves Generated by Underwater Explosion. "
            "DNA-TR-94-128 (also World Scientific, Adv. Ser. Ocean Eng. vol. 10)."
        ),
        url="https://archive.org/download/DnaEm1CapabilitiesOfNuclearWeapons/ADA304244%20Water%20waves.pdf",
        notes=(
            "Eqs. 3.1a/b (upper/lower critical depth), 3.2a/b crater, 1.14 arrival, 1.25 breaking (0.78), "
            "Table 1-3 (deep-water maximum waves; 'AVG' column equals Glasstone Eq. 6.119.1)."
        ),
    ),
}


def cite(key: str) -> str:
    """Return the full citation string for a source key."""
    return SOURCES[key].citation
