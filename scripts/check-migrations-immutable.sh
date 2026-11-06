#!/usr/bin/env bash
# Fails when a change modifies, renames or deletes a migration that already exists on the base branch.
#
# A migration file runs once per project. Editing one after it has been pushed changes the repository but never reaches a
# database that already ran it, which is how `create_journal` ended up in the code but not in the hosted project
# ("Could not find the function ... in the schema cache"). Fix forward instead: add a NEW migration file.
#
# usage: scripts/check-migrations-immutable.sh <base-ref> [head-ref]
set -euo pipefail
base="${1:?usage: check-migrations-immutable.sh <base-ref> [head-ref]}"
head="${2:-HEAD}"
changed="$(git diff --name-status --find-renames "$base"..."$head" -- supabase/migrations | grep -vE '^A[[:space:]]' || true)"
if [ -n "$changed" ]; then
  echo "These migrations already exist on $base and must not be edited, renamed or deleted:" >&2
  echo "$changed" >&2
  echo >&2
  echo "Add a new migration file (a later timestamp) that makes the change instead." >&2
  exit 1
fi
echo "OK: no existing migration was changed."
