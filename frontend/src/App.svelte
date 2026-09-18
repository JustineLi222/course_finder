<script>
    import SearchBar from "./SearchBar.svelte";
    import MdLocationOn from "svelte-icons/md/MdLocationOn.svelte";
    import Card from "./Card.svelte";
    import { coord } from "./Coord.js";
    import { resolveNow, inSession } from "./courseTime.js";

    let currentLocation = null;
    let search_bar_question = "";
    let allCourses = [];
    let filteredCourses = [];
    let distanceRange = 1000; // Default 1000 meters
    // Distance is a refinement, not a gate. When you are off campus you still want to
    // know what is running right now, so this defaults to OFF and only the checkbox
    // turns it into a filter.
    let nearMeOnly = false;
    // The catalogue carries every term, so the user picks which one to look at.
    // Defaults to whichever term actually has a class meeting right now.
    let catalogue = [];          // every class, all terms, as fetched
    let availableTerms = [];     // [{ code, label, count }]
    let selectedTerm = "";
    let nowDate = new Date();
    $: selectedTermLabel =
        (availableTerms.find((t) => t.code === selectedTerm) || {}).label || "";
    // Live clock, so it is obvious which time slot the list is showing.
    let nowLabel = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setInterval(() => {
        nowLabel = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }, 30000);
    // Track "have we finished loading?" separately from "did we get results?".
    // Using allCourses.length as the loading test made an empty result set spin forever.
    let loaded = false;
    let loadError = "";

    // Calculate slider percentage for dynamic background
    $: sliderPercent = ((distanceRange - 100) / (5000 - 100)) * 100;

    /** Recompute "in session" for the currently selected term. */
    function applyTerm() {
        const live = [];
        for (const c of catalogue) {
            if (selectedTerm && c.term !== selectedTerm) continue;
            const hit = inSession(c, nowDate);
            if (!hit) continue;
            live.push({
                title: c.course_title,
                "course code": c.class_code,
                course_code: c.class_code,
                timeslot: hit.timeslot,
                location: (c.room || [])[0],
                professor: c.staff,
                quota: c.quota,
                mode: c.mode,
                units: c.units,
            });
        }
        allCourses = live;
        filteredCourses = live;
        return live;
    }

    function handleTermChange() {
        applyTerm();
    }

    async function getCourses() {
        // The deployment is static, so the whole catalogue is loaded from a sibling
        // JSON file and "in session" is decided here in the browser. This removes the
        // old hardcoded http://localhost:3001 dependency (which never worked in prod).
        // ?at=2026-02-05T15:00 (or "5/2 15:00") still time-travels.
        const at = new URLSearchParams(window.location.search).get("at");
        const now = resolveNow(at);
        if (!now) {
            loadError = 'Invalid ?at= - use ISO or "DD/MM HH:MM".';
            allCourses = [];
            filteredCourses = [];
            loaded = true;
            return [];
        }
        nowDate = now;

        try {
            const res = await fetch("courses.json", { cache: "no-cache" });
            if (!res.ok) throw new Error(`courses.json responded ${res.status}`);
            catalogue = await res.json();

            const seen = new Map();
            for (const c of catalogue) {
                if (!c.term) continue;
                if (!seen.has(c.term)) {
                    seen.set(c.term, {
                        code: c.term,
                        label: c.term_label || c.term,
                        count: 0,
                    });
                }
                seen.get(c.term).count += 1;
            }
            availableTerms = [...seen.values()].sort((a, b) =>
                String(a.code).localeCompare(String(b.code)),
            );

            // Prefer a term that actually has something on right now, so the page is
            // never empty for no visible reason; otherwise fall back to the first term.
            const withLive = availableTerms.find((t) =>
                catalogue.some((c) => c.term === t.code && inSession(c, now)),
            );
            selectedTerm = withLive
                ? withLive.code
                : availableTerms.length
                  ? availableTerms[0].code
                  : "";

            return applyTerm();
        } catch (err) {
            loadError = err && err.message ? err.message : String(err);
            allCourses = [];
            filteredCourses = [];
            return [];
        } finally {
            loaded = true;
        }
    }

    let coursesPromise = getCourses();
    let locationPromise = new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
            },
            () => {
                resolve({
                    lat: 0,
                    lng: 0,
                });
            },
        );
    });

    function handleSearch() {
        let searchTerm = search_bar_question.toLowerCase();
        console.log("Searching for:", searchTerm);
        if (allCourses.length === 0) {
            filteredCourses = [];
            return;
        }
        // Text search always applies; the distance test only when explicitly enabled.
        filteredCourses = allCourses.filter(
            (course) =>
                is_search_bar_question(course, searchTerm) &&
                (!nearMeOnly ||
                    getNearbyCoursesByMeter(
                        currentLocation,
                        distanceRange,
                        course["location"],
                    )),
        );
    }

    // Function to format distance display
    function formatDistance(meters) {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km`;
        }
        return `${meters} m`;
    }

    // Update results when distance changes
    function handleDistanceChange() {
        handleSearch();
    }

    const is_search_bar_question = (course, searchTerm) => {
        console.log("searching for", searchTerm);
        if (!searchTerm || searchTerm == undefined) return true;

        const courseCode = course["course code"].toLowerCase();
        const courseTitle = course.title.toLowerCase();
        const professor = course.professor.toLowerCase();

        if (
            courseCode.startsWith(searchTerm) ||
            courseTitle.includes(searchTerm) ||
            professor.includes(searchTerm)
        ) {
            return true;
        }

        return false;
    };

    const getNearbyCoursesByMeter = (currentlocation, dist_in_meters, room) => {
        // Check if currentlocation is null or undefined
        if (!currentlocation || !currentlocation.lat) return true;

        let loc = room.split("_")[0];
        const [lat2, lng2] = coord[loc]
            ? coord[loc].replace("(", "").replace(")", "").split(", ")
            : [0, 0];

        // Haversine formula
        const R = 6371; // Earth's radius in kilometers
        const lat1 = currentlocation.lat;
        const lon1 = currentlocation.lng;

        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lng2 - lon1) * Math.PI) / 180;

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // Distance in kilometers

        // If dist is in meters, convert distance to meters for comparison
        const distanceInMeters = distance * 1000;

        console.log(
            `Distance to ${loc}: ${distanceInMeters.toFixed(2)} meters`,
        );

        return distanceInMeters <= dist_in_meters;
    };

    // Initialize data when promises resolve
    Promise.all([coursesPromise, locationPromise]).then(
        ([courses, location]) => {
            currentLocation = location;
            console.log("Location set:", location);
        },
    );
</script>

<div class="app-container">
    <!-- Header Section -->
    <div class="header">
        <h1 class="title">Course Finder</h1>
        <p class="subtitle">
            {selectedTermLabel ? `${selectedTermLabel} · ` : ""}in session at {nowLabel}
        </p>
    </div>

    <!-- Search Section -->
    <div class="search-section">
        <SearchBar bind:search_bar_question onSearch={handleSearch} />

        <!-- Controls Container -->
        <div class="controls-container">
            <!-- Term Control -->
            <div class="term-control">
                <label for="term-select" class="control-label">Term</label>
                <select
                    id="term-select"
                    class="term-select"
                    bind:value={selectedTerm}
                    on:change={handleTermChange}
                >
                    {#each availableTerms as t (t.code)}
                        <option value={t.code}>{t.label}</option>
                    {/each}
                </select>
            </div>

            <!-- Distance Range Control -->
            <div class="distance-control">
                <div class="control-header">
                    <label for="distance-range" class="control-label">
                        Search Range
                    </label>
                    <span class="range-value"
                        >{formatDistance(distanceRange)}</span
                    >
                </div>
                <label class="near-toggle">
                    <input
                        type="checkbox"
                        bind:checked={nearMeOnly}
                        on:change={handleDistanceChange}
                    />
                    <span>Only show courses within range</span>
                </label>
                <input
                    type="range"
                    id="distance-range"
                    min="100"
                    max="5000"
                    step="100"
                    bind:value={distanceRange}
                    on:change={handleDistanceChange}
                    on:input={handleDistanceChange}
                    class="range-slider"
                    disabled={!nearMeOnly}
                    style="--slider-percent: {sliderPercent}%"
                />
                <div class="range-labels">
                    <span>100m</span>
                    <span>5km</span>
                </div>
                <button
                    class="reset-btn"
                    on:click={() => {
                        distanceRange = 1000;
                        handleDistanceChange();
                    }}
                >
                    Reset to 1km
                </button>
            </div>

            <!-- Location Display -->
            <div class="location-display">
                <div class="location-header">
                    <div class="location-icon">
                        <MdLocationOn />
                    </div>
                    <span class="location-label">Current Location</span>
                </div>
                <div class="location-coords">
                    {currentLocation
                        ? `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`
                        : "Detecting location..."}
                </div>
                <div
                    class="location-status {currentLocation
                        ? 'active'
                        : 'inactive'}"
                >
                    {currentLocation
                        ? "Location detected"
                        : "Unable to detect location"}
                </div>
            </div>
        </div>
    </div>

    <!-- Results Section -->
    <div class="results-section">
        {#if loaded}
            <div class="results-header">
                <h2 class="results-title">
                    {filteredCourses.length > 0
                        ? `Found ${filteredCourses.length} course${filteredCourses.length === 1 ? "" : "s"}`
                        : loadError
                          ? "Couldn't load courses"
                          : allCourses.length === 0
                            ? "No courses in session"
                            : "No courses found"}
                </h2>
                {#if filteredCourses.length > 0 && (search_bar_question || nearMeOnly)}
                    <p class="results-subtitle">
                        {search_bar_question
                            ? `Matching "${search_bar_question}"`
                            : ""}
                        {search_bar_question && nearMeOnly ? " · " : ""}
                        {nearMeOnly
                            ? `Within ${formatDistance(distanceRange)}`
                            : ""}
                    </p>
                {/if}
            </div>

            {#if filteredCourses.length > 0}
                <div class="card-container">
                    {#key search_bar_question + distanceRange + nearMeOnly}
                        {#each filteredCourses as course}
                            <Card
                                card={{
                                    course_code: course["course code"],
                                    title: course["title"],
                                    timeslot: course["timeslot"],
                                    location: course["location"],
                                    professor: course["professor"],
                                    mode: course["mode"],
                                    quota: course["quota"],
                                    units: course["units"],
                                }}
                            />
                        {/each}
                    {/key}
                </div>
            {:else}
                <div class="empty-state">
                    <div class="empty-icon">{loadError ? "⚠️" : "🔍"}</div>
                    {#if loadError}
                        <h3>Couldn't load the timetable</h3>
                        <p>{loadError}</p>
                    {:else if allCourses.length === 0}
                        <h3>Nothing on right now in {selectedTermLabel || "this term"}</h3>
                        <p>
                            No class in this term meets on
                            {nowDate.getDate()}/{nowDate.getMonth() + 1} at {nowLabel}.
                            Try another term above, or jump to a date with ?at=.
                        </p>
                    {:else}
                        <h3>No courses found</h3>
                        <p>
                            {nearMeOnly
                                ? "Nothing within range. Uncheck \u201cOnly show courses within range\u201d to see everything in session."
                                : "Try adjusting your search criteria."}
                        </p>
                    {/if}
                </div>
            {/if}
        {:else}
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Loading courses...</p>
            </div>
        {/if}
    </div>
</div>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
    }

    .app-container {
        /* max-width: 1200px; */
        width: 100%;
        margin: 0 auto;
        padding: 1rem 2rem 2rem 2rem;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            sans-serif;
    }

    .header {
    
        text-align: center;
        margin-bottom: 1rem;
        color: white;
    }

    .title {
        font-size: 2.5rem;
        font-weight: 700;
        margin: 0 0 0.5rem 0;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .subtitle {
        font-size: 1.1rem;
        margin: 0;
        opacity: 0.9;
    }

    .search-section {
        background: white;
        border-radius: 16px;
        padding: 4rem;
        margin-bottom: 2rem;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    }

    .controls-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2rem;
        margin-top: 1.5rem;
    }

    .distance-control {
        background: #f8fafc;
        border-radius: 12px;
        padding: 1.5rem;
        border: 1px solid #e2e8f0;
    }

    .control-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .control-label {
        font-weight: 600;
        color: #374151;
        font-size: 0.95rem;
    }

    .range-value {
        background: #3b82f6;
        color: white;
        padding: 0.25rem 0.75rem;
        border-radius: 20px;
        font-size: 0.85rem;
        font-weight: 600;
    }

    .range-slider {
        width: 100%;
        height: 6px;
        margin: 1rem 0;
        border-radius: 3px;
        appearance: none;
        -webkit-appearance: none;
        cursor: pointer;
        outline: none;
        background: linear-gradient(
            to right,
            #3b82f6 0%,
            #3b82f6 var(--slider-percent, 20%),
            #e5e7eb var(--slider-percent, 20%),
            #e5e7eb 100%
        );
        transition: background 0.1s ease;
    }

    .range-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 20px;
        height: 20px;
        background: #3b82f6;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
        transition: all 0.2s ease;
        border: 2px solid white;
    }

    .range-slider::-webkit-slider-thumb:hover {
        background: #2563eb;
        transform: scale(1.1);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.6);
    }

    .range-slider::-webkit-slider-thumb:active {
        transform: scale(1.15);
        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.8);
    }

    .range-slider::-moz-range-thumb {
        width: 20px;
        height: 20px;
        background: #3b82f6;
        border-radius: 50%;
        cursor: pointer;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
        transition: all 0.2s ease;
    }

    .range-slider::-moz-range-thumb:hover {
        background: #2563eb;
        transform: scale(1.1);
    }

    .range-slider::-webkit-slider-runnable-track {
        width: 100%;
        height: 6px;
        cursor: pointer;
        background: transparent;
        border-radius: 3px;
    }

    .range-slider::-moz-range-track {
        width: 100%;
        height: 6px;
        cursor: pointer;
        background: transparent;
        border-radius: 3px;
        border: none;
    }

    .range-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: #6b7280;
        margin-bottom: 1rem;
    }

    /* Term picker - the catalogue holds more than one term. */
    .term-control {
        margin-bottom: 1.25rem;
    }

    .term-select {
        width: 100%;
        padding: 0.55rem 0.75rem;
        font-size: 0.95rem;
        color: #111827;
        background: #fff;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        cursor: pointer;
    }

    .term-select:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }

    /* Distance is opt-in, so the slider is inert until the box is ticked. */
    .near-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: #374151;
        cursor: pointer;
        margin-bottom: 0.75rem;
        user-select: none;
    }

    .near-toggle input {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: #3b82f6;
    }

    .range-slider:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .range-slider:disabled::-webkit-slider-thumb {
        cursor: not-allowed;
    }

    .reset-btn {
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        padding: 0.5rem 1rem;
        font-size: 0.85rem;
        color: #374151;
        cursor: pointer;
        transition: all 0.2s ease;
        width: 100%;
    }

    .reset-btn:hover {
        background: #e5e7eb;
        border-color: #9ca3af;
    }

    .reset-btn:active {
        background: #d1d5db;
        transform: translateY(1px);
    }

    .location-display {
        background: #f8fafc;
        border-radius: 12px;
        padding: 1.5rem;
        border: 1px solid #e2e8f0;
    }

    .location-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }

    .location-icon {
        width: 20px;
        height: 20px;
        color: #ef4444;
    }

    .location-label {
        font-weight: 600;
        color: #374151;
        font-size: 0.95rem;
    }

    .location-coords {
        font-family: "Monaco", "Menlo", monospace;
        font-size: 0.85rem;
        color: #6b7280;
        background: white;
        padding: 0.75rem;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
        margin-bottom: 0.75rem;
    }

    .location-status {
        font-size: 0.8rem;
        padding: 0.25rem 0.75rem;
        border-radius: 20px;
        text-align: center;
        font-weight: 500;
    }

    .location-status.active {
        background: #dcfce7;
        color: #166534;
    }

    .location-status.inactive {
        background: #fef2f2;
        color: #991b1b;
    }

    .results-section {
        background: white;
        border-radius: 16px;
        padding: 2rem;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    }

    .results-header {
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #e5e7eb;
    }

    .results-title {
        font-size: 1.5rem;
        font-weight: 600;
        color: #111827;
        margin: 0 0 0.5rem 0;
    }

    .results-subtitle {
        color: #6b7280;
        margin: 0;
        font-size: 0.95rem;
    }

    .card-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 1.5rem;
    }

    .empty-state {
        text-align: center;
        padding: 3rem 1rem;
        color: #6b7280;
    }

    .empty-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
    }

    .empty-state h3 {
        font-size: 1.25rem;
        color: #374151;
        margin: 0 0 0.5rem 0;
    }

    .empty-state p {
        margin: 0;
        font-size: 0.95rem;
    }

    .loading-state {
        text-align: center;
        padding: 3rem 1rem;
        color: #6b7280;
    }

    .loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f4f6;
        border-top: 4px solid #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 1rem;
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    /* Responsive Design */
    @media (max-width: 768px) {
        .app-container {
            padding: 1rem;
        }

        .controls-container {
            grid-template-columns: 1fr;
            gap: 1rem;
        }

        .title {
            font-size: 2rem;
        }

        .card-container {
            grid-template-columns: 1fr;
        }

        .search-section,
        .results-section {
            padding: 1.5rem;
        }
    }

    @media (max-width: 480px) {
        .app-container {
            padding: 0.5rem;
        }

        .search-section,
        .results-section {
            padding: 1rem;
        }

        .distance-control,
        .location-display {
            padding: 1rem;
        }
    }
    .range-slider {
        width: 100%;
        height: 6px;
        margin: 1rem 0;
        border-radius: 3px;
        appearance: none;
        -webkit-appearance: none;
        cursor: pointer;
        outline: none;
        background: linear-gradient(
            to right,
            #3b82f6 0%,
            #3b82f6 var(--slider-percent, 20%),
            #e5e7eb var(--slider-percent, 20%),
            #e5e7eb 100%
        );
        transition: background 0.1s ease;
    }

    .range-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 20px;
        height: 20px;
        background: #3b82f6;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
        transition: all 0.2s ease;
        border: 2px solid white;
        /* Fix the vertical alignment */
        margin-top: -7px; /* (thumb height - track height) / 2 = (20 - 6) / 2 = 7px */
    }

    .range-slider::-webkit-slider-thumb:hover {
        background: #2563eb;
        transform: scale(1.1);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.6);
    }

    .range-slider::-webkit-slider-thumb:active {
        transform: scale(1.15);
        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.8);
    }

    .range-slider::-moz-range-thumb {
        width: 20px;
        height: 20px;
        background: #3b82f6;
        border-radius: 50%;
        cursor: pointer;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
        transition: all 0.2s ease;
        /* Firefox specific alignment */
        margin-top: 0;
    }

    .range-slider::-moz-range-thumb:hover {
        background: #2563eb;
        transform: scale(1.1);
    }

    .range-slider::-webkit-slider-runnable-track {
        width: 100%;
        height: 6px;
        cursor: pointer;
        background: transparent;
        border-radius: 3px;
    }

    .range-slider::-moz-range-track {
        width: 100%;
        height: 6px;
        cursor: pointer;
        background: transparent;
        border-radius: 3px;
        border: none;
    }
</style>
