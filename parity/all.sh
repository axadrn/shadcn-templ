#!/bin/sh
# Runs compare.mjs over every example in examples.txt, 40 per process (one
# long process loses its browser), for each engine in ENGINES. Writes
# all-<engine>.log, all-<engine>-fails.log and all-summary.log, which ends
# with "done".
cd "$(dirname "$0")" || exit 1
ENGINES=${ENGINES:-"chromium webkit"}
: > all-summary.log
for e in $ENGINES; do
  : > "all-$e.log"
  xargs -n 40 node compare.mjs "$e" --quiet --jobs=3 < examples.txt >> "all-$e.log" 2>&1
  grep -h "^FAIL" "all-$e.log" > "all-$e-fails.log"
  echo "$e: $(grep -c . "all-$e-fails.log") fails; $(grep -h ' pass, ' "all-$e.log" | awk '{p+=$2; f+=$4} END {print p" pass, "f" fail"}')" >> all-summary.log
done
echo done >> all-summary.log
