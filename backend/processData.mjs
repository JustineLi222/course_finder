import fs from 'fs';
import path from 'path';

const convertTo24Hour = (time) => {
  // Split the time into hours, minutes, and period (AM/PM)
  let [hoursMinutes, period] = time.split(/(AM|PM)/);
  let [hours, minutes] = hoursMinutes.split(':').map(Number);

  // Adjust hours for PM
  if (period === 'PM' && hours !== 12) hours += 12;
  // Adjust hours for 12 AM (midnight)
  if (period === 'AM' && hours === 12) hours = 0;

  // Format to ensure two digits for hours and minutes
  const formattedHours = hours.toString().padStart(2, '0');
  const formattedMinutes = minutes.toString().padStart(2, '0');

  return `${formattedHours}:${formattedMinutes}`;
};
export const processData = (req, res) => {
  const addZeros = (time) => (time < 10 ? `0${time}` : time);
  var today = new Date();
  var dd = String(today.getDate()).padStart(2, '0');
  var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
  var yyyy = today.getFullYear();
  var currentDate = `${dd}/${mm}`
  var currentMs = today.now();

  // Helper function to pad single-digit numbers with a leading zero

  // Helper function to get milliseconds from a date string
  const getMilliSecond = (time) => Date.parse(time);

  // Directory containing course JSON files
  const courseDir = path.join(process.cwd(), 'courses');

  // Read all course JSON files in the directory
  fs.readdir(courseDir, (err, files) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error reading course directory');
    } else {
      const courseList = files.map((file) => path.basename(file, '.json'));
      fetchCourse(courseList);
    }
  });

  // Fetch course data from JSON files
  const fetchCourse = async (courseList) => {
    const selectedCourses = [];
    for (const course of courseList) {
      const filePath = new URL(import.meta.url).pathname;
      const absolutePath = path.join(
        courseDir,
        `${course}.json`
      );
      console.log(absolutePath);
      try {
        const data = await fs.promises.readFile(absolutePath, 'utf-8');
        const courses = JSON.parse(data);
        selectedCourses.push(handleCourse(courses, course));
      } catch (error) {
        console.error(`Error reading file ${absolutePath}:`, error);
      }
    }

    // Flatten and return selected courses
    console.log(`Final selected courses: ${JSON.stringify(selectedCourses)}`);
    res.status(200).json(selectedCourses.flat());
  };

  // Process each course to find matching schedules
  const handleCourse = (courses, courseNamePrefix) => {
    const selectedCourse = [];

    courses.forEach((course) => {

      let meetingDates = course.meeting_date || []; // Ensure meeting_date exists
      meetingDates = meetingDates.map(pairs => {
        return pairs.split(",")
      }).flat().map(date => date.trim())
      const periods = course.period || []; // Ensure period exists


      console.log(`\n\nmeeting Dates ${meetingDates}\n\n periods ${periods}`)
      meetingDates.forEach((meetingDate) => {
        if (meetingDate.includes(currentDate)) {
          const currentMilliSeconds = currentMs; // Current simulated time
          const timeRange = periods[0]; // Assuming the first period
          //   const [start_time, end_time] = timeRange.split(' - ');
          const start_time = convertTo24Hour(timeRange.split(" ")[1]);
          const end_time = convertTo24Hour(timeRange.split(" ")[3]);

          console.log(
            `Processing ${course.course_title}: meetingDate=${meetingDate}, start_time=${start_time}, end_time=${end_time}, now=${currentMilliSeconds}`
          );
          console.log(`${meetingDate} ${start_time}`)
          const startMilliSeconds = new Date(`${meetingDate} ${start_time}`).getTime();
          const endMilliSeconds = new Date(`${meetingDate} ${end_time}`).getTime();
          console.log("startMilliSeconds", startMilliSeconds)
          console.log("endMilliSeconds", endMilliSeconds)
          console.log("currentMilliSeconds", currentMilliSeconds)
          if (startMilliSeconds <= currentMilliSeconds && endMilliSeconds > currentMilliSeconds) {
            console.log('Course is available during the current time slot');
            const formattedCourse = {
              title: course.course_title,
              'course code': `${course.class_code}`,
              timeslot: `${start_time} - ${end_time}`,
              location: course.room[0], // Assuming first room
              professor: course.staff, // Assuming single professor
              quota: course.quota,
              mode: course.mode,
              units: course.units
            };
            selectedCourse.push(formattedCourse);
          }
        }
      });
    });

    return selectedCourse;
  };
};