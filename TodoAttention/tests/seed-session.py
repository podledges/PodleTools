#!/usr/bin/env python3
"""Create synthetic branch data; never read or replay a live session."""
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
tasks = [
    {"id": 1, "subject": "Yellow waiting", "status": "pending", "metadata": {"attention": "waiting", "attentionReason": "awaiting CI"}},
    {"id": 2, "subject": "Verified active", "status": "in_progress", "activeForm": "running isolated smoke", "metadata": {"attention": "agent-working"}},
    {"id": 3, "subject": "Captain decision", "status": "pending", "metadata": {"attention": "captain-input", "attentionReason": "approve deployment"}},
    {"id": 4, "subject": "Blocked is yellow", "status": "in_progress", "blockedBy": [1], "metadata": {"attention": "agent-working"}},
    {"id": 5, "subject": "Completed keeps completion style", "status": "completed"},
    {"id": 6, "subject": "Deleted stays deleted", "status": "deleted"},
]
entries = [
    {"type": "session", "version": 3, "id": "todoattention-isolated", "timestamp": "2026-01-01T00:00:00.000Z", "cwd": str(path.parent)},
    {"type": "message", "id": "fixture1", "parentId": None, "timestamp": "2026-01-01T00:00:01.000Z", "message": {
        "role": "toolResult", "toolCallId": "synthetic-todo", "toolName": "todo", "content": [{"type": "text", "text": "Synthetic test snapshot"}],
        "isError": False, "timestamp": 1767225601000, "details": {"action": "list", "params": {}, "tasks": tasks, "nextId": 7},
    }},
]
path.write_text("".join(json.dumps(entry) + "\n" for entry in entries))
