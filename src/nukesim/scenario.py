"""Scenario description: the burst, the water environment, and receivers.

Coordinate system (all in metres):
    x, y : horizontal position. The burst is at x = y = 0.
    z    : elevation relative to the mean water surface.
           z > 0 is above the water, z < 0 is underwater.
"""

from dataclasses import dataclass, field

from . import units


@dataclass(frozen=True)
class Burst:
    """A nuclear detonation.

    yield_kt : total explosive yield in kilotons of TNT equivalent.
    z_m      : elevation of the burst point (negative = underwater burst).
    """

    yield_kt: float
    z_m: float

    def __post_init__(self):
        if self.yield_kt <= 0:
            raise ValueError("yield_kt must be positive")

    @classmethod
    def from_megatons(cls, yield_mt: float, z_m: float) -> "Burst":
        return cls(yield_kt=units.mt_to_kt(yield_mt), z_m=z_m)

    @property
    def is_underwater(self) -> bool:
        return self.z_m < 0

    @property
    def depth_m(self) -> float:
        """Depth of burst below the surface (positive number), 0 if not underwater."""
        return max(0.0, -self.z_m)


@dataclass(frozen=True)
class Environment:
    """The body of water.

    water_depth_m : depth of the sea floor below the surface (positive).
                    Use float('inf') for "deep water" (bottom ignored).
    density_kg_m3 : water density. ~1025 for seawater, ~1000 for fresh water.
    sound_speed_m_s : speed of sound in water (~1500 m/s in seawater).
    """

    water_depth_m: float = float("inf")
    density_kg_m3: float = 1025.0
    sound_speed_m_s: float = 1500.0
    surface_pressure_pa: float = units.ATM_TO_PA
    gravity_m_s2: float = 9.80665
    # weather and time of day (effects/conditions.py); the defaults match the clear-day burn fits
    visibility: str = "exceptionally_clear"   # see conditions.VISUAL_RANGE_MI
    overcast: bool = False                    # a cloud layer at about 1,500 m
    night: bool = False

    def hydrostatic_pressure_pa(self, depth_m: float) -> float:
        """Absolute ambient pressure at a given depth below the surface."""
        return self.surface_pressure_pa + self.density_kg_m3 * self.gravity_m_s2 * max(depth_m, 0.0)


@dataclass(frozen=True)
class Receiver:
    """Something placed in the scenario: a fish, a human, a ship hull, a gauge...

    kind : "fish", "mammal", "turtle", "diver", "person" (on deck/boat), or "gauge".
    """

    x_m: float
    y_m: float
    z_m: float
    kind: str = "gauge"
    label: str = ""
    # Body properties used by the biology models (Section 6). Ignored by the physics models.
    mass_kg: float | None = None         # body mass
    swim_bladder: bool = True            # fish: has a gas-filled swim bladder
    hearing_group: str | None = None     # marine mammals: "LF", "HF", "VHF", "PW", "OW"
    ship_type: str | None = None         # ships: "small_craft", "destroyer", "carrier"

    @property
    def depth_m(self) -> float:
        return max(0.0, -self.z_m)


@dataclass
class Scenario:
    burst: Burst
    environment: Environment = field(default_factory=Environment)
    receivers: list[Receiver] = field(default_factory=list)
