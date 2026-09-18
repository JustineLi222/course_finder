import fs from 'fs';
import path from 'path';

/**
 * Timeline semantics
 * ------------------
 * `courses/*.json` `meeting_date` entries are DAY/MONTH with no year, e.g. "9/1, 16/1, 23/1"
 * means 9 Jan, 16 Jan, 23 Jan (the 2025-26 term spans a year boundary, so the year is not
 * part of the key). `period` entries look like "Th 09:30AM - 12:15PM".
 *
 * An entry is "in session now" when today's day/month is one of the meeting dates AND the
 * current wall-clock time falls in one of the period ranges.
 */

/** "9:30AM" | "09:30AM" | "12:15PM" -> { h, min, text: "HH:MM" } (24-hour) */
const parseClock = (value) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(value).trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return { h, min, text: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` };
};

/** "Th 09:30AM - 12:15PM" -> { start, end, text } | null */
const parsePeriod = (value) => {
  const m = /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i.exec(String(value));
  if (!m) return null;
  const start = parseClock(m[1]);
  const end = parseClock(m[2]);
  if (!start || !end) return null;
  return { start, end, text: `${start.text} - ${end.text}` };
};

/** ["9/1, 16/1", "23/1"] -> [{ day: 9, month: 1 }, ...] (day/month, year ignored) */
const parseMeetingDates = (value) => {
  const out = [];
  const chunks = Array.isArray(value) ? value : value == null ? [] : [value];
  for (const chunk of chunks) {
    for (const part of String(chunk).split(',')) {
      const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(part);
      if (!m) continue;
      const day = Number(m[1]);
      const month = Number(m[2]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) out.push({ day, month });
    }
  }
  return out;
};

/** Resolve the instant to test against. `?at=` makes "right now" testable. */
const resolveNow = (at) => {
  if (at == null || at === '') return new Date();
  const raw = String(at).trim();

  // Explicit DD/MM[ /YYYY] HH:MM first — JS's own parser reads "3/4 09:30" as 4 March 2001.
  const dmy = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2}):(\d{2})$/.exec(raw);
  if (dmy) {
    const year = dmy[3]
      ? (dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]))
      : new Date().getFullYear();
    return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4]), Number(dmy[5]));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Does this course meet at `now`? Returns the formatted row, or null. */
const matchCourse = (course, now) => {
  if (!course || typeof course !== 'object') return null;

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
  if (!hit) return null;

  return {
    title: course.course_title,
    // Both spellings: App.svelte reads "course code", Card.svelte destructures course_code.
    'course code': `${course.class_code}`,
    course_code: `${course.class_code}`,
    timeslot: hit.text,
    location: (course.room ?? [])[0],
    professor: course.staff,
    quota: course.quota,
    mode: course.mode,
    units: course.units,
  };
};

export const processData = async (req, res) => {
  const now = resolveNow(req.query.at);
  if (!now) {
    return res.status(400).json({ error: 'Invalid ?at= — use ISO or "DD/MM HH:MM".' });
  }

  const courseDir = path.join(process.cwd(), 'courses');

  let files;
  try {
    files = await fs.promises.readdir(courseDir);
  } catch (err) {
    console.error(`Cannot read ${courseDir}: ${err.message}`);
    return res.status(500).send('Error reading course directory');
  }

  const selectedCourses = [];
  let brokenFiles = 0;

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    let courses;
    try {
      courses = JSON.parse(await fs.promises.readFile(path.join(courseDir, file), 'utf-8'));
    } catch (err) {
      brokenFiles += 1;
      console.error(`Skipping ${file}: ${err.message}`);
      continue;
    }
    if (!Array.isArray(courses)) continue;
    for (const course of courses) {
      const row = matchCourse(course, now);
      if (row) selectedCourses.push(row);
    }
  }

  const stamp = now.toISOString();
  console.log(
    `[courses] at=${stamp} files=${files.length} matches=${selectedCourses.length}` +
      (brokenFiles ? ` unreadable=${brokenFiles}` : ''),
  );

  res.status(200).json(selectedCourses);
};
