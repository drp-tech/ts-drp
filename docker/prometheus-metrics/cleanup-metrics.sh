#!/bin/bash

while true; do
    echo "Cleaning up metrics"
    current_time=$(date +%s)

    # Get all metrics from Pushgateway
    metrics=$(curl -s http://pushgateway:9091/metrics)

    echo "$metrics" | grep -v '^#' | grep -v '^$' | while read -r line; do
        metric_name=$(echo "$line" | cut -d' ' -f1)
        timestamp=$(echo "$line" | grep -o 'push_time_seconds{[^}]*}' | cut -d' ' -f2)

        if [ -n "$timestamp" ]; then
            metric_time=$(printf "%.0f" "$timestamp")

            time_diff=$((current_time - metric_time))

            # 5 min = 60 * 5 = 300
            if [ $time_diff -gt 300 ]; then
                job=$(echo "$metric_name" | grep -o 'job="[^"]*"' | cut -d'"' -f2)
                echo "Deleting old metric for job: $job"
                curl -X DELETE "http://pushgateway:9091/metrics/job/$job"
            fi
        fi
    done

    sleep 60
done
