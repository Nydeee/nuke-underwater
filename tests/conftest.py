"""Shared test setup.

The web server has a per-visitor rate limit (src/nukesim/web/protect.py). All tests share one test
client address, so give the shared app a very large allowance here; tests/test_web_limits.py checks
the limiter itself with its own small settings.
"""

import os

os.environ.setdefault("NUKESIM_RATE_PER_MIN", "1000000")
os.environ.setdefault("NUKESIM_RATE_BURST", "1000000")
