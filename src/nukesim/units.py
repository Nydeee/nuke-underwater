"""Unit conversions.

The simulator works internally in SI units (metres, seconds, pascals, joules,
kilograms). Published formulas often use US customary units (feet, pounds,
psi), so convert only at the boundary of each formula, using the exact
factors below.
"""

# --- Length -----------------------------------------------------------------
FT_TO_M = 0.3048            # exact (international foot, 1959)
M_TO_FT = 1.0 / FT_TO_M
IN_TO_M = 0.0254            # exact

# --- Mass -------------------------------------------------------------------
LB_TO_KG = 0.45359237       # exact (international avoirdupois pound, 1959)
KG_TO_LB = 1.0 / LB_TO_KG

# --- Pressure ---------------------------------------------------------------
# 1 psi = 1 lbf / in^2 = 0.45359237 kg * 9.80665 m/s^2 / (0.0254 m)^2
PSI_TO_PA = LB_TO_KG * 9.80665 / IN_TO_M**2   # = 6894.757... Pa
PA_TO_PSI = 1.0 / PSI_TO_PA
ATM_TO_PA = 101_325.0       # exact (standard atmosphere)

# --- Energy / explosive yield ----------------------------------------------
# By convention 1 kiloton of TNT is defined as 10^12 thermochemical calories
# (Glasstone & Dolan 1977, Ch. I), i.e. 4.184e12 J. That definition
# corresponds to 1e6 kg of TNT at 1000 cal/g.
KT_TO_J = 4.184e12
KT_TO_KG_TNT = 1.0e6
KT_TO_LB_TNT = KT_TO_KG_TNT * KG_TO_LB        # = 2.2046e6 lb
MT_TO_KT = 1000.0


def kt_to_lb_tnt(yield_kt: float) -> float:
    """Convert a yield in kilotons to an equivalent mass of TNT in pounds."""
    return yield_kt * KT_TO_LB_TNT


def mt_to_kt(yield_mt: float) -> float:
    """Convert megatons to kilotons."""
    return yield_mt * MT_TO_KT
