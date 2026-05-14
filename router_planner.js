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
        resultsDiv.innerHTML = `
            <div class="alert alert-warning d-flex align-items-center" role="alert">
                <i class="bi bi-exclamation-triangle-fill me-2 flex-shrink-0"></i>
                <div>Origin and destination cannot be the same.</div>
            </div>`;
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
            resultsDiv.innerHTML = `
                <div class="alert alert-warning d-flex align-items-center" role="alert">
                    <i class="bi bi-info-circle-fill me-2 flex-shrink-0"></i>
                    <div>No routes available for the selected time.</div>
                </div>`;
            return;
        }

        let html = '<h5 class="fw-bold mb-4 text-secondary"><i class="bi bi-list-task me-2"></i>Route Options</h5>';
        const isAqua = directSegment.line.toLowerCase().includes('aqua');
        const dotClass = isAqua ? 'timeline-dot aqua' : 'timeline-dot';

        trips.forEach((trip, idx) => {
            html += `
                <div class="card card-custom mb-4 border-0">
                    <div class="card-header bg-white border-0 pt-3 pb-0">
                        <h6 class="fw-bold mb-0 text-metro-orange">Option ${idx + 1} <span class="badge bg-light text-secondary ms-2 fw-normal border">Direct</span></h6>
                    </div>
                    <div class="card-body pt-3">
                        <div class="timeline-container">
                            <div class="timeline-line"></div>
                            
                            <div class="timeline-step">
                                <div class="${dotClass}"></div>
                                <div class="timeline-content">
                                    <div class="timeline-time fs-5">${secondsToTime(trip.departure)}</div>
                                    <div class="timeline-station fw-bold">${origin}</div>
                                    <div class="text-muted small mt-1">Board ${directSegment.line} from <strong>Platform ${directSegment.dir.platforms[directSegment.fromIdx]}</strong></div>
                                </div>
                            </div>
                            
                            <div class="timeline-step">
                                <div class="${dotClass}"></div>
                                <div class="timeline-content">
                                    <div class="timeline-time fs-5">${secondsToTime(trip.arrival)}</div>
                                    <div class="timeline-station fw-bold">${destination}</div>
                                    <div class="text-muted small mt-1">Destination</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        resultsDiv.innerHTML = html;
    } else {
        // Interchange Route (via Sitabuldi)
        const interchange = "Sitabuldi";
        if (origin === interchange || destination === interchange) {
            resultsDiv.innerHTML = `
                <div class="alert alert-danger d-flex align-items-center" role="alert">
                    <i class="bi bi-exclamation-triangle-fill me-2 flex-shrink-0"></i>
                    <div>Invalid route configuration.</div>
                </div>`;
            return;
        }

        const leg1 = findRouteSegment(origin, interchange);
        const leg2 = findRouteSegment(interchange, destination);

        if (!leg1 || !leg2) {
            resultsDiv.innerHTML = `
                <div class="alert alert-danger d-flex align-items-center" role="alert">
                    <i class="bi bi-exclamation-triangle-fill me-2 flex-shrink-0"></i>
                    <div>Route not found.</div>
                </div>`;
            return;
        }

        let html = '<h5 class="fw-bold mb-4 text-secondary"><i class="bi bi-list-task me-2"></i>Route Options</h5>';

        if (timeMode === 'depart') {
            const leg1Trips = getNextTrips(leg1, targetTimeSecs, MAX_ROUTE_OPTIONS);

            if (leg1Trips.length === 0) {
                resultsDiv.innerHTML = `
                    <div class="alert alert-warning d-flex align-items-center" role="alert">
                        <i class="bi bi-info-circle-fill me-2 flex-shrink-0"></i>
                        <div>No more initial trains available today.</div>
                    </div>`;
                return;
            }

            leg1Trips.forEach((trip1, idx) => {
                // Apply 2 minute (120 seconds) transfer penalty
                const earliestTransferTime = trip1.arrival + 120;
                const leg2Trips = getNextTrips(leg2, earliestTransferTime, 1);

                if (leg2Trips.length > 0) {
                    const trip2 = leg2Trips[0];
                    const isAqua1 = leg1.line.toLowerCase().includes('aqua');
                    const dotClass1 = isAqua1 ? 'timeline-dot aqua' : 'timeline-dot';
                    const isAqua2 = leg2.line.toLowerCase().includes('aqua');
                    const dotClass2 = isAqua2 ? 'timeline-dot aqua' : 'timeline-dot';

                    html += `
                        <div class="card card-custom mb-4 border-0">
                            <div class="card-header bg-white border-0 pt-3 pb-0">
                                <h6 class="fw-bold mb-0 text-metro-orange">Option ${idx + 1} <span class="badge bg-light text-secondary ms-2 fw-normal border">1 Transfer</span></h6>
                            </div>
                            <div class="card-body pt-3">
                                <div class="timeline-container">
                                    <div class="timeline-line"></div>
                                    
                                    <div class="timeline-step">
                                        <div class="${dotClass1}"></div>
                                        <div class="timeline-content">
                                            <div class="timeline-time fs-5">${secondsToTime(trip1.departure)}</div>
                                            <div class="timeline-station fw-bold">${origin}</div>
                                            <div class="text-muted small mt-1">Board ${leg1.line} from <strong>Platform ${leg1.dir.platforms[leg1.fromIdx]}</strong></div>
                                        </div>
                                    </div>

                                    <div class="timeline-step my-3">
                                        <div class="timeline-dot transfer"></div>
                                        <div class="timeline-content">
                                            <div class="timeline-time fw-semibold">${secondsToTime(trip1.arrival)}</div>
                                            <div class="timeline-station fw-bold text-dark">Sitabuldi Interchange</div>
                                            <div class="transfer-details shadow-sm">
                                                <i class="bi bi-arrow-repeat text-metro-orange me-1"></i> Transfer Time: 2 mins<br>
                                                <span class="text-dark fw-medium mt-1 d-inline-block">Next train at ${secondsToTime(trip2.departure)} on ${leg2.line} from <strong>Platform ${leg2.dir.platforms[leg2.fromIdx]}</strong></span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="timeline-step">
                                        <div class="${dotClass2}"></div>
                                        <div class="timeline-content">
                                            <div class="timeline-time fs-5">${secondsToTime(trip2.arrival)}</div>
                                            <div class="timeline-station fw-bold">${destination}</div>
                                            <div class="text-muted small mt-1">Destination</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="card card-custom mb-4 border-0">
                            <div class="card-body">
                                <h6 class="fw-bold mb-2">Option ${idx + 1}</h6>
                                <div class="text-danger"><i class="bi bi-x-circle me-1"></i>Missed last connecting train for the day.</div>
                            </div>
                        </div>
                    `;
                }
            });
        } else {
            const leg2Trips = getPreviousTrips(leg2, targetTimeSecs, MAX_ROUTE_OPTIONS);

            if (leg2Trips.length === 0) {
                resultsDiv.innerHTML = `
                    <div class="alert alert-warning d-flex align-items-center" role="alert">
                        <i class="bi bi-info-circle-fill me-2 flex-shrink-0"></i>
                        <div>No earlier trains available today.</div>
                    </div>`;
                return;
            }

            leg2Trips.forEach((trip2, idx) => {
                // Apply 2 minute (120 seconds) transfer penalty backwards
                const latestTransferTime = trip2.departure - 120;
                const leg1Trips = getPreviousTrips(leg1, latestTransferTime, 1);

                if (leg1Trips.length > 0) {
                    const trip1 = leg1Trips[0];
                    const isAqua1 = leg1.line.toLowerCase().includes('aqua');
                    const dotClass1 = isAqua1 ? 'timeline-dot aqua' : 'timeline-dot';
                    const isAqua2 = leg2.line.toLowerCase().includes('aqua');
                    const dotClass2 = isAqua2 ? 'timeline-dot aqua' : 'timeline-dot';

                    html += `
                        <div class="card card-custom mb-4 border-0">
                            <div class="card-header bg-white border-0 pt-3 pb-0">
                                <h6 class="fw-bold mb-0 text-metro-orange">Option ${idx + 1} <span class="badge bg-light text-secondary ms-2 fw-normal border">1 Transfer</span></h6>
                            </div>
                            <div class="card-body pt-3">
                                <div class="timeline-container">
                                    <div class="timeline-line"></div>
                                    
                                    <div class="timeline-step">
                                        <div class="${dotClass1}"></div>
                                        <div class="timeline-content">
                                            <div class="timeline-time fs-5">${secondsToTime(trip1.departure)}</div>
                                            <div class="timeline-station fw-bold">${origin}</div>
                                            <div class="text-muted small mt-1">Board ${leg1.line} from <strong>Platform ${leg1.dir.platforms[leg1.fromIdx]}</strong></div>
                                        </div>
                                    </div>

                                    <div class="timeline-step my-3">
                                        <div class="timeline-dot transfer"></div>
                                        <div class="timeline-content">
                                            <div class="timeline-time fw-semibold">${secondsToTime(trip1.arrival)}</div>
                                            <div class="timeline-station fw-bold text-dark">Sitabuldi Interchange</div>
                                            <div class="transfer-details shadow-sm">
                                                <i class="bi bi-arrow-repeat text-metro-orange me-1"></i> Transfer Time: 2 mins<br>
                                                <span class="text-dark fw-medium mt-1 d-inline-block">Next train at ${secondsToTime(trip2.departure)} on ${leg2.line} from <strong>Platform ${leg2.dir.platforms[leg2.fromIdx]}</strong></span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="timeline-step">
                                        <div class="${dotClass2}"></div>
                                        <div class="timeline-content">
                                            <div class="timeline-time fs-5">${secondsToTime(trip2.arrival)}</div>
                                            <div class="timeline-station fw-bold">${destination}</div>
                                            <div class="text-muted small mt-1">Destination</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="card card-custom mb-4 border-0">
                            <div class="card-body">
                                <h6 class="fw-bold mb-2">Option ${idx + 1}</h6>
                                <div class="text-danger"><i class="bi bi-x-circle me-1"></i>Missed first connecting train for the day.</div>
                            </div>
                        </div>
                    `;
                }
            });
        }
        resultsDiv.innerHTML = html;
    }
}
