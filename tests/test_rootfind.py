"""Our own root finder (nukesim.rootfind) must give the same roots as SciPy's brentq."""
import math

import pytest

from nukesim.effects.air_blast import friedlander_impulse_ratio
from nukesim.rootfind import brent


@pytest.mark.parametrize("f,a,b,root", [
    (lambda x: x**3 - 2, 0.0, 3.0, 2 ** (1 / 3)),
    (math.cos, 0.0, 3.0, math.pi / 2),
    (lambda x: math.exp(x) - 10, -5.0, 5.0, math.log(10)),
    (lambda x: x - 1e-6, 0.0, 1.0, 1e-6),
])
def test_known_roots(f, a, b, root):
    assert brent(f, a, b) == pytest.approx(root, abs=1e-11)


def test_same_as_scipy_on_the_blast_wave_shape():
    scipy_optimize = pytest.importorskip("scipy.optimize")
    lo, hi = friedlander_impulse_ratio(500.0), friedlander_impulse_ratio(1e-9)
    for i in range(1, 200):
        ratio = lo + (hi - lo) * i / 200
        f = lambda b: friedlander_impulse_ratio(b) - ratio
        assert brent(f, 1e-9, 500.0) == pytest.approx(scipy_optimize.brentq(f, 1e-9, 500.0), abs=1e-11)


def test_needs_a_sign_change():
    with pytest.raises(ValueError):
        brent(lambda x: x * x + 1, -1.0, 1.0)
