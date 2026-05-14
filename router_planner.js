const MAX_ROUTE_OPTIONS = 6;

// Utilities
function timeToSeconds(timeStr) {
    const parts = timeStr.split(':');
    return (+parts[0]) * 3600 + (+parts[1]) * 60 + (parts[2] ? (+parts[2]) : 0);
}

function secondsToTime(secs) {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

// Find Line and Direction for a given journey
function findRouteSegment(from, to) {
    for (let line of metroData.lines) {
        for (let dir of line.directions) {
            const fromIdx = dir.stations.indexOf(from);
            const toIdx = dir.stations.indexOf(to);
            if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
                return { line: line.line_name, dir: dir, fromIdx, toIdx };
            }
        }
    }
    return null;
}

// Get the next N trips for a specific segment starting after a given time
function getNextTrips(segment, startTimeSecs, count = MAX_ROUTE_OPTIONS) {
    const trips = [];
    const fromOffset = segment.dir.travel_time_offsets_seconds[segment.fromIdx];
    const toOffset = segment.dir.travel_time_offsets_seconds[segment.toIdx];

    for (let depStr of segment.dir.departures) {
        const trainStartSecs = timeToSeconds(depStr);
        const depAtStation = trainStartSecs + fromOffset;

        if (depAtStation >= startTimeSecs) {
            trips.push({
                departure: depAtStation,
                arrival: trainStartSecs + toOffset
            });
            if (trips.length >= count) break;
        }
    }
    return trips;
}

// Get the previous N trips for a specific segment arriving before a given time
function getPreviousTrips(segment, endTimeSecs, count = MAX_ROUTE_OPTIONS) {
    const trips = [];
    const fromOffset = segment.dir.travel_time_offsets_seconds[segment.fromIdx];
    const toOffset = segment.dir.travel_time_offsets_seconds[segment.toIdx];

    // Iterate backwards to get the latest possible trips that arrive before the target time
    for (let i = segment.dir.departures.length - 1; i >= 0; i--) {
        const depStr = segment.dir.departures[i];
        const trainStartSecs = timeToSeconds(depStr);
        const depAtStation = trainStartSecs + fromOffset;
        const arrAtStation = trainStartSecs + toOffset;

        if (arrAtStation <= endTimeSecs) {
            trips.push({
                departure: depAtStation,
                arrival: arrAtStation
            });
            if (trips.length >= count) break;
        }
    }
    return trips;
}

// Main Calculation
function calculateRoutes() {
    const origin = document.getElementById('origin').value;
    const destination = document.getElementById('destination').value;
    const timeInput = document.getElementById('time').value;
    const timeMode = document.querySelector('input[name="timeMode"]:checked').value;
    const resultsDiv = document.getElementById('results');

    resultsDiv.innerHTML = '';

    if (origin === destination) {
        resultsDiv.innerHTML = '<p class="error">Origin and destination cannot be the same.</p>';
        return;
    }

    const targetTimeSecs = timeToSeconds(timeInput);

    // Check if direct route exists
    const directSegment = findRouteSegment(origin, destination);

    if (directSegment) {
        // Direct Route
        let trips;
        if (timeMode === 'depart') {
            trips = getNextTrips(directSegment, targetTimeSecs, MAX_ROUTE_OPTIONS);
        } else {
            trips = getPreviousTrips(directSegment, targetTimeSecs, MAX_ROUTE_OPTIONS);
        }

        if (trips.length === 0) {
            resultsDiv.innerHTML = '<p class="error">No routes available for the selected time.</p>';
            return;
        }

        trips.forEach((trip, idx) => {
            resultsDiv.innerHTML += `
                <div class="itinerary">
                    <div class="itinerary-header">Option ${idx + 1} (Direct)</div>
                    <div class="step">
                        <span><strong>Depart ${origin}:</strong></span>
                        <span>${secondsToTime(trip.departure)}</span>
                    </div>
                    <div class="step">
                        <span><strong>Arrive ${destination}:</strong></span>
                        <span>${secondsToTime(trip.arrival)}</span>
                    </div>
                </div>
            `;
        });
    } else {
        // Interchange Route (via Sitabuldi)
        const interchange = "Sitabuldi";
        if (origin === interchange || destination === interchange) {
            resultsDiv.innerHTML = '<p class="error">Invalid route configuration.</p>';
            return;
        }

        const leg1 = findRouteSegment(origin, interchange);
        const leg2 = findRouteSegment(interchange, destination);

        if (!leg1 || !leg2) {
            resultsDiv.innerHTML = '<p class="error">Route not found.</p>';
            return;
        }

        let html = '';

        if (timeMode === 'depart') {
            const leg1Trips = getNextTrips(leg1, targetTimeSecs, MAX_ROUTE_OPTIONS);

            if (leg1Trips.length === 0) {
                resultsDiv.innerHTML = '<p class="error">No more initial trains available today.</p>';
                return;
            }

            leg1Trips.forEach((trip1, idx) => {
                // Apply 2 minute (120 seconds) transfer penalty
                const earliestTransferTime = trip1.arrival + 120;
                const leg2Trips = getNextTrips(leg2, earliestTransferTime, 1);

                if (leg2Trips.length > 0) {
                    const trip2 = leg2Trips[0];
                    html += `
                        <div class="itinerary">
                            <div class="itinerary-header">Option ${idx + 1} (1 Interchange)</div>
                            <div class="step">
                                <span><strong>Depart ${origin}:</strong></span>
                                <span>${secondsToTime(trip1.departure)}</span>
                            </div>
                            <div class="step transfer">
                                Arrive at Sitabuldi at ${secondsToTime(trip1.arrival)}<br>
                                <em>Transfer 2 mins</em><br>
                                Catch connecting train at ${secondsToTime(trip2.departure)}
                            </div>
                            <div class="step">
                                <span><strong>Arrive ${destination}:</strong></span>
                                <span>${secondsToTime(trip2.arrival)}</span>
                            </div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="itinerary">
                            <div class="itinerary-header">Option ${idx + 1}</div>
                            <div class="step error">Missed last connecting train for the day.</div>
                        </div>
                    `;
                }
            });
        } else {
            const leg2Trips = getPreviousTrips(leg2, targetTimeSecs, MAX_ROUTE_OPTIONS);

            if (leg2Trips.length === 0) {
                resultsDiv.innerHTML = '<p class="error">No earlier trains available today.</p>';
                return;
            }

            leg2Trips.forEach((trip2, idx) => {
                // Apply 2 minute (120 seconds) transfer penalty backwards
                const latestTransferTime = trip2.departure - 120;
                const leg1Trips = getPreviousTrips(leg1, latestTransferTime, 1);

                if (leg1Trips.length > 0) {
                    const trip1 = leg1Trips[0];
                    html += `
                        <div class="itinerary">
                            <div class="itinerary-header">Option ${idx + 1} (1 Interchange)</div>
                            <div class="step">
                                <span><strong>Depart ${origin}:</strong></span>
                                <span>${secondsToTime(trip1.departure)}</span>
                            </div>
                            <div class="step transfer">
                                Arrive at Sitabuldi at ${secondsToTime(trip1.arrival)}<br>
                                <em>Transfer 2 mins</em><br>
                                Catch connecting train at ${secondsToTime(trip2.departure)}
                            </div>
                            <div class="step">
                                <span><strong>Arrive ${destination}:</strong></span>
                                <span>${secondsToTime(trip2.arrival)}</span>
                            </div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="itinerary">
                            <div class="itinerary-header">Option ${idx + 1}</div>
                            <div class="step error">Missed first connecting train for the day.</div>
                        </div>
                    `;
                }
            });
        }
        resultsDiv.innerHTML = html;
    }
}
