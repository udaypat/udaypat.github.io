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
function findRouteSegment(metroData, from, to) {
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
function planRoutes(metroData, origin, destination, timeInput, timeMode) {
    if (origin === destination) {
        return { status: 'same_station' };
    }

    const targetTimeSecs = timeToSeconds(timeInput);

    // Check if direct route exists
    const directSegment = findRouteSegment(metroData, origin, destination);

    if (directSegment) {
        // Direct Route
        let trips;
        if (timeMode === 'depart') {
            trips = getNextTrips(directSegment, targetTimeSecs, MAX_ROUTE_OPTIONS);
        } else {
            trips = getPreviousTrips(directSegment, targetTimeSecs, MAX_ROUTE_OPTIONS);
        }

        if (trips.length === 0) {
            return { status: 'no_routes' };
        }

        // Sort trips by arrival time
        trips.sort((a, b) => a.arrival - b.arrival);

        const options = trips.map(trip => {
            const isLimitedStops = trip.tripInfo && trip.tripInfo.skipped_stations && trip.tripInfo.skipped_stations.length > 0;
            return {
                isInterchange: false,
                travelTimeMins: Math.round((trip.arrival - trip.departure) / 60),
                isLimitedStops: isLimitedStops,
                legs: [
                    {
                        line: directSegment.line,
                        fromStation: origin,
                        toStation: destination,
                        departureTimeSecs: trip.departure,
                        arrivalTimeSecs: trip.arrival,
                        fromPlatform: directSegment.dir.platforms[directSegment.fromIdx],
                        toPlatform: directSegment.dir.platforms[directSegment.toIdx],
                        isLimitedStops: isLimitedStops,
                        tripInfo: trip.tripInfo
                    }
                ]
            };
        });

        return { status: 'success', options };
    } else {
        // Interchange Route (via Sitabuldi)
        const interchange = "Sitabuldi";
        if (origin === interchange || destination === interchange) {
            return { status: 'invalid_configuration' };
        }

        const leg1 = findRouteSegment(metroData, origin, interchange);
        const leg2 = findRouteSegment(metroData, interchange, destination);

        if (!leg1 || !leg2) {
            return { status: 'route_not_found' };
        }

        if (timeMode === 'depart') {
            const leg1Trips = getNextTrips(leg1, targetTimeSecs, MAX_ROUTE_OPTIONS);

            if (leg1Trips.length === 0) {
                return { status: 'no_initial_trains' };
            }

            const options = [];
            leg1Trips.forEach((trip1) => {
                // Apply 2 minute (120 seconds) transfer penalty
                const earliestTransferTime = trip1.arrival + 120;
                const leg2Trips = getNextTrips(leg2, earliestTransferTime, 1);

                if (leg2Trips.length > 0) {
                    const trip2 = leg2Trips[0];
                    const isLimited1 = trip1.tripInfo && trip1.tripInfo.skipped_stations && trip1.tripInfo.skipped_stations.length > 0;
                    const isLimited2 = trip2.tripInfo && trip2.tripInfo.skipped_stations && trip2.tripInfo.skipped_stations.length > 0;
                    options.push({
                        isInterchange: true,
                        travelTimeMins: Math.round((trip2.arrival - trip1.departure) / 60),
                        isLimitedStops: isLimited1 || isLimited2,
                        legs: [
                            {
                                line: leg1.line,
                                fromStation: origin,
                                toStation: interchange,
                                departureTimeSecs: trip1.departure,
                                arrivalTimeSecs: trip1.arrival,
                                fromPlatform: leg1.dir.platforms[leg1.fromIdx],
                                toPlatform: leg1.dir.platforms[leg1.toIdx],
                                isLimitedStops: isLimited1,
                                tripInfo: trip1.tripInfo
                            },
                            {
                                line: leg2.line,
                                fromStation: interchange,
                                toStation: destination,
                                departureTimeSecs: trip2.departure,
                                arrivalTimeSecs: trip2.arrival,
                                fromPlatform: leg2.dir.platforms[leg2.fromIdx],
                                toPlatform: leg2.dir.platforms[leg2.toIdx],
                                isLimitedStops: isLimited2,
                                tripInfo: trip2.tripInfo
                            }
                        ]
                    });
                }
            });

            if (options.length === 0) {
                return { status: 'no_connection_routes' };
            }

            // Sort options by leg2 arrival time
            options.sort((a, b) => a.legs[1].arrivalTimeSecs - b.legs[1].arrivalTimeSecs);
            return { status: 'success', options };
        } else {
            const leg2Trips = getPreviousTrips(leg2, targetTimeSecs, MAX_ROUTE_OPTIONS);

            if (leg2Trips.length === 0) {
                return { status: 'no_earlier_trains' };
            }

            const options = [];
            leg2Trips.forEach((trip2) => {
                // Apply 2 minute (120 seconds) transfer penalty backwards
                const latestTransferTime = trip2.departure - 120;
                const leg1Trips = getPreviousTrips(leg1, latestTransferTime, 1);

                if (leg1Trips.length > 0) {
                    const trip1 = leg1Trips[0];
                    const isLimited1 = trip1.tripInfo && trip1.tripInfo.skipped_stations && trip1.tripInfo.skipped_stations.length > 0;
                    const isLimited2 = trip2.tripInfo && trip2.tripInfo.skipped_stations && trip2.tripInfo.skipped_stations.length > 0;
                    options.push({
                        isInterchange: true,
                        travelTimeMins: Math.round((trip2.arrival - trip1.departure) / 60),
                        isLimitedStops: isLimited1 || isLimited2,
                        legs: [
                            {
                                line: leg1.line,
                                fromStation: origin,
                                toStation: interchange,
                                departureTimeSecs: trip1.departure,
                                arrivalTimeSecs: trip1.arrival,
                                fromPlatform: leg1.dir.platforms[leg1.fromIdx],
                                toPlatform: leg1.dir.platforms[leg1.toIdx],
                                isLimitedStops: isLimited1,
                                tripInfo: trip1.tripInfo
                            },
                            {
                                line: leg2.line,
                                fromStation: interchange,
                                toStation: destination,
                                departureTimeSecs: trip2.departure,
                                arrivalTimeSecs: trip2.arrival,
                                fromPlatform: leg2.dir.platforms[leg2.fromIdx],
                                toPlatform: leg2.dir.platforms[leg2.toIdx],
                                isLimitedStops: isLimited2,
                                tripInfo: trip2.tripInfo
                            }
                        ]
                    });
                }
            });

            if (options.length === 0) {
                return { status: 'no_connection_routes' };
            }

            // Sort options by leg2 arrival time
            options.sort((a, b) => a.legs[1].arrivalTimeSecs - b.legs[1].arrivalTimeSecs);
            return { status: 'success', options };
        }
    }
}
