let metroData = null;

// Populate Dropdowns
function initDropdowns() {
    const stationsSet = new Set();
    metroData.lines.forEach(line => {
        line.directions[0].stations.forEach(s => stationsSet.add(s));
    });

    const stations = Array.from(stationsSet).sort();
    const originSelect = document.getElementById('origin');
    const destSelect = document.getElementById('destination');

    stations.forEach(station => {
        originSelect.add(new Option(station, station));
        destSelect.add(new Option(station, station));
    });

    // Set default destinations
    originSelect.value = "Automotive Square";
    destSelect.value = "Lokmanya Nagar";
}

// Swap Stations Helper
function swapStations() {
    const origin = document.getElementById('origin');
    const dest = document.getElementById('destination');
    const temp = origin.value;
    origin.value = dest.value;
    dest.value = temp;
}

// Initialize Flatpickr
flatpickr("#time", {
    enableTime: true,
    noCalendar: true,
    dateFormat: "H:i",
    altInput: true,
    altFormat: "h:i K",
    time_24hr: false,
    defaultDate: new Date()
});

// Load Data
fetch('routes.json')
    .then(response => response.json())
    .then(data => {
        metroData = data;
        initDropdowns();
    })
    .catch(error => {
        console.error('Error loading routes.json:', error);
        document.getElementById('results').innerHTML = `
            <div class="alert alert-danger d-flex align-items-center" role="alert">
                <i class="bi bi-exclamation-triangle-fill me-2 flex-shrink-0"></i>
                <div>Error loading route data. Please ensure routes.json is available.</div>
            </div>`;
    });

// UI Route Calculation and Rendering
function calculateRoutes() {
    const origin = document.getElementById('origin').value;
    const destination = document.getElementById('destination').value;
    const timeInput = document.getElementById('time').value;
    const timeMode = document.querySelector('input[name="timeMode"]:checked').value;
    const resultsDiv = document.getElementById('results');

    resultsDiv.innerHTML = '';

    const result = planRoutes(metroData, origin, destination, timeInput, timeMode);

    if (result.status === 'same_station') {
        resultsDiv.innerHTML = `
            <div class="alert alert-warning d-flex align-items-center" role="alert">
                <i class="bi bi-exclamation-triangle-fill me-2 flex-shrink-0"></i>
                <div>Origin and destination cannot be the same.</div>
            </div>`;
        return;
    }

    if (result.status === 'invalid_configuration') {
        resultsDiv.innerHTML = `
            <div class="alert alert-danger d-flex align-items-center" role="alert">
                <i class="bi bi-exclamation-triangle-fill me-2 flex-shrink-0"></i>
                <div>Invalid route configuration.</div>
            </div>`;
        return;
    }

    if (result.status === 'route_not_found') {
        resultsDiv.innerHTML = `
            <div class="alert alert-danger d-flex align-items-center" role="alert">
                <i class="bi bi-exclamation-triangle-fill me-2 flex-shrink-0"></i>
                <div>Route not found.</div>
            </div>`;
        return;
    }

    if (result.status === 'no_routes') {
        resultsDiv.innerHTML = `
            <div class="alert alert-warning d-flex align-items-center" role="alert">
                <i class="bi bi-info-circle-fill me-2 flex-shrink-0"></i>
                <div>No routes available for the selected time.</div>
            </div>`;
        return;
    }

    if (result.status === 'no_initial_trains') {
        resultsDiv.innerHTML = `
            <div class="alert alert-warning d-flex align-items-center" role="alert">
                <i class="bi bi-info-circle-fill me-2 flex-shrink-0"></i>
                <div>No more initial trains available today.</div>
            </div>`;
        return;
    }

    if (result.status === 'no_earlier_trains') {
        resultsDiv.innerHTML = `
            <div class="alert alert-warning d-flex align-items-center" role="alert">
                <i class="bi bi-info-circle-fill me-2 flex-shrink-0"></i>
                <div>No earlier trains available today.</div>
            </div>`;
        return;
    }

    if (result.status === 'no_connection_routes') {
        resultsDiv.innerHTML = `
            <div class="alert alert-warning d-flex align-items-center" role="alert">
                <i class="bi bi-info-circle-fill me-2 flex-shrink-0"></i>
                <div>No connection routes available for the selected time.</div>
            </div>`;
        return;
    }

    if (result.status === 'success') {
        let html = '<h5 class="fw-bold mb-3 text-dark d-flex align-items-center gap-2"><i class="bi bi-bezier2 text-metro-orange"></i> Route Options</h5>';

        result.options.forEach((opt, idx) => {
            const isLimitedStops = opt.isLimitedStops;
            const travelTimeMins = opt.travelTimeMins;

            let warningHtml = '';
            if (isLimitedStops) {
                let skipMsg = "This train runs express and skips some intermediate stations.";
                if (opt.isInterchange) {
                    const isLimited1 = opt.legs[0].isLimitedStops;
                    const isLimited2 = opt.legs[1].isLimitedStops;
                    skipMsg = isLimited1 && isLimited2 
                        ? "Both connecting trains run express and skip some intermediate stations."
                        : (isLimited1 ? "The first connecting train runs express and skips some intermediate stations." : "The second connecting train runs express and skips some intermediate stations.");
                }
                warningHtml = `
                    <div class="d-flex align-items-center gap-2 p-3 mb-2 rounded-3" style="background-color: rgba(255, 107, 0, 0.08); border: 1px solid rgba(255, 107, 0, 0.15); color: var(--metro-orange); font-size: 0.85rem; font-weight: 600;">
                        <i class="bi bi-exclamation-triangle-fill"></i>
                        <div>${skipMsg}</div>
                    </div>`;
            }

            let badgesHtml = '';
            if (opt.isInterchange) {
                badgesHtml = `<span class="badge bg-light text-secondary fw-normal border">1 Transfer</span>`;
                if (isLimitedStops) {
                    badgesHtml += ' <span class="badge bg-warning-subtle text-warning-emphasis fw-semibold border border-warning-subtle">Limited Stops</span>';
                }
            } else {
                const badgeText = isLimitedStops ? 'Limited Stops' : 'Direct';
                const badgeClass = isLimitedStops ? 'badge bg-warning-subtle text-warning-emphasis fw-semibold border border-warning-subtle' : 'badge bg-light text-secondary fw-normal border';
                badgesHtml = `<span class="${badgeClass}">${badgeText}</span>`;
            }

            let timelineStepsHtml = '';
            if (!opt.isInterchange) {
                const leg = opt.legs[0];
                const isAqua = leg.line.toLowerCase().includes('aqua');
                const dotClass = isAqua ? 'timeline-dot aqua' : 'timeline-dot';

                timelineStepsHtml = `
                    <!-- Step 1: Origin Boarding -->
                    <div class="timeline-step" style="--line-color: ${isAqua ? 'var(--metro-aqua)' : 'var(--metro-orange)'}">
                        <div class="${dotClass}"></div>
                        <div class="timeline-content">
                            <div class="d-flex align-items-baseline gap-2">
                                <span class="timeline-time">${secondsToTime(leg.departureTimeSecs)}</span>
                                <span class="timeline-station">${leg.fromStation}</span>
                            </div>
                            <div class="text-muted small mt-1 d-flex align-items-center gap-2 flex-wrap fw-semibold">
                                <span>Board</span>
                                <span class="badge-line ${isAqua ? 'badge-aqua-line' : 'badge-orange-line'}">${leg.line}</span>
                                <span class="badge-pf">PF ${leg.fromPlatform}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Step 2: Destination Arrival -->
                    <div class="timeline-step">
                        <div class="${dotClass}"></div>
                        <div class="timeline-content">
                            <div class="d-flex align-items-baseline gap-2">
                                <span class="timeline-time">${secondsToTime(leg.arrivalTimeSecs)}</span>
                                <span class="timeline-station">${leg.toStation}</span>
                            </div>
                            <div class="text-muted small mt-1 d-flex align-items-center gap-2 flex-wrap fw-semibold">
                                <span>Arrive</span>
                                <span class="badge-pf">PF ${leg.toPlatform}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                const leg1 = opt.legs[0];
                const leg2 = opt.legs[1];
                const isAqua1 = leg1.line.toLowerCase().includes('aqua');
                const dotClass1 = isAqua1 ? 'timeline-dot aqua' : 'timeline-dot';
                const isAqua2 = leg2.line.toLowerCase().includes('aqua');
                const dotClass2 = isAqua2 ? 'timeline-dot aqua' : 'timeline-dot';

                timelineStepsHtml = `
                    <!-- Step 1: Origin Boarding -->
                    <div class="timeline-step" style="--line-color: ${isAqua1 ? 'var(--metro-aqua)' : 'var(--metro-orange)'}">
                        <div class="${dotClass1}"></div>
                        <div class="timeline-content">
                            <div class="d-flex align-items-baseline gap-2">
                                <span class="timeline-time">${secondsToTime(leg1.departureTimeSecs)}</span>
                                <span class="timeline-station">${leg1.fromStation}</span>
                            </div>
                            <div class="text-muted small mt-1 d-flex align-items-center gap-2 flex-wrap fw-semibold">
                                <span>Board</span>
                                <span class="badge-line ${isAqua1 ? 'badge-aqua-line' : 'badge-orange-line'}">${leg1.line}</span>
                                <span class="badge-pf">PF ${leg1.fromPlatform}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Step 2: Interchange Arrival -->
                    <div class="timeline-step transfer-walk" style="--line-color: #CBD5E1">
                        <div class="${dotClass1}"></div>
                        <div class="timeline-content">
                            <div class="d-flex align-items-baseline gap-2">
                                <span class="timeline-time text-muted">${secondsToTime(leg1.arrivalTimeSecs)}</span>
                                <span class="timeline-station text-muted">Sitabuldi Interchange</span>
                            </div>
                            <div class="text-muted small mt-1 d-flex align-items-center gap-2 flex-wrap fw-semibold">
                                <span>Arrive</span>
                                <span class="badge-pf">PF ${leg1.toPlatform}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Step 3: Interchange Boarding -->
                    <div class="timeline-step" style="--line-color: ${isAqua2 ? 'var(--metro-aqua)' : 'var(--metro-orange)'}">
                        <div class="${dotClass2}"></div>
                        <div class="timeline-content">
                            <div class="d-flex align-items-baseline gap-2">
                                <span class="timeline-time">${secondsToTime(leg2.departureTimeSecs)}</span>
                                <span class="timeline-station">Sitabuldi Interchange</span>
                            </div>
                            <div class="text-muted small mt-1 d-flex align-items-center gap-2 flex-wrap fw-semibold">
                                <span>Board</span>
                                <span class="badge-line ${isAqua2 ? 'badge-aqua-line' : 'badge-orange-line'}">${leg2.line}</span>
                                <span class="badge-pf">PF ${leg2.fromPlatform}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Step 4: Destination Arrival -->
                    <div class="timeline-step">
                        <div class="${dotClass2}"></div>
                        <div class="timeline-content">
                            <div class="d-flex align-items-baseline gap-2">
                                <span class="timeline-time">${secondsToTime(leg2.arrivalTimeSecs)}</span>
                                <span class="timeline-station">${leg2.toStation}</span>
                            </div>
                            <div class="text-muted small mt-1 d-flex align-items-center gap-2 flex-wrap fw-semibold">
                                <span>Arrive</span>
                                <span class="badge-pf">PF ${leg2.toPlatform}</span>
                            </div>
                        </div>
                    </div>
                `;
            }

            html += `
                <div class="card card-custom route-card mb-3 border-0 animated-fade-in">
                    <div class="card-header bg-transparent border-0 pt-3 pb-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="fs-6 fw-bold text-dark text-nowrap">Option ${idx + 1}</span>
                            <span class="text-dark fw-bold fs-6 text-nowrap"><i class="bi bi-clock-history me-1 text-muted"></i>${travelTimeMins} mins</span>
                        </div>
                        <div class="d-flex gap-2 mt-2 flex-wrap">
                            ${badgesHtml}
                        </div>
                    </div>
                    <div class="card-body pt-2">
                        ${warningHtml}
                        <div class="timeline-container">
                            ${timelineStepsHtml}
                        </div>
                    </div>
                </div>
            `;
        });

        resultsDiv.innerHTML = html;
    }
}
