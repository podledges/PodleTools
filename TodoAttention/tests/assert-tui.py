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

orange = ansi("255;152;0", "●")
gray = ansi("176;176;176", "●")
green = ansi("0;230;118", "●" if static else "⠋")
for task_id, color in [(b"#1", gray), (b"#2", green), (b"#3", orange), (b"#4", gray)]:
    assert task_id + b"\x1b[39m " + color in raw, f"missing indicator beside {task_id!r}"
assert ansi("255;0;204", "● Todos (1/5)") in raw, "exact heading text and glyph must remain unchanged"
for color, label in [("0;230;118", "working"), ("176;176;176", "waiting"), ("255;152;0", "needs you")]:
    assert ansi(color, "●") + b" " + label.encode() in raw, f"missing labeled legend entry {label}"
assert ansi("204;255;0", "✓") + b" " + ansi("71;58;114", "#5") in raw, "completion must use exact connected lime ANSI"
text = re.sub(rb"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))", b"", raw).decode()
for reason in ["(awaiting CI)", "└─ needs you: approve deployment", "(blocked by dependency #1)"]:
    assert reason in text, f"missing concrete reason {reason}"
captain_row = next(line for line in text.splitlines() if "Captain decision" in line)
assert "needs you:" not in captain_row, "captain decision must not render inline"
assert "#5 ● Completed" not in text
assert "Deleted stays deleted" not in text
if static:
    assert cadence["animationTimers"] == 0 and not cadence["ticks"], cadence
    assert not any(frame in text for frame in "⠋⠙⠹⠸⠼⠴")
    print("isolated Pi TUI static fallback: 0 animation timers/redraws; ANSI contract ok")
else:
    for frame in "⠋⠙⠹⠸⠼⠴":
        assert ansi("0;230;118", frame) in raw, f"missing real spinner frame {frame}"
    assert cadence["animationTimers"] == 1, cadence
    ticks = cadence["ticks"]
    assert 6 <= len(ticks) <= 15, cadence
    gaps = [b - a for a, b in zip(ticks, ticks[1:])]
    assert min(gaps) >= 125, gaps
    assert statistics.median(gaps) < 250, gaps
    print(f"isolated Pi TUI: {len(ticks)} ticks, median {statistics.median(gaps):.2f} ms "
          f"({1000 / statistics.mean(gaps):.3f} Hz), range {min(gaps):.2f}–{max(gaps):.2f} ms; "
          "1 animation timer; ANSI contract ok")
