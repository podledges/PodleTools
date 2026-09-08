#!/usr/bin/env python3
import json
import re
import statistics
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_bytes()
cadence = json.loads(Path(sys.argv[2]).read_text())
static = len(sys.argv) > 3 and sys.argv[3] == "static"

def ansi(rgb, text):
    return f"\x1b[38;2;{rgb}m{text}\x1b[39m".encode()

pink = ansi("255;0;204", "●")
yellow = ansi("255;255;0", "●")
blue = ansi("0;102;255", "●" if static else "⠋")
for task_id, color in [(b"#1", yellow), (b"#2", blue), (b"#3", pink), (b"#4", yellow)]:
    assert task_id + b"\x1b[39m " + color in raw, f"missing indicator beside {task_id!r}"
assert pink + b" " + ansi("255;0;204", "Todos (1/5)") in raw, "input dot must match actual title ANSI"
assert ansi("204;255;0", "✓") + b" " + ansi("71;58;114", "#5") in raw, "completion must use exact connected lime ANSI"
text = re.sub(rb"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))", b"", raw).decode()
for reason in ["(awaiting CI)", "(approve deployment)", "(blocked by dependency #1)"]:
    assert reason in text, f"missing concrete reason {reason}"
assert "#5 ● Completed" not in text
assert "Deleted stays deleted" not in text
if static:
    assert cadence["animationTimers"] == 0 and not cadence["ticks"], cadence
    assert not any(frame in text for frame in "⠋⠙⠹⠸⠼⠴")
    print("isolated Pi TUI static fallback: 0 animation timers/redraws; ANSI contract ok")
else:
    for frame in "⠋⠙⠹⠸⠼⠴":
        assert ansi("0;102;255", frame) in raw, f"missing real spinner frame {frame}"
    assert cadence["animationTimers"] == 1, cadence
    ticks = cadence["ticks"]
    assert 6 <= len(ticks) <= 15, cadence
    gaps = [b - a for a, b in zip(ticks, ticks[1:])]
    assert min(gaps) >= 125, gaps
    assert statistics.median(gaps) < 250, gaps
    print(f"isolated Pi TUI: {len(ticks)} ticks, median {statistics.median(gaps):.2f} ms "
          f"({1000 / statistics.mean(gaps):.3f} Hz), range {min(gaps):.2f}–{max(gaps):.2f} ms; "
          "1 animation timer; ANSI contract ok")
