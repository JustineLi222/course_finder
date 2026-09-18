// "In session right now" logic, ported from the Express backend so the site can
// run as a purely static deployment (no localhost:3001, no CORS, no server).
//
// Semantics, matching the original data format:
//   meeting_date entries are DAY/MONTH with no year, e.g. "9/1, 16/1, 23/1".
//   period entries look like "Th 09:30AM - 12:15PM".
// A class is in session when today's day/month is one of its meeting dates AND
// the current wall-clock time falls inside one of its period ranges.

/** "9:30AM" | "09:30AM" | "12:15PM" -> { h, min, text: "HH:MM" } (24-hour) */
export function parseClock(value) {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(value).trim());
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    const period = m[3].toUpperCase();
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return { h, min, text: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
}

/** "Th 09:30AM - 12:15PM" -> { start, end, text } | null */
export function parsePeriod(value) {
    const m = /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i.exec(String(value));
    if (!m) return null;
    const start = parseClock(m[1]);
    const end = parseClock(m[2]);
    if (!start || !end) return null;
    return { start, end, text: `${start.text} - ${end.text}` };
}

/** ["9/1, 16/1", "23/1"] -> [{ day: 9, month: 1 }, ...] (year is ignored) */
export function parseMeetingDates(value) {
    const out = [];
    const chunks = Array.isArray(value) ? value : value == null ? [] : [value];
    for (const chunk of chunks) {
        for (const part of String(chunk).split(",")) {
            const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(part);
            if (!m) continue;
            const day = Number(m[1]);
            const month = Number(m[2]);
            if (day >= 1 && day <= 31 && month >= 1 && month <= 12) out.push({ day, month });
        }
    }
    return out;
}

/** Resolve the instant to test against. `?at=` makes "right now" testable. */
export function resolveNow(at) {
    if (at == null || at === "") return new Date();
    const raw = String(at).trim();

    // Explicit DD/MM[ /YYYY] HH:MM first - JS itself reads "3/4 09:30" as 4 March 2001.
    const dmy = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2}):(\d{2})$/.exec(raw);
    if (dmy) {
        const year = dmy[3]
            ? dmy[3].length === 2
                ? 2000 + Number(dmy[3])
                : Number(dmy[3])
            : new Date().getFullYear();
        return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4]), Number(dmy[5]));
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Returns { timeslot } when the course meets at `now`, otherwise null. */
export function inSession(course, now) {
    if (!course) return null;

    const meetsToday = parseMeetingDates(course.meeting_date).some(
        (d) => d.day === now.getDate() && d.month === now.getMonth() + 1,
    );
    if (!meetsToday) return null;

    const periods = (Array.isArray(course.period) ? course.period : [course.period])
        .map(parsePeriod)
        .filter(Boolean);
    if (periods.length === 0) return null;

    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const hit = periods.find(
        (p) => minutesNow >= p.start.h * 60 + p.start.min && minutesNow < p.end.h * 60 + p.end.min,
    );
    return hit ? { timeslot: hit.text } : null;
}
