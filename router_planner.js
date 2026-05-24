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

// Get calculated departure and arrival times for a trip at specific stations
function getTripTimes(dir, departure, fromIdx, toIdx) {
    let depTimeStr;
    let skippedStations = [];
    let customOffsets = {};

    if (typeof departure === 'object' && departure !== null) {
        depTimeStr = departure.departure_time;
        skippedStations = departure.skipped_stations || [];
        customOffsets = departure.custom_offsets || {};
    } else {
        depTimeStr = departure;
    }

    const fromStation = dir.stations[fromIdx];
    const toStation = dir.stations[toIdx];

    // If either the origin or destination station is skipped/not serviced, this trip is not usable
    if (skippedStations.includes(fromStation) || skippedStations.includes(toStation)) {
        return null;
    }

    const trainStartSecs = timeToSeconds(depTimeStr);

    const fromOffset = customOffsets[fromStation] !== undefined
        ? customOffsets[fromStation]
        : dir.travel_time_offsets_seconds[fromIdx];

    const toOffset = customOffsets[toStation] !== undefined
        ? customOffsets[toStation]
        : dir.travel_time_offsets_seconds[toIdx];

    return {
        departure: trainStartSecs + fromOffset,
        arrival: trainStartSecs + toOffset
    };
}

// Get the next N trips for a specific segment starting after a given time
function getNextTrips(segment, startTimeSecs, count = MAX_ROUTE_OPTIONS) {
    const trips = [];

    for (let departure of segment.dir.departures) {
        const tripTimes = getTripTimes(segment.dir, departure, segment.fromIdx, segment.toIdx);
        if (!tripTimes) continue;

        if (tripTimes.departure >= startTimeSecs) {
            trips.push({
                departure: tripTimes.departure,
                arrival: tripTimes.arrival,
                tripInfo: typeof departure === 'object' ? departure : null
            });
            if (trips.length >= count) break;
        }
    }
    return trips;
}

// Get the previous N trips for a specific segment arriving before a given time
function getPreviousTrips(segment, endTimeSecs, count = MAX_ROUTE_OPTIONS) {
    const trips = [];

    // Iterate backwards to get the latest possible trips that arrive before the target time
    for (let i = segment.dir.departures.length - 1; i >= 0; i--) {
        const departure = segment.dir.departures[i];
        const tripTimes = getTripTimes(segment.dir, departure, segment.fromIdx, segment.toIdx);
        if (!tripTimes) continue;

        if (tripTimes.arrival <= endTimeSecs) {
            trips.push({
                departure: tripTimes.departure,
                arrival: tripTimes.arrival,
                tripInfo: typeof departure === 'object' ? departure : null
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

        // Sort trips by arrival time
        trips.sort((a, b) => a.arrival - b.arrival);

        let html = '<h5 class="fw-bold mb-4 text-secondary"><i class="bi bi-list-task me-2"></i>Route Options</h5>';
        const isAqua = directSegment.line.toLowerCase().includes('aqua');
        const dotClass = isAqua ? 'timeline-dot aqua' : 'timeline-dot';

        trips.forEach((trip, idx) => {
            const isLimitedStops = trip.tripInfo && trip.tripInfo.skipped_stations && trip.tripInfo.skipped_stations.length > 0;
            const badgeText = isLimitedStops ? 'Limited Stops' : 'Direct';
            const badgeClass = isLimitedStops ? 'badge bg-warning-subtle text-warning-emphasis ms-2 fw-semibold border border-warning-subtle' : 'badge bg-light text-secondary ms-2 fw-normal border';
            const travelTimeMins = Math.round((trip.arrival - trip.departure) / 60);

            let warningHtml = '';
            if (isLimitedStops) {
                warningHtml = `
                    <div class="alert alert-warning py-2 px-3 mb-3 d-flex align-items-center border-0 rounded-3" style="font-size: 0.85rem;">
                        <i class="bi bi-info-circle-fill text-warning me-2 flex-shrink-0"></i>
                        <div>This train runs express and skips some intermediate stations.</div>
                    </div>`;
            }

            html += `
                <div class="card card-custom mb-4 border-0">
                    <div class="card-header bg-white border-0 pt-3 pb-0 d-flex justify-content-between align-items-center">
                        <h6 class="fw-bold mb-0 text-metro-orange">Option ${idx + 1} <span class="${badgeClass}">${badgeText}</span></h6>
                        <span class="text-secondary fw-semibold"><i class="bi bi-clock me-1"></i>${travelTimeMins} mins</span>
                    </div>
                    <div class="card-body pt-3">
                        ${warningHtml}
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
                                    <div class="text-muted small mt-1">Arrive at <strong>Platform ${directSegment.dir.platforms[directSegment.toIdx]}</strong></div>
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

            const options = [];
            leg1Trips.forEach((trip1) => {
                // Apply 2 minute (120 seconds) transfer penalty
                const earliestTransferTime = trip1.arrival + 120;
                const leg2Trips = getNextTrips(leg2, earliestTransferTime, 1);

                if (leg2Trips.length > 0) {
                    options.push({ trip1, trip2: leg2Trips[0] });
                }
            });

            if (options.length === 0) {
                resultsDiv.innerHTML = `
                    <div class="alert alert-warning d-flex align-items-center" role="alert">
                        <i class="bi bi-info-circle-fill me-2 flex-shrink-0"></i>
                        <div>No connection routes available for the selected time.</div>
                    </div>`;
                return;
            }

            // Sort options by leg2 arrival time
            options.sort((a, b) => a.trip2.arrival - b.trip2.arrival);

            options.forEach((opt, idx) => {
                const trip1 = opt.trip1;
                const trip2 = opt.trip2;
                const isAqua1 = leg1.line.toLowerCase().includes('aqua');
                const dotClass1 = isAqua1 ? 'timeline-dot aqua' : 'timeline-dot';
                const isAqua2 = leg2.line.toLowerCase().includes('aqua');
                const dotClass2 = isAqua2 ? 'timeline-dot aqua' : 'timeline-dot';

                const isLimited1 = trip1.tripInfo && trip1.tripInfo.skipped_stations && trip1.tripInfo.skipped_stations.length > 0;
                const isLimited2 = trip2.tripInfo && trip2.tripInfo.skipped_stations && trip2.tripInfo.skipped_stations.length > 0;

                const travelTimeMins = Math.round((trip2.arrival - trip1.departure) / 60);
                let badgesHtml = `<span class="badge bg-light text-secondary ms-2 fw-normal border">1 Transfer</span>`;
                if (isLimited1 || isLimited2) {
                    badgesHtml += ' <span class="badge bg-warning-subtle text-warning-emphasis ms-2 fw-semibold border border-warning-subtle">Limited Stops</span>';
                }

                let warningHtml = '';
                if (isLimited1 || isLimited2) {
                    const skipMsg = isLimited1 && isLimited2 
                        ? "Both connecting trains run express and skip some intermediate stations."
                        : (isLimited1 ? "The first connecting train runs express and skips some intermediate stations." : "The second connecting train runs express and skips some intermediate stations.");
                    warningHtml = `
                        <div class="alert alert-warning py-2 px-3 mb-3 d-flex align-items-center border-0 rounded-3" style="font-size: 0.85rem;">
                            <i class="bi bi-info-circle-fill text-warning me-2 flex-shrink-0"></i>
                            <div>${skipMsg}</div>
                        </div>`;
                }

                html += `
                    <div class="card card-custom mb-4 border-0">
                        <div class="card-header bg-white border-0 pt-3 pb-0 d-flex justify-content-between align-items-center">
                            <h6 class="fw-bold mb-0 text-metro-orange">Option ${idx + 1} ${badgesHtml}</h6>
                            <span class="text-secondary fw-semibold"><i class="bi bi-clock me-1"></i>${travelTimeMins} mins</span>
                        </div>
                        <div class="card-body pt-3">
                            ${warningHtml}
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
                                            Arrive at <strong>Platform ${leg1.dir.platforms[leg1.toIdx]}</strong><br>
                                            <i class="bi bi-arrow-repeat ${isAqua2 ? 'text-metro-aqua' : 'text-metro-orange'} me-1"></i> Transfer Time: 2 mins<br>
                                            <span class="text-dark fw-medium mt-1 d-inline-block">Next train at ${secondsToTime(trip2.departure)} on ${leg2.line} from <strong>Platform ${leg2.dir.platforms[leg2.fromIdx]}</strong></span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="timeline-step">
                                    <div class="${dotClass2}"></div>
                                    <div class="timeline-content">
                                        <div class="timeline-time fs-5">${secondsToTime(trip2.arrival)}</div>
                                        <div class="timeline-station fw-bold">${destination}</div>
                                        <div class="text-muted small mt-1">Arrive at <strong>Platform ${leg2.dir.platforms[leg2.toIdx]}</strong></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
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

            const options = [];
            leg2Trips.forEach((trip2) => {
                // Apply 2 minute (120 seconds) transfer penalty backwards
                const latestTransferTime = trip2.departure - 120;
                const leg1Trips = getPreviousTrips(leg1, latestTransferTime, 1);

                if (leg1Trips.length > 0) {
                    options.push({ trip1: leg1Trips[0], trip2 });
                }
            });

            if (options.length === 0) {
                resultsDiv.innerHTML = `
                    <div class="alert alert-warning d-flex align-items-center" role="alert">
                        <i class="bi bi-info-circle-fill me-2 flex-shrink-0"></i>
                        <div>No connection routes available for the selected time.</div>
                    </div>`;
                return;
            }

            // Sort options by leg2 arrival time
            options.sort((a, b) => a.trip2.arrival - b.trip2.arrival);

            options.forEach((opt, idx) => {
                const trip1 = opt.trip1;
                const trip2 = opt.trip2;
                const isAqua1 = leg1.line.toLowerCase().includes('aqua');
                const dotClass1 = isAqua1 ? 'timeline-dot aqua' : 'timeline-dot';
                const isAqua2 = leg2.line.toLowerCase().includes('aqua');
                const dotClass2 = isAqua2 ? 'timeline-dot aqua' : 'timeline-dot';

                const isLimited1 = trip1.tripInfo && trip1.tripInfo.skipped_stations && trip1.tripInfo.skipped_stations.length > 0;
                const isLimited2 = trip2.tripInfo && trip2.tripInfo.skipped_stations && trip2.tripInfo.skipped_stations.length > 0;

                const travelTimeMins = Math.round((trip2.arrival - trip1.departure) / 60);
                let badgesHtml = `<span class="badge bg-light text-secondary ms-2 fw-normal border">1 Transfer</span>`;
                if (isLimited1 || isLimited2) {
                    badgesHtml += ' <span class="badge bg-warning-subtle text-warning-emphasis ms-2 fw-semibold border border-warning-subtle">Limited Stops</span>';
                }

                let warningHtml = '';
                if (isLimited1 || isLimited2) {
                    const skipMsg = isLimited1 && isLimited2 
                        ? "Both connecting trains run express and skip some intermediate stations."
                        : (isLimited1 ? "The first connecting train runs express and skips some intermediate stations." : "The second connecting train runs express and skips some intermediate stations.");
                    warningHtml = `
                        <div class="alert alert-warning py-2 px-3 mb-3 d-flex align-items-center border-0 rounded-3" style="font-size: 0.85rem;">
                            <i class="bi bi-info-circle-fill text-warning me-2 flex-shrink-0"></i>
                            <div>${skipMsg}</div>
                        </div>`;
                }

                html += `
                    <div class="card card-custom mb-4 border-0">
                        <div class="card-header bg-white border-0 pt-3 pb-0 d-flex justify-content-between align-items-center">
                            <h6 class="fw-bold mb-0 text-metro-orange">Option ${idx + 1} ${badgesHtml}</h6>
                            <span class="text-secondary fw-semibold"><i class="bi bi-clock me-1"></i>${travelTimeMins} mins</span>
                        </div>
                        <div class="card-body pt-3">
                            ${warningHtml}
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
                                            Arrive at <strong>Platform ${leg1.dir.platforms[leg1.toIdx]}</strong><br>
                                            <i class="bi bi-arrow-repeat ${isAqua2 ? 'text-metro-aqua' : 'text-metro-orange'} me-1"></i> Transfer Time: 2 mins<br>
                                            <span class="text-dark fw-medium mt-1 d-inline-block">Next train at ${secondsToTime(trip2.departure)} on ${leg2.line} from <strong>Platform ${leg2.dir.platforms[leg2.fromIdx]}</strong></span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="timeline-step">
                                    <div class="${dotClass2}"></div>
                                    <div class="timeline-content">
                                        <div class="timeline-time fs-5">${secondsToTime(trip2.arrival)}</div>
                                        <div class="timeline-station fw-bold">${destination}</div>
                                        <div class="text-muted small mt-1">Arrive at <strong>Platform ${leg2.dir.platforms[leg2.toIdx]}</strong></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        resultsDiv.innerHTML = html;
    }
}
