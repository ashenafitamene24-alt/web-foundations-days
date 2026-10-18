-- ============================================================
-- Day 6: School Database Schema, Sample Data, and Queries
-- Compatible with SQLite (sqliteonline.com, SQLite 3)
-- ============================================================

-- Enable foreign key constraint enforcement in SQLite
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. Table Definitions
-- ------------------------------------------------------------

-- Table: students
-- Stores basic identity and contact information for students.
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

-- Table: courses
-- Stores academic course offerings and codes.
CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL
);

-- Table: enrolments
-- Associative table (join table) connecting students and courses,
-- holding the relationship-specific attribute (grade).
CREATE TABLE enrolments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (student_id, course_id)
);

-- ------------------------------------------------------------
-- 2. Sample Data Insertion
-- ------------------------------------------------------------

-- Insert at least 3 students (inserting 4 so one has no enrolments)
INSERT INTO students (name, email) VALUES
('Alice Johnson', 'alice.johnson@example.com'),
('Bob Smith', 'bob.smith@example.com'),
('Charlie Davis', 'charlie.davis@example.com'),
('Diana Prince', 'diana.prince@example.com');

-- Insert at least 3 courses
INSERT INTO courses (code, title) VALUES
('CS101', 'Introduction to Computer Science'),
('WEB201', 'Web Foundations & Development'),
('DB301', 'Database Systems & SQL');

-- Insert at least 5 enrolments
-- Alice takes CS101 and WEB201
-- Bob takes CS101 and DB301
-- Charlie takes WEB201
-- (Diana has 0 enrolments)
INSERT INTO enrolments (student_id, course_id, grade) VALUES
(1, 1, 'A'),
(1, 2, 'B+'),
(2, 1, 'A-'),
(2, 3, 'B'),
(3, 2, 'A');

-- ------------------------------------------------------------
-- 3. Required Queries
-- ------------------------------------------------------------

-- Query 1: All courses for one student (by name)
SELECT 
    students.name AS student_name,
    courses.code AS course_code,
    courses.title AS course_title,
    enrolments.grade
FROM students
JOIN enrolments ON students.id = enrolments.student_id
JOIN courses ON enrolments.course_id = courses.id
WHERE students.name = 'Alice Johnson';

-- Query 2: All students on one course (by course title)
SELECT 
    courses.title AS course_title,
    students.name AS student_name,
    students.email AS student_email,
    enrolments.grade
FROM courses
JOIN enrolments ON courses.id = enrolments.course_id
JOIN students ON enrolments.student_id = students.id
WHERE courses.title = 'Web Foundations & Development';

-- Query 3: The number of students per course
SELECT 
    courses.code AS course_code,
    courses.title AS course_title,
    COUNT(enrolments.student_id) AS student_count
FROM courses
LEFT JOIN enrolments ON courses.id = enrolments.course_id
GROUP BY courses.id, courses.code, courses.title;

-- Query 4: Students who have no enrolments
SELECT 
    students.id AS student_id,
    students.name AS student_name,
    students.email AS student_email
FROM students
LEFT JOIN enrolments ON students.id = enrolments.student_id
WHERE enrolments.id IS NULL;

-- Query 5: An update of one enrolment's grade
UPDATE enrolments
SET grade = 'A+'
WHERE student_id = 1 AND course_id = 2;

-- Verify the updated enrolment
SELECT 
    students.name AS student_name,
    courses.title AS course_title,
    enrolments.grade AS updated_grade
FROM enrolments
JOIN students ON enrolments.student_id = students.id
JOIN courses ON enrolments.course_id = courses.id
WHERE enrolments.student_id = 1 AND enrolments.course_id = 2;
