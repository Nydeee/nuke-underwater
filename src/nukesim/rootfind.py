"""A small root finder, so the physics needs only numpy (and can run in a web browser without SciPy).

brent(f, a, b) finds x in [a, b] with f(x) = 0, given that f(a) and f(b) have opposite signs. It is
Brent's method (inverse quadratic interpolation and the secant method, falling back to bisection),
the same method and the same default tolerances as scipy.optimize.brentq (xtol 2e-12, rtol 4 eps).
"""
from __future__ import annotations

import sys

_EPS = sys.float_info.epsilon


def brent(f, a: float, b: float, xtol: float = 2e-12, rtol: float = 4 * _EPS, maxiter: int = 100) -> float:
    fa, fb = f(a), f(b)
    if fa == 0:
        return a
    if fb == 0:
        return b
    if (fa > 0) == (fb > 0):
        raise ValueError("f(a) and f(b) must have opposite signs")
    c, fc = a, fa          # c: the previous best guess's partner, with f(c) of the other sign from f(b)
    d = e = b - a
    for _ in range(maxiter):
        if (fb > 0) == (fc > 0):
            c, fc = a, fa
            d = e = b - a
        if abs(fc) < abs(fb):                                   # keep b the better guess
            a, b, c = b, c, b
            fa, fb, fc = fb, fc, fb
        tol = 2 * _EPS * abs(b) + 0.5 * xtol + 0.5 * rtol * abs(b)
        m = 0.5 * (c - b)
        if abs(m) <= tol or fb == 0:
            return b
        if abs(e) >= tol and abs(fa) > abs(fb):
            s = fb / fa
            if a == c:                                          # secant
                p, q = 2 * m * s, 1 - s
            else:                                               # inverse quadratic interpolation
                q, r = fa / fc, fb / fc
                p = s * (2 * m * q * (q - r) - (b - a) * (r - 1))
                q = (q - 1) * (r - 1) * (s - 1)
            if p > 0:
                q = -q
            else:
                p = -p
            if 2 * p < min(3 * m * q - abs(tol * q), abs(e * q)):
                e, d = d, p / q                                 # accept the interpolation
            else:
                d = e = m                                       # bisect
        else:
            d = e = m
        a, fa = b, fb
        b += d if abs(d) > tol else (tol if m > 0 else -tol)
        fb = f(b)
    raise RuntimeError("brent: did not converge")
