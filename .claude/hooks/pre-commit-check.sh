#!/bin/bash

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only run checks if Claude is trying to commit
if [[ "$COMMAND" =~ ^git.*commit ]]; then
  echo "Running npm run ci before commit..." >&2

  if npm run ci; then
    echo "Type check and lint passed." >&2
    exit 0
  else
    echo "Type check or lint failed. Commit blocked." >&2
    exit 2
  fi
fi

exit 0
