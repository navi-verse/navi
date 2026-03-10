#!/bin/bash

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only format TypeScript files in src/
if [[ "$FILE" == *.ts && "$FILE" == *src/* ]]; then
  npx biome check --write "$FILE" >&2
fi

exit 0
