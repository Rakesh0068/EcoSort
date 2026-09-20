# EcoSort Robot Integration

Current system: **software + simulation**. Physical robot integration is a
future phase. Every API response from the robot layer carries the truth about
this (`simulation: true`, `hardware_connected: false`).

## Architecture (as built)

Camera (browser or held-out test image) → Classification (run-002
EfficientNet-B0 — a whole-image **classifier**, not a detector) →
Confidence gate → Sorting policy (SORT / HOLD_FOR_REVIEW, class → bin map) →
Robot command (logged) → Virtual bin.

Positions are Grad-CAM activation centroids — a real but coarse spatial
signal, never presented as detector bounding boxes. Multi-object detection is
explicitly **planned**, not claimed.

## Confidence safety (enforced in `RobotController.decide`)

- High (≥ threshold + margin): automatic simulated sorting.
- Moderate: held with "please verify" guidance; simulation holds unless gated.
- Low: `HOLD_FOR_REVIEW` — the arm never actuates below the threshold.

## Simulation

- `POST /api/robot/simulate/step` — real held-out test image → real model →
  real decision → animated motion phases. Persisted as a scan (`source:
  simulation`).
- `POST /api/robot/predict` — perception only, no motion path.
- `POST /api/robot/sort` — upload → gated decision + logged command
  (`actuated: false`).

## Safety & control

`POST /api/robot/stop` (e-stop), `POST /api/robot/emergency-stop`,
`POST /api/robot/reset`, `POST /api/robot/pause`, `PUT /api/robot/bin-map`,
`PUT /api/robot/config` (thresholds). All state changes are logged to
`GET /api/robot/events`.

## Hardware abstraction (`api/robot.py`)

`RobotAdapter` interface: `connect / disconnect / get_status / send_command /
stop / get_telemetry`. Only `SimulationRobotAdapter` exists. Future
`ROS2RobotAdapter`, `ArduinoRobotAdapter`, `RaspberryPiRobotAdapter` would
implement the same interface against real drivers — none exist yet.
