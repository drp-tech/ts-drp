#!/bin/bash

# This script benchmarks memory footprint of a TypeScript program
# Returns: List of memory usage results (in KB) separated by newlines

if [ ! $# -eq 3 ]; then
    echo "Usage: $0 <number of tests> <program name> <size>" >&2
    exit 1
fi

SCRIPT_DIR="$(dirname "$(realpath "$0")")"
cd $SCRIPT_DIR

NUM_TESTS=$1
PROGRAM_NAME=$2
SIZE=$3

# Check if the program exists
if [ ! -f "$PROGRAM_NAME" ]; then
    echo "Error: Program $PROGRAM_NAME does not exist" >&2
    exit 1
fi

# Run the program with the size parameter NUM_TESTS times and output memory usage
for ((i = 0; i < $NUM_TESTS; i++)); do

    # Run the actual program with size parameter
    command time -f "%M" tsx $PROGRAM_NAME $SIZE >/dev/null 2>program_log
    read PROGRAM_MEM <program_log

    echo $PROGRAM_MEM
done

# Clean up temporary files
rm -f program_log
